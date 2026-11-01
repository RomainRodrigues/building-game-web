import * as THREE from 'three/webgpu'
import { CONFIG } from '../config'
import type { RAPIER, RapierModule } from '../physics/rapier'

const C = CONFIG.camera

/**
 * Caméra 3e personne "par-dessus l'épaule".
 *
 * Position = pieds du joueur + hauteur du pivot + décalage d'épaule, puis
 * recul dans l'axe de visée. Deux lancers de rayon empêchent de voir à
 * travers les murs : tête -> épaule, puis épaule -> caméra.
 */
export class ThirdPersonCamera {
  readonly camera: THREE.PerspectiveCamera
  yaw = 0
  pitch: number = C.initialPitch

  private readonly head = new THREE.Vector3()
  private readonly pivot = new THREE.Vector3()
  private readonly back = new THREE.Vector3()
  private readonly right = new THREE.Vector3()
  private readonly ray: RAPIER.Ray
  private currentDistance: number = C.distance

  constructor(
    rapier: RapierModule,
    private readonly physics: RAPIER.World,
    private readonly ignore: RAPIER.Collider,
  ) {
    this.camera = new THREE.PerspectiveCamera(C.fov, 1, C.near, C.far)
    this.ray = new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })
  }

  rotate(dx: number, dy: number) {
    this.yaw -= dx * C.sensitivity
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * C.sensitivity, C.minPitch, C.maxPitch)
  }

  /** Direction de visée (centre de l'écran), vecteur unitaire. */
  forward(out: THREE.Vector3) {
    const cosPitch = Math.cos(this.pitch)
    return out.set(-Math.sin(this.yaw) * cosPitch, Math.sin(this.pitch), -Math.cos(this.yaw) * cosPitch)
  }

  /**
   * @param feet position (interpolée) des pieds du joueur
   */
  update(feet: THREE.Vector3, frameDt: number) {
    this.head.set(feet.x, feet.y + C.pivotHeight, feet.z)

    // 1) Décalage d'épaule, raccourci si un mur est collé au joueur.
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw))
    const shoulder = this.clearDistance(this.head, this.right, C.shoulderOffset, 0)
    this.pivot.copy(this.head).addScaledVector(this.right, shoulder)

    // 2) Recul derrière le pivot, raccourci par les obstacles.
    this.forward(this.back).negate()
    const target = this.clearDistance(this.pivot, this.back, C.distance, C.minDistance)

    // On se rapproche instantanément (jamais de mur entre caméra et joueur),
    // on se ré-éloigne en douceur.
    this.currentDistance
      = target < this.currentDistance
        ? target
        : THREE.MathUtils.lerp(this.currentDistance, target, Math.min(1, frameDt * C.recoverSpeed))

    this.camera.position.copy(this.pivot).addScaledVector(this.back, this.currentDistance)
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ')
  }

  resize(width: number, height: number) {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  /** Distance libre depuis `origin` dans `dir` (unitaire), bornée à [min, max]. */
  private clearDistance(origin: THREE.Vector3, dir: THREE.Vector3, max: number, min: number) {
    this.ray.origin = origin
    this.ray.dir = dir
    const hit = this.physics.castRay(this.ray, max, true, undefined, undefined, this.ignore)
    if (!hit) return max
    return Math.max(min, hit.timeOfImpact - C.collisionMargin)
  }
}
