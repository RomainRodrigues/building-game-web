/**
 * Édition des pièces : logique PURE (ni Three.js ni Rapier). Référence : section 8
 * de `docs/construction.md`.
 *
 * Une pièce éditable est découpée en une grille de tuiles. Une édition est un
 * MASQUE de tuiles retirées : le bit `i` vaut 1 si la tuile `i` est retirée.
 * Une tuile est repérée par `ligne * colonnes + colonne`.
 *
 * La grille est définie dans le repère LOCAL de la pièce (sa boîte avant rotation,
 * centrée sur l'origine, de dimensions `sx`, `sy`, `sz`) par deux axes :
 *  - `u` porte les colonnes (colonne 0 du côté négatif) ;
 *  - `v` porte les lignes (ligne 0 du côté négatif : en bas pour un mur).
 */
import type { PieceSpec, PieceType, Vec3 } from './BuildGrid'

export interface EditGrid {
  readonly cols: number
  readonly rows: number
}

/** Masque de tuiles retirées (0 = pièce complète). */
export type TileMask = number

/** Boîte d'une tuile restante, dans le repère local de la pièce. */
export interface TileBox {
  readonly center: Vec3
  readonly size: Vec3
}

type Axis = 'x' | 'y' | 'z'

const EDIT_GRIDS: Partial<Record<PieceType, EditGrid>> = {
  wall: { cols: 3, rows: 3 },
  floor: { cols: 2, rows: 2 },
  ramp: { cols: 2, rows: 2 },
}

/** Tolérance (fraction de la pièce) pour rattacher un point tout juste au bord. */
const EDGE_TOLERANCE = 0.02

export const NO_EDIT: TileMask = 0

export function editGrid(type: PieceType): EditGrid | undefined {
  return EDIT_GRIDS[type]
}

export function isEditable(type: PieceType) {
  return EDIT_GRIDS[type] !== undefined
}

/** Masque de toutes les tuiles d'une grille. */
export function fullMask(grid: EditGrid): TileMask {
  return (1 << (grid.cols * grid.rows)) - 1
}

export function hasTile(mask: TileMask, tile: number) {
  return (mask & (1 << tile)) !== 0
}

export function withTile(mask: TileMask, tile: number, removed: boolean): TileMask {
  return removed ? mask | (1 << tile) : mask & ~(1 << tile)
}

/** Masque d'une colonne entière. */
export function columnMask(grid: EditGrid, col: number): TileMask {
  let mask = 0
  for (let row = 0; row < grid.rows; row++) mask |= 1 << (row * grid.cols + col)
  return mask
}

/**
 * Une édition est-elle autorisée ?
 *  - mur, sol : au moins une tuile doit rester ;
 *  - rampe : seule une colonne entière peut être retirée (demi-rampe) ;
 *  - toit : non éditable.
 */
export function isValidEdit(type: PieceType, mask: TileMask): boolean {
  const grid = EDIT_GRIDS[type]
  if (!grid) return mask === NO_EDIT
  if (mask === NO_EDIT) return true
  const all = fullMask(grid)
  if ((mask & ~all) !== 0 || mask === all) return false
  if (type === 'ramp') {
    return Array.from({ length: grid.cols }, (_, col) => columnMask(grid, col)).includes(mask)
  }
  return true
}

/** Axes de la grille dans le repère local de la pièce. */
function gridAxes(spec: PieceSpec): { u: Axis, v: Axis } {
  switch (spec.type) {
    // La largeur d'un mur est son plus grand côté horizontal (x ou z selon son orientation).
    case 'wall': return { u: spec.sx >= spec.sz ? 'x' : 'z', v: 'y' }
    default: return { u: 'x', v: 'z' }
  }
}

function sizeOf(spec: PieceSpec): Vec3 {
  return { x: spec.sx, y: spec.sy, z: spec.sz }
}

/**
 * Tuile contenant le point `local` (repère local de la pièce, en mètres), ou
 * `null` si le point est hors de la pièce ou si la pièce n'est pas éditable.
 */
export function tileAt(spec: PieceSpec, local: Vec3): number | null {
  const grid = EDIT_GRIDS[spec.type]
  if (!grid) return null
  const { u, v } = gridAxes(spec)
  const size = sizeOf(spec)
  const su = local[u] / size[u] + 0.5
  const sv = local[v] / size[v] + 0.5
  const inside = (s: number) => s >= -EDGE_TOLERANCE && s <= 1 + EDGE_TOLERANCE
  if (!inside(su) || !inside(sv)) return null
  const col = Math.min(grid.cols - 1, Math.max(0, Math.floor(su * grid.cols)))
  const row = Math.min(grid.rows - 1, Math.max(0, Math.floor(sv * grid.rows)))
  return row * grid.cols + col
}

/** Boîte (repère local) de chaque tuile de la grille, retirée ou non, indexée par tuile. */
export function tileBoxes(spec: PieceSpec): TileBox[] {
  const grid = EDIT_GRIDS[spec.type]
  if (!grid) return []
  const { u, v } = gridAxes(spec)
  const size = sizeOf(spec)
  const tile = { ...size, [u]: size[u] / grid.cols, [v]: size[v] / grid.rows }
  const boxes: TileBox[] = []
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      const center = { x: 0, y: 0, z: 0, [u]: (col + 0.5) * tile[u] - size[u] / 2, [v]: (row + 0.5) * tile[v] - size[v] / 2 }
      boxes.push({ center, size: tile })
    }
  }
  return boxes
}

/**
 * Boîtes (repère local) qui composent la pièce après édition : la pièce entière
 * si rien n'est retiré, sinon une boîte par tuile restante.
 */
export function remainingBoxes(spec: PieceSpec, mask: TileMask): TileBox[] {
  if (mask === NO_EDIT) return [{ center: { x: 0, y: 0, z: 0 }, size: sizeOf(spec) }]
  return tileBoxes(spec).filter((_, tile) => !hasTile(mask, tile))
}
