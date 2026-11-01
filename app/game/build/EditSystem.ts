import * as THREE from 'three/webgpu'
import type { PieceSpec } from './BuildGrid'
import type { BuildSystem, PieceView } from './BuildSystem'
import { hasTile, isEditable, isValidEdit, NO_EDIT, tileAt, tileBoxes, withTile, type TileMask } from './Edit'

/** Couleurs de la grille d'édition. */
const TILE_KEPT = '#4fc3ff'
const TILE_REMOVED = '#0b1a2a'
const TILE_HOVERED = '#c8f0ff'
const TILE_INVALID = '#ff4f5e'
const TILE_OPACITY = 0.45
/** Les tuiles de la grille sont un peu plus petites que la pièce (joints visibles)... */
const TILE_INSET = 0.9
/** ...et un peu plus épaisses, pour être visibles des deux côtés. */
const TILE_EXTRA_THICKNESS = 0.08
/** Dessinée par-dessus les pièces. */
const OVERLAY_RENDER_ORDER = 20

interface Session {
  readonly key: string
  readonly spec: PieceSpec
  /** Monde -> repère local de la pièce. */
  readonly worldToLocal: THREE.Matrix4
  /** Demi-dimensions de la pièce (repère local). */
  readonly bounds: THREE.Box3
  selection: TileMask
  hovered: number | null
  /** Pendant un glisser : état appliqué aux tuiles survolées (true = retirer). */
  paint: boolean | null
}

/**
 * Mode édition (section 8 de `docs/construction.md`) : sélection des tuiles à
 * retirer d'une pièce, puis validation, réinitialisation ou annulation.
 * La logique des grilles et des sélections valides est dans `Edit.ts`.
 */
export class EditSystem {
  private session: Session | null = null
  private readonly overlay = new THREE.Group()
  private readonly tileGeometry = new THREE.BoxGeometry(1, 1, 1)
  private readonly materials = {
    kept: tileMaterial(TILE_KEPT),
    removed: tileMaterial(TILE_REMOVED),
    hovered: tileMaterial(TILE_HOVERED),
    invalid: tileMaterial(TILE_INVALID),
  }

  private readonly localRay = new THREE.Ray()
  private readonly hit = new THREE.Vector3()

  constructor(
    private readonly scene: THREE.Scene,
    private readonly build: BuildSystem,
  ) {
    this.overlay.matrixAutoUpdate = false
    this.overlay.visible = false
    scene.add(this.overlay)
  }

  get active() {
    return this.session !== null
  }

  /** La sélection en cours peut-elle être validée ? */
  get valid() {
    return this.session ? isValidEdit(this.session.spec.type, this.session.selection) : false
  }

  /** Clé de la pièce en cours d'édition. */
  get pieceKey() {
    return this.session?.key ?? null
  }

  /** Entre en édition sur une pièce. Renvoie `false` si elle n'est pas éditable. */
  begin(piece: PieceView): boolean {
    if (!isEditable(piece.spec.type)) return false
    const { spec } = piece
    const half = new THREE.Vector3(spec.sx / 2, spec.sy / 2, spec.sz / 2)
    this.session = {
      key: spec.key,
      spec,
      worldToLocal: piece.object.matrixWorld.clone().invert(),
      bounds: new THREE.Box3(half.clone().negate(), half),
      selection: piece.mask,
      hovered: null,
      paint: null,
    }
    this.buildOverlay(spec, piece.object.matrixWorld)
    this.refreshOverlay()
    return true
  }

  /**
   * Met à jour la tuile visée et la sélection.
   * @param pressed clic de sélection enfoncé à ce tick (début d'un glisser)
   * @param held clic de sélection maintenu
   */
  update(origin: THREE.Vector3, dir: THREE.Vector3, maxDistance: number, pressed: boolean, held: boolean) {
    const session = this.session
    if (!session) return
    session.hovered = this.tileUnderRay(session, origin, dir, maxDistance)

    if (!held) session.paint = null
    else if (pressed && session.hovered !== null) session.paint = !hasTile(session.selection, session.hovered)

    if (session.paint !== null && session.hovered !== null) {
      session.selection = withTile(session.selection, session.hovered, session.paint)
    }
    this.refreshOverlay()
  }

  /** Valide l'édition (si la sélection est valide) et quitte le mode édition. */
  confirm() {
    const session = this.session
    if (session && this.valid) this.build.applyEdit(session.key, session.selection)
    this.end()
  }

  /** Rend à la pièce sa forme complète et quitte le mode édition. */
  reset() {
    if (this.session) this.build.applyEdit(this.session.key, NO_EDIT)
    this.end()
  }

  /** Quitte le mode édition sans rien changer. */
  cancel() {
    this.end()
  }

  dispose() {
    this.end()
    this.scene.remove(this.overlay)
    this.tileGeometry.dispose()
    for (const material of Object.values(this.materials)) material.dispose()
  }

  private end() {
    this.session = null
    this.overlay.clear()
    this.overlay.visible = false
  }

  /** Tuile traversée par le rayon, calculée sur la pièce COMPLÈTE (on vise aussi les trous). */
  private tileUnderRay(session: Session, origin: THREE.Vector3, dir: THREE.Vector3, maxDistance: number) {
    this.localRay.set(origin, dir).applyMatrix4(session.worldToLocal)
    const point = this.localRay.intersectBox(session.bounds, this.hit)
    if (!point || this.localRay.origin.distanceTo(point) > maxDistance) return null
    return tileAt(session.spec, point)
  }

  private buildOverlay(spec: PieceSpec, pieceMatrix: THREE.Matrix4) {
    this.overlay.clear()
    this.overlay.matrix.copy(pieceMatrix)
    this.overlay.matrixWorldNeedsUpdate = true
    const boxes = tileBoxes(spec)
    const thinnest = Math.min(...Object.values(boxes[0]!.size))
    for (const box of boxes) {
      const mesh = new THREE.Mesh(this.tileGeometry, this.materials.kept)
      mesh.position.set(box.center.x, box.center.y, box.center.z)
      const scale = (size: number) => (size === thinnest ? size + TILE_EXTRA_THICKNESS : size * TILE_INSET)
      mesh.scale.set(scale(box.size.x), scale(box.size.y), scale(box.size.z))
      mesh.renderOrder = OVERLAY_RENDER_ORDER
      this.overlay.add(mesh)
    }
    this.overlay.visible = true
  }

  private refreshOverlay() {
    const session = this.session
    if (!session) return
    const valid = this.valid
    this.overlay.children.forEach((child, tile) => {
      const removed = hasTile(session.selection, tile)
      const mesh = child as THREE.Mesh
      if (removed) mesh.material = valid ? this.materials.removed : this.materials.invalid
      else mesh.material = tile === session.hovered ? this.materials.hovered : this.materials.kept
    })
  }
}

function tileMaterial(color: string) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity: TILE_OPACITY, depthWrite: false })
}
