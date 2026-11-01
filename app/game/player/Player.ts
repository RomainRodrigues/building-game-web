import * as THREE from 'three/webgpu'
import { CONFIG } from '../config'
import type { RAPIER, RapierModule } from '../physics/rapier'
import { createAvatar } from './avatar'

/**
 * Intentions du joueur pour UN tick de simulation.
 * C'est exactement ce qu'un client enverrait à un serveur en multijoueur.
 */
export interface PlayerCommand {
  /** -1..1 : reculer / avancer */
  forward: number
  /** -1..1 : gauche / droite */
  right: number
  jump: boolean
  sprint: boolean
  /** Orientation horizontale de la visée (radians). */
  yaw: number
}

const P = CONFIG.player
const HALF_HEIGHT = P.height / 2
/** Demi-hauteur de la partie cylindrique de la capsule. */
const CAPSULE_HALF_SEGMENT = HALF_HEIGHT - P.radius
/** En dessous de cette vitesse au carré, on considère que le joueur ne se déplace pas. */
const MIN_MOVE_SQ = 1e-2
/** Tolérances pour la compensation de pente. */
const SLOPE_EPSILON = 1e-3
const SLOPE_MIN_RATIO = 0.95
/** Échelle de temps du contrôle aérien (réactivité à 1/10 s). */
const AIR_CONTROL_RATE = 10
/**
 * Jeu laissé sous les pieds à l'apparition. Le character controller de Rapier
 * ne sait pas sortir d'une pénétration : un joueur posé pile au contact du sol
 * (à la marge `controllerOffset` près) peut s'enfoncer à travers.
 */
const SPAWN_CLEARANCE = 0.1

/**
 * Joueur piloté par le "kinematic character controller" de Rapier :
 * on calcule un déplacement voulu, Rapier le corrige (murs, pentes, marches).
 *
 * La position simulée (`position`, centre de la capsule) avance par ticks ;
 * la position affichée (`renderFeet`) est interpolée entre deux ticks.
 */
export class Player {
  readonly mesh: THREE.Group
  readonly collider: RAPIER.Collider
  /** Centre de la capsule au tick courant. */
  readonly position = new THREE.Vector3()
  /** Pieds du joueur, interpolés pour l'affichage. */
  readonly renderFeet = new THREE.Vector3()

  private readonly body: RAPIER.RigidBody
  private readonly controller: RAPIER.KinematicCharacterController
  private readonly spawn: THREE.Vector3
  private readonly previous = new THREE.Vector3()
  private readonly velocity = new THREE.Vector3()
  private readonly wish = new THREE.Vector3()
  private readonly desired = { x: 0, y: 0, z: 0 }
  private grounded = false
  private facing = 0

  constructor(scene: THREE.Scene, rapier: RapierModule, physics: RAPIER.World, spawnFeet: THREE.Vector3) {
    this.spawn = spawnFeet.clone()
    this.placeAtSpawn()

    this.body = physics.createRigidBody(
      rapier.RigidBodyDesc.kinematicPositionBased().setTranslation(this.position.x, this.position.y, this.position.z),
    )
    this.collider = physics.createCollider(rapier.ColliderDesc.capsule(CAPSULE_HALF_SEGMENT, P.radius), this.body)

    this.controller = physics.createCharacterController(P.controllerOffset)
    this.controller.setUp({ x: 0, y: 1, z: 0 })
    this.controller.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(P.maxSlopeDeg))
    // Au-delà de cet angle seulement, on glisse : on reste immobile sur une rampe.
    this.controller.setMinSlopeSlideAngle(THREE.MathUtils.degToRad(P.minSlopeSlideDeg))
    this.controller.enableAutostep(P.autostepMaxHeight, P.autostepMinWidth, false)
    this.controller.enableSnapToGround(P.snapToGroundDistance)

    this.mesh = createAvatar()
    scene.add(this.mesh)
    this.render(1, 0)
  }

  get feetY() {
    return this.position.y - HALF_HEIGHT
  }

  get horizontalSpeed() {
    return Math.hypot(this.velocity.x, this.velocity.z)
  }

  /** Avance la simulation d'un tick. */
  update(cmd: PlayerCommand, dt: number) {
    this.previous.copy(this.position)
    this.computeWishVelocity(cmd)
    this.integrateVelocity(cmd, dt)
    this.move(dt)

    if (this.position.y < CONFIG.world.killY) this.respawn()
    this.body.setNextKinematicTranslation(this.position)

    if (this.wish.lengthSq() > MIN_MOVE_SQ) this.facing = Math.atan2(-this.wish.x, -this.wish.z)
  }

  /** Met à jour l'affichage à partir de la position interpolée. */
  render(alpha: number, frameDt: number) {
    this.renderFeet.lerpVectors(this.previous, this.position, alpha)
    this.renderFeet.y -= HALF_HEIGHT
    this.mesh.position.copy(this.renderFeet)

    // Rotation douce vers la direction de déplacement (par le plus court chemin).
    const current = this.mesh.rotation.y
    const delta = Math.atan2(Math.sin(this.facing - current), Math.cos(this.facing - current))
    this.mesh.rotation.y = current + delta * Math.min(1, frameDt * P.turnSpeed)
  }

  /** Place instantanément les pieds à `feetY` (ex : sol posé sous le joueur). */
  liftFeetTo(feetY: number) {
    this.position.y = feetY + HALF_HEIGHT
    this.previous.y = this.position.y
    this.velocity.y = Math.max(0, this.velocity.y)
    this.body.setNextKinematicTranslation(this.position)
  }

  respawn() {
    this.placeAtSpawn()
    this.velocity.set(0, 0, 0)
    this.body.setNextKinematicTranslation(this.position)
  }

  private placeAtSpawn() {
    this.position.set(this.spawn.x, this.spawn.y + SPAWN_CLEARANCE + HALF_HEIGHT, this.spawn.z)
    this.previous.copy(this.position)
  }

  /** Vitesse horizontale voulue, relative à l'orientation de la visée. */
  private computeWishVelocity(cmd: PlayerCommand) {
    const sin = Math.sin(cmd.yaw)
    const cos = Math.cos(cmd.yaw)
    this.wish.set(-sin * cmd.forward + cos * cmd.right, 0, -cos * cmd.forward - sin * cmd.right)
    if (this.wish.lengthSq() > 1) this.wish.normalize()
    const speed = cmd.sprint && cmd.forward > 0 ? P.sprintSpeed : P.walkSpeed
    this.wish.multiplyScalar(speed)
  }

  private integrateVelocity(cmd: PlayerCommand, dt: number) {
    if (this.grounded) {
      this.velocity.x = this.wish.x
      this.velocity.z = this.wish.z
      this.velocity.y = cmd.jump ? P.jumpVelocity : P.groundStickVelocity
      return
    }
    const k = Math.min(1, P.airControl * dt * AIR_CONTROL_RATE)
    this.velocity.x += (this.wish.x - this.velocity.x) * k
    this.velocity.z += (this.wish.z - this.velocity.z) * k
    this.velocity.y += CONFIG.world.gravity * dt
  }

  private move(dt: number) {
    const desired = this.desired
    desired.x = this.velocity.x * dt
    desired.y = this.velocity.y * dt
    desired.z = this.velocity.z * dt

    this.controller.computeColliderMovement(this.collider, desired)
    let move = this.controller.computedMovement()

    // En montée, Rapier projette le mouvement sur la pente : à 45° on perdrait
    // ~50 % de vitesse horizontale. On recalcule avec un déplacement agrandi
    // pour garder la même vitesse au sol qu'à plat (comme dans les jeux du genre).
    const wanted = Math.hypot(desired.x, desired.z)
    const got = Math.hypot(move.x, move.z)
    if (this.grounded && move.y > SLOPE_EPSILON && got > SLOPE_EPSILON && got < wanted * SLOPE_MIN_RATIO) {
      const k = Math.min(wanted / got, P.maxSlopeBoost)
      desired.x *= k
      desired.z *= k
      this.controller.computeColliderMovement(this.collider, desired)
      move = this.controller.computedMovement()
    }

    this.grounded = this.controller.computedGrounded()
    // Plafond touché : on annule la vitesse verticale.
    if (this.velocity.y > 0 && move.y < desired.y * 0.5) this.velocity.y = 0

    this.position.x += move.x
    this.position.y += move.y
    this.position.z += move.z
  }
}
