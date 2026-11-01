import * as THREE from 'three/webgpu'
import { CONFIG } from '../config'
import type { RAPIER, RapierModule } from '../physics/rapier'
import { createPlankTexture } from '../world/textures'
import { computePlacement, walkableSurfaceY, type PieceSpec, type PieceType, type Viewer } from './BuildGrid'
import { StructureGraph } from './Structure'

interface Piece {
  readonly spec: PieceSpec
  readonly mesh: THREE.Mesh
  readonly collider: RAPIER.Collider
  hp: number
}

export interface BuildPreview {
  readonly spec: PieceSpec
  readonly valid: boolean
}

const PIECE_COLORS: Record<PieceType, string> = {
  wall: '#e0b07a',
  floor: '#d39a5c',
  ramp: '#c98d4f',
}
const GHOST_VALID = '#4fc3ff'
const GHOST_INVALID = '#ff4f5e'
const GHOST_OPACITY = 0.35
/** Le fantôme est dessiné après les objets opaques. */
const GHOST_RENDER_ORDER = 10

/**
 * Pose, aperçu ("fantôme") et destruction des constructions.
 * Chaque pièce = un mesh (cube unitaire mis à l'échelle) + un collider Rapier fixe.
 * Les règles d'appui (pièces reliées au sol, effondrements) sont déléguées à `StructureGraph`.
 */
export class BuildSystem {
  private readonly pieces = new Map<string, Piece>()
  private readonly byCollider = new Map<number, Piece>()
  private readonly structure = new StructureGraph()
  private readonly box = new THREE.BoxGeometry(1, 1, 1)
  private readonly texture = createPlankTexture()
  private readonly materials: Record<PieceType, THREE.MeshStandardMaterial>
  private readonly ghostMaterial: THREE.MeshBasicMaterial
  private readonly ghost: THREE.Mesh
  private readonly ray: RAPIER.Ray
  private _preview: BuildPreview | null = null

  constructor(
    private readonly scene: THREE.Scene,
    private readonly rapier: RapierModule,
    private readonly physics: RAPIER.World,
  ) {
    const material = (type: PieceType) =>
      new THREE.MeshStandardMaterial({ map: this.texture, color: PIECE_COLORS[type], roughness: 0.85 })
    this.materials = { wall: material('wall'), floor: material('floor'), ramp: material('ramp') }

    this.ghostMaterial = new THREE.MeshBasicMaterial({
      color: GHOST_VALID,
      transparent: true,
      opacity: GHOST_OPACITY,
      depthWrite: false,
    })
    this.ghost = new THREE.Mesh(this.box, this.ghostMaterial)
    this.ghost.visible = false
    this.ghost.renderOrder = GHOST_RENDER_ORDER
    scene.add(this.ghost)

    this.ray = new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 })
  }

  get pieceCount() {
    return this.pieces.size
  }

  get preview(): BuildPreview | null {
    return this._preview
  }

  /** Recalcule l'aperçu. `type = null` le masque (aucune pièce sélectionnée). */
  updatePreview(type: PieceType | null, viewer: Viewer, playerFeet: THREE.Vector3) {
    if (!type) {
      this.setPreview(null)
      return
    }
    const spec = computePlacement(type, viewer, (cx, level, cz) => this.pieces.get(`ramp:${cx}:${level}:${cz}`)?.spec)
    this.setPreview({ spec, valid: this.canPlace(spec, playerFeet) })
  }

  /** Pose la pièce de l'aperçu si l'emplacement est valide. */
  placePreview(): PieceSpec | null {
    const preview = this._preview
    if (!preview?.valid || !this.place(preview.spec)) return null
    this.setPreview({ spec: preview.spec, valid: false })
    return preview.spec
  }

  /** Pose une pièce si elle est soutenue. Renvoie `false` sinon. */
  place(spec: PieceSpec): boolean {
    if (this.pieces.has(spec.key) || !this.structure.isSupported(spec)) return false
    const mesh = new THREE.Mesh(this.box, this.materials[spec.type])
    applyTransform(mesh, spec)
    mesh.castShadow = true
    mesh.receiveShadow = true
    this.scene.add(mesh)

    const { x, y, z, w } = mesh.quaternion
    const body = this.physics.createRigidBody(
      this.rapier.RigidBodyDesc.fixed().setTranslation(spec.x, spec.y, spec.z).setRotation({ x, y, z, w }),
    )
    const collider = this.physics.createCollider(
      this.rapier.ColliderDesc.cuboid(spec.sx / 2, spec.sy / 2, spec.sz / 2),
      body,
    )

    const piece: Piece = { spec, mesh, collider, hp: CONFIG.build.hp[spec.type] }
    this.pieces.set(spec.key, piece)
    this.byCollider.set(collider.handle, piece)
    this.structure.add(spec)
    return true
  }

  /**
   * Détruit une pièce ainsi que tout ce qui ne tient plus sans elle.
   * Renvoie le nombre total de pièces retirées.
   */
  destroy(key: string): number {
    if (!this.pieces.has(key)) return 0
    const removed = [key, ...this.structure.remove(key)]
    for (const k of removed) this.removeVisual(this.pieces.get(k)!)
    return removed.length
  }

  /** Détruit la pièce touchée par le rayon (et ce qu'elle soutient). Renvoie le nombre de pièces retirées. */
  destroyAlongRay(origin: THREE.Vector3, dir: THREE.Vector3, maxDistance: number, ignore: RAPIER.Collider) {
    this.ray.origin = origin
    this.ray.dir = dir
    const hit = this.physics.castRay(this.ray, maxDistance, true, undefined, undefined, ignore)
    const piece = hit && this.byCollider.get(hit.collider.handle)
    return piece ? this.destroy(piece.spec.key) : 0
  }

  /** Surface praticable de `spec` sous le point (x, z), ou `null`. */
  surfaceUnder(spec: PieceSpec, x: number, z: number) {
    return walkableSurfaceY(spec, x, z)
  }

  clear() {
    for (const piece of [...this.pieces.values()]) this.removeVisual(piece)
    this.structure.clear()
  }

  dispose() {
    this.clear()
    this.scene.remove(this.ghost)
    this.box.dispose()
    this.texture.dispose()
    for (const material of Object.values(this.materials)) material.dispose()
    this.ghostMaterial.dispose()
  }

  private setPreview(preview: BuildPreview | null) {
    this._preview = preview
    this.ghost.visible = preview !== null
    if (!preview) return
    applyTransform(this.ghost, preview.spec)
    this.ghostMaterial.color.set(preview.valid ? GHOST_VALID : GHOST_INVALID)
  }

  /** Retire le mesh et le collider (le graphe de structure est géré par l'appelant). */
  private removeVisual(piece: Piece) {
    this.scene.remove(piece.mesh)
    this.byCollider.delete(piece.collider.handle)
    const body = piece.collider.parent()
    if (body) this.physics.removeRigidBody(body)
    this.pieces.delete(piece.spec.key)
  }

  private canPlace(spec: PieceSpec, playerFeet: THREE.Vector3) {
    if (this.pieces.has(spec.key) || spec.level < 0) return false
    const limit = CONFIG.world.halfSize
    if (Math.abs(spec.x) > limit || Math.abs(spec.z) > limit) return false
    // Une pièce doit toucher le sol ou une construction déjà reliée au sol.
    if (!this.structure.isSupported(spec)) return false
    // Un mur ne peut pas traverser le joueur (sols et rampes le remontent dessus).
    return spec.type !== 'wall' || !wallOverlapsPlayer(spec, playerFeet)
  }
}

/** Test boîte (mur) contre boîte englobante du joueur. */
function wallOverlapsPlayer(spec: PieceSpec, feet: THREE.Vector3) {
  const { radius, height } = CONFIG.player
  const overlapX = Math.abs(feet.x - spec.x) < radius + spec.sx / 2
  const overlapZ = Math.abs(feet.z - spec.z) < radius + spec.sz / 2
  const overlapY = feet.y < spec.y + spec.sy / 2 && feet.y + height > spec.y - spec.sy / 2
  return overlapX && overlapY && overlapZ
}

function applyTransform(mesh: THREE.Mesh, spec: PieceSpec) {
  mesh.position.set(spec.x, spec.y, spec.z)
  mesh.scale.set(spec.sx, spec.sy, spec.sz)
  mesh.rotation.set(spec.pitch, spec.yaw, 0, 'YXZ')
}
