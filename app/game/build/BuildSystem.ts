import * as THREE from 'three/webgpu'
import type RAPIER from '@dimforge/rapier3d-compat'
import { CONFIG } from '../config'
import {
  computePlacement,
  rampSurfaceY,
  type PieceSpec,
  type PieceType,
  type Viewer,
} from './BuildGrid'

type Rapier = typeof RAPIER

interface Piece {
  spec: PieceSpec
  mesh: THREE.Mesh
  collider: RAPIER.Collider
  hp: number
}

const PIECE_HP: Record<PieceType, number> = { wall: 150, floor: 140, ramp: 140 }

/**
 * Gère la pose, l'aperçu ("ghost") et la destruction des constructions.
 * Chaque pièce = un mesh + un collider Rapier fixe.
 */
export class BuildSystem {
  private readonly pieces = new Map<string, Piece>()
  private readonly byCollider = new Map<number, Piece>()
  private readonly box: THREE.BoxGeometry
  private readonly materials: Record<PieceType, THREE.MeshStandardMaterial>
  private readonly ghost: THREE.Mesh
  private readonly ghostMat: THREE.MeshBasicMaterial

  /** Pièce actuellement visée (aperçu). */
  preview: PieceSpec | null = null
  previewValid = false

  constructor(
    private readonly scene: THREE.Scene,
    private readonly rapier: Rapier,
    private readonly physics: RAPIER.World,
  ) {
    // Un cube unitaire partagé, mis à l'échelle par pièce (les dimensions viennent du PieceSpec).
    this.box = new THREE.BoxGeometry(1, 1, 1)

    const wood = plankTexture()
    this.materials = {
      wall: new THREE.MeshStandardMaterial({ map: wood, color: '#e0b07a', roughness: 0.85 }),
      floor: new THREE.MeshStandardMaterial({ map: wood, color: '#d39a5c', roughness: 0.85 }),
      ramp: new THREE.MeshStandardMaterial({ map: wood, color: '#c98d4f', roughness: 0.85 }),
    }

    this.ghostMat = new THREE.MeshBasicMaterial({
      color: '#4fc3ff',
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    })
    this.ghost = new THREE.Mesh(this.box, this.ghostMat)
    this.ghost.visible = false
    this.ghost.renderOrder = 10
    scene.add(this.ghost)
  }

  get count() {
    return this.pieces.size
  }

  /** Met à jour l'aperçu de la pièce à poser. `type = null` cache l'aperçu. */
  updatePreview(type: PieceType | null, viewer: Viewer, player: { pos: THREE.Vector3 }) {
    if (!type) {
      this.preview = null
      this.ghost.visible = false
      return
    }
    const spec = computePlacement(type, viewer, (cx, level, cz) => this.pieces.get(`ramp:${cx}:${level}:${cz}`)?.spec)
    this.preview = spec
    this.previewValid = this.canPlace(spec, player.pos)

    applyTransform(this.ghost, spec)
    this.ghost.visible = true
    this.ghostMat.color.set(this.previewValid ? '#4fc3ff' : '#ff4f5e')
  }

  /** Pose la pièce en aperçu. Renvoie la pièce posée, ou null. */
  placePreview(): PieceSpec | null {
    const spec = this.preview
    if (!spec || !this.previewValid) return null
    this.place(spec)
    this.previewValid = false
    this.ghostMat.color.set('#ff4f5e')
    return spec
  }

  place(spec: PieceSpec) {
    if (this.pieces.has(spec.key)) return
    const mesh = new THREE.Mesh(this.box, this.materials[spec.type])
    applyTransform(mesh, spec)
    mesh.castShadow = mesh.receiveShadow = true
    this.scene.add(mesh)

    const q = mesh.quaternion
    const body = this.physics.createRigidBody(
      this.rapier.RigidBodyDesc.fixed()
        .setTranslation(spec.x, spec.y, spec.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
    )
    const collider = this.physics.createCollider(
      this.rapier.ColliderDesc.cuboid(spec.sx / 2, spec.sy / 2, spec.sz / 2),
      body,
    )

    const piece: Piece = { spec, mesh, collider, hp: PIECE_HP[spec.type] }
    this.pieces.set(spec.key, piece)
    this.byCollider.set(collider.handle, piece)
  }

  /** Détruit la pièce visée par un rayon. Renvoie true si une pièce a été détruite. */
  destroyAt(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, ignore: RAPIER.Collider) {
    const hit = this.physics.castRay(new this.rapier.Ray(origin, dir), maxDist, true, undefined, undefined, ignore)
    if (!hit) return false
    const piece = this.byCollider.get(hit.collider.handle)
    if (!piece) return false
    this.remove(piece)
    return true
  }

  clear() {
    for (const p of [...this.pieces.values()]) this.remove(p)
  }

  /**
   * Après la pose d'un sol / d'une rampe sous le joueur, on le remonte au-dessus
   * pour qu'il ne se retrouve pas coincé dans la pièce.
   */
  surfaceUnder(spec: PieceSpec, x: number, z: number) {
    const half = CONFIG.build.tile / 2
    if (Math.abs(x - spec.x) > half || Math.abs(z - spec.z) > half) return null
    if (spec.type === 'floor') return spec.y + spec.sy / 2
    if (spec.type === 'ramp') return rampSurfaceY(spec, x, z) + spec.sy
    return null
  }

  dispose() {
    this.clear()
    this.scene.remove(this.ghost)
    this.box.dispose()
    Object.values(this.materials).forEach((m) => {
      m.map?.dispose()
      m.dispose()
    })
    this.ghostMat.dispose()
  }

  private remove(piece: Piece) {
    this.scene.remove(piece.mesh)
    this.byCollider.delete(piece.collider.handle)
    const body = piece.collider.parent()
    if (body) this.physics.removeRigidBody(body)
    this.pieces.delete(piece.spec.key)
  }

  private canPlace(spec: PieceSpec, playerPos: THREE.Vector3) {
    if (this.pieces.has(spec.key)) return false
    const limit = CONFIG.world.halfSize
    if (Math.abs(spec.x) > limit || Math.abs(spec.z) > limit || spec.level < 0) return false

    // Interdit de poser un mur À TRAVERS le joueur.
    if (spec.type === 'wall') {
      const r = CONFIG.player.radius + spec.sx / 2
      const rz = CONFIG.player.radius + spec.sz / 2
      const footY = playerPos.y - CONFIG.player.height / 2
      const overlapsY = footY < spec.y + spec.sy / 2 && footY + CONFIG.player.height > spec.y - spec.sy / 2
      if (overlapsY && Math.abs(playerPos.x - spec.x) < r && Math.abs(playerPos.z - spec.z) < rz) return false
    }
    return true
  }
}

function applyTransform(mesh: THREE.Mesh, spec: PieceSpec) {
  mesh.position.set(spec.x, spec.y, spec.z)
  mesh.scale.set(spec.sx, spec.sy, spec.sz)
  mesh.rotation.set(spec.pitch, spec.yaw, 0, 'YXZ')
  mesh.updateMatrix()
}

/** Texture de planches générée procéduralement. */
function plankTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  g.fillStyle = '#f0d2a8'
  g.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 4; i++) {
    const y = i * 64
    g.fillStyle = i % 2 ? '#e7c391' : '#f3d7ad'
    g.fillRect(0, y, 256, 64)
    g.fillStyle = 'rgba(90, 50, 20, 0.35)'
    g.fillRect(0, y, 256, 3)
    for (let k = 0; k < 18; k++) {
      g.fillStyle = 'rgba(120, 70, 30, 0.08)'
      g.fillRect(Math.random() * 256, y + 6 + Math.random() * 54, 40 + Math.random() * 80, 2)
    }
  }
  g.strokeStyle = 'rgba(60, 30, 10, 0.5)'
  g.lineWidth = 8
  g.strokeRect(0, 0, 256, 256)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
