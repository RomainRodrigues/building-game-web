import * as THREE from 'three/webgpu'
import type RAPIER from '@dimforge/rapier3d-compat'
import { CONFIG } from '../config'

type Rapier = typeof RAPIER

/** Commandes du joueur pour UN tick. C'est exactement ce qu'on enverrait à un serveur en multi. */
export interface PlayerCommand {
  /** -1..1 : avancer / reculer */
  forward: number
  /** -1..1 : droite / gauche */
  right: number
  jump: boolean
  sprint: boolean
  /** Orientation horizontale de la caméra (radians). */
  yaw: number
}

const P = CONFIG.player
const HALF_HEIGHT = P.height / 2 - P.radius // demi-hauteur de la partie cylindrique

/**
 * Joueur contrôlé par un "kinematic character controller" Rapier :
 * on calcule le déplacement voulu, Rapier le corrige (murs, pentes, marches).
 */
export class Player {
  readonly mesh: THREE.Group
  readonly body: RAPIER.RigidBody
  readonly collider: RAPIER.Collider
  private readonly controller: RAPIER.KinematicCharacterController

  /** Position du centre de la capsule au tick précédent / courant (pour l'interpolation). */
  private readonly prevPos = new THREE.Vector3()
  readonly pos = new THREE.Vector3()
  /** Position affichée (interpolée). */
  readonly renderPos = new THREE.Vector3()

  private readonly velocity = new THREE.Vector3()
  grounded = false
  private facing = 0

  constructor(scene: THREE.Scene, rapier: Rapier, private readonly physics: RAPIER.World, spawn: THREE.Vector3) {
    this.pos.copy(spawn).setY(spawn.y + P.height / 2)
    this.prevPos.copy(this.pos)
    this.renderPos.copy(this.pos)

    this.body = physics.createRigidBody(
      rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(this.pos.x, this.pos.y, this.pos.z),
    )
    this.collider = physics.createCollider(rapier.ColliderDesc.capsule(HALF_HEIGHT, P.radius), this.body)

    this.controller = physics.createCharacterController(0.02)
    this.controller.setUp({ x: 0, y: 1, z: 0 })
    this.controller.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(P.maxSlopeDeg))
    this.controller.setMinSlopeSlideAngle(THREE.MathUtils.degToRad(P.maxSlopeDeg + 5))
    this.controller.enableAutostep(0.45, 0.2, false)
    this.controller.enableSnapToGround(0.4)
    this.controller.setApplyImpulsesToDynamicBodies(true)

    this.mesh = createAvatar()
    scene.add(this.mesh)
  }

  /** Avance la simulation d'un tick. */
  update(cmd: PlayerCommand, dt: number) {
    this.prevPos.copy(this.pos)

    // Direction voulue dans le plan horizontal, relative à la caméra.
    const sin = Math.sin(cmd.yaw)
    const cos = Math.cos(cmd.yaw)
    const wish = new THREE.Vector3(
      -sin * cmd.forward + cos * cmd.right,
      0,
      -cos * cmd.forward - sin * cmd.right,
    )
    if (wish.lengthSq() > 1) wish.normalize()
    const speed = cmd.sprint && cmd.forward > 0 ? P.sprintSpeed : P.walkSpeed
    wish.multiplyScalar(speed)

    if (this.grounded) {
      this.velocity.x = wish.x
      this.velocity.z = wish.z
      this.velocity.y = cmd.jump ? P.jumpVelocity : -1 // légère pression vers le sol
    } else {
      // Contrôle réduit en l'air.
      const k = Math.min(1, P.airControl * dt * 10)
      this.velocity.x += (wish.x - this.velocity.x) * k
      this.velocity.z += (wish.z - this.velocity.z) * k
      this.velocity.y += CONFIG.world.gravity * dt
    }

    const desired = { x: this.velocity.x * dt, y: this.velocity.y * dt, z: this.velocity.z * dt }
    this.controller.computeColliderMovement(this.collider, desired)
    let move = this.controller.computedMovement()

    // Sur une pente, Rapier projette le mouvement sur le plan incliné : à 45°
    // on perdrait ~50 % de vitesse horizontale. On relance le calcul avec un
    // déplacement agrandi pour garder la même vitesse au sol qu'à plat.
    const wanted = Math.hypot(desired.x, desired.z)
    const got = Math.hypot(move.x, move.z)
    if (this.grounded && move.y > 0.001 && got > 1e-4 && got < wanted * 0.95) {
      const k = Math.min(wanted / got, 2)
      this.controller.computeColliderMovement(this.collider, { x: desired.x * k, y: desired.y, z: desired.z * k })
      move = this.controller.computedMovement()
    }

    this.grounded = this.controller.computedGrounded()

    // Plafond touché : on coupe la vitesse verticale.
    if (this.velocity.y > 0 && move.y < desired.y * 0.5) this.velocity.y = 0

    this.pos.set(this.pos.x + move.x, this.pos.y + move.y, this.pos.z + move.z)

    // Filet de sécurité si on tombe hors de la carte.
    if (this.pos.y < -30) {
      this.pos.set(CONFIG.build.tile / 2, 5, CONFIG.build.tile / 2)
      this.prevPos.copy(this.pos)
      this.velocity.set(0, 0, 0)
    }

    this.body.setNextKinematicTranslation(this.pos)

    if (wish.lengthSq() > 0.01) this.facing = Math.atan2(-wish.x, -wish.z)
  }

  /** Met à jour le mesh à partir de la position interpolée. */
  render(alpha: number, frameDt: number) {
    this.renderPos.lerpVectors(this.prevPos, this.pos, alpha)
    this.mesh.position.set(this.renderPos.x, this.renderPos.y - P.height / 2, this.renderPos.z)
    // Rotation douce vers la direction de déplacement.
    const diff = Math.atan2(Math.sin(this.facing - this.mesh.rotation.y), Math.cos(this.facing - this.mesh.rotation.y))
    this.mesh.rotation.y += diff * Math.min(1, frameDt * 14)
  }

  /** Remonte le joueur (ex : sol posé sous ses pieds). Pas d'interpolation pour éviter un "glissement". */
  liftFeetTo(feetY: number) {
    this.pos.y = feetY + P.height / 2
    this.prevPos.y = this.pos.y
    if (this.velocity.y < 0) this.velocity.y = 0
    this.body.setNextKinematicTranslation(this.pos)
  }

  /** Position des pieds (bas de la capsule). */
  get feetY() {
    return this.pos.y - P.height / 2
  }

  get horizontalSpeed() {
    return Math.hypot(this.velocity.x, this.velocity.z)
  }
}

/** Petit avatar "low poly" en primitives, en attendant un vrai modèle glTF. */
function createAvatar() {
  const g = new THREE.Group()
  const bodyMat = new THREE.MeshStandardMaterial({ color: '#ff7a3d', roughness: 0.6 })
  const darkMat = new THREE.MeshStandardMaterial({ color: '#273046', roughness: 0.7 })
  const skinMat = new THREE.MeshStandardMaterial({ color: '#f1c7a1', roughness: 0.8 })

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.33, 0.55, 4, 12), bodyMat)
  torso.position.y = 1.05
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), skinMat)
  head.position.y = 1.6
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.1), darkMat)
  visor.position.set(0, 1.63, -0.2)
  const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.35, 4, 12), darkMat)
  legs.position.y = 0.45
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.45, 0.2), darkMat)
  pack.position.set(0, 1.1, 0.33)

  for (const m of [torso, head, visor, legs, pack]) {
    m.castShadow = true
    g.add(m)
  }
  return g
}
