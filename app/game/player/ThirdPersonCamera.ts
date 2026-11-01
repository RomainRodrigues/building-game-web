import * as THREE from 'three/webgpu'
import type RAPIER from '@dimforge/rapier3d-compat'
import { CONFIG } from '../config'

type Rapier = typeof RAPIER
const C = CONFIG.camera

/**
 * Caméra 3e personne "par-dessus l'épaule".
 * Si un mur se trouve entre le joueur et la caméra, on la rapproche
 * (lancer de rayon Rapier) pour ne jamais voir à travers les murs.
 */
export class ThirdPersonCamera {
  readonly camera: THREE.PerspectiveCamera
  yaw = 0
  pitch = -0.15

  private readonly pivot = new THREE.Vector3()
  private readonly desired = new THREE.Vector3()
  private readonly dir = new THREE.Vector3()
  private currentDistance: number = C.distance

  constructor(
    private readonly rapier: Rapier,
    private readonly physics: RAPIER.World,
    private readonly ignore: RAPIER.Collider,
  ) {
    this.camera = new THREE.PerspectiveCamera(C.fov, 1, 0.1, 500)
  }

  rotate(dx: number, dy: number) {
    this.yaw -= dx * C.sensitivity
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * C.sensitivity, C.minPitch, C.maxPitch)
  }

  /** Direction de visée (centre de l'écran). */
  forward(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch)
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp)
  }

  update(target: THREE.Vector3, frameDt: number) {
    // Point de pivot : au-dessus de la tête, décalé sur l'épaule droite.
    const rightX = Math.cos(this.yaw)
    const rightZ = -Math.sin(this.yaw)
    this.pivot.set(
      target.x + rightX * C.shoulderOffset,
      target.y + CONFIG.player.height / 2 + C.heightOffset - 0.4,
      target.z + rightZ * C.shoulderOffset,
    )

    // On recule depuis le pivot dans la direction opposée à la visée.
    this.forward(this.dir).negate()
    let distance: number = C.distance
    const hit = this.physics.castRay(
      new this.rapier.Ray(this.pivot, this.dir),
      C.distance,
      true,
      undefined,
      undefined,
      this.ignore,
    )
    if (hit) distance = Math.max(0.3, hit.timeOfImpact - 0.25)

    // On se rapproche instantanément, on s'éloigne en douceur.
    this.currentDistance =
      distance < this.currentDistance
        ? distance
        : this.currentDistance + (distance - this.currentDistance) * Math.min(1, frameDt * 6)

    this.desired.copy(this.pivot).addScaledVector(this.dir, this.currentDistance)
    this.camera.position.copy(this.desired)
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ')
  }

  resize(width: number, height: number) {
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }
}
