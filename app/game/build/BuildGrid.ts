/**
 * Logique PURE de la grille de construction : aucune dépendance à Three.js ni
 * à Rapier. Elle est testée unitairement et pourra être partagée avec un serveur.
 *
 * Le monde est découpé en cases de `tile` x `tile` mètres et en étages de
 * `height` mètres. Trois types de pièces :
 *
 *  - floor : dalle horizontale couvrant une case, à la base d'un étage ;
 *  - wall  : mur vertical posé sur une ARÊTE entre deux cases ;
 *  - ramp  : rampe à 45° couvrant une case et montant d'un étage.
 *
 * Directions (alignées sur le "yaw" de la caméra) :
 *   0 = nord (-Z), 1 = ouest (-X), 2 = sud (+Z), 3 = est (+X)
 */
import { CONFIG } from '../config'

export type PieceType = 'wall' | 'floor' | 'ramp'
export type Dir = 0 | 1 | 2 | 3

export const PIECE_TYPES: readonly PieceType[] = ['wall', 'floor', 'ramp']

/** Description complète (et sérialisable) d'une pièce posée sur la grille. */
export interface PieceSpec {
  type: PieceType
  /** Identifiant de l'emplacement : deux pièces ne peuvent pas partager la même clé. */
  key: string
  /** Centre de la pièce (repère monde). */
  x: number
  y: number
  z: number
  /** Dimensions de la boîte avant rotation. */
  sx: number
  sy: number
  sz: number
  /** Inclinaison autour de X (rampe), appliquée avant `yaw`. */
  pitch: number
  /** Orientation autour de Y. */
  yaw: number
  level: number
  dir: Dir
}

/** Position et regard du joueur, seules données nécessaires au placement. */
export interface Viewer {
  x: number
  z: number
  feetY: number
  yaw: number
  pitch: number
  /** Le joueur est en l'air (saut, chute). */
  airborne: boolean
}

export type RampLookup = (cx: number, level: number, cz: number) => PieceSpec | undefined

const T = CONFIG.build.tile
const H = CONFIG.build.height
const TH = CONFIG.build.thickness
const QUARTER_TURN = Math.PI / 2

/** Marge pour qu'un joueur posé sur un sol soit compté à l'étage de ce sol. */
const LEVEL_TOLERANCE = 0.3
/** Distance (en cases) du point "devant le joueur" servant à choisir la case cible. */
const LOOK_AHEAD_TILES = 0.6
/** Hauteur au-dessus de la base d'une rampe à partir de laquelle on est "dessus". */
const ON_RAMP_MIN_HEIGHT = 0.2
/** Seuils d'inclinaison du regard (radians). */
const PITCH_WALL_UP = 0.75
const PITCH_FLOOR_UP = 0.5
const PITCH_FLOOR_DOWN = -0.7

/** Vecteur (x, z) unitaire de chaque direction. */
export const DIR_VEC: Readonly<Record<Dir, readonly [number, number]>> = {
  0: [0, -1],
  1: [-1, 0],
  2: [0, 1],
  3: [1, 0],
}

export function yawToDir(yaw: number): Dir {
  const quarter = Math.round(yaw / QUARTER_TURN)
  return (((quarter % 4) + 4) % 4) as Dir
}

export function cellOf(x: number, z: number): [number, number] {
  return [Math.floor(x / T), Math.floor(z / T)]
}

export function levelOf(feetY: number) {
  return Math.floor((feetY + LEVEL_TOLERANCE) / H)
}

export function floorSpec(cx: number, level: number, cz: number): PieceSpec {
  return {
    type: 'floor',
    key: `floor:${cx}:${level}:${cz}`,
    x: cx * T + T / 2,
    y: level * H,
    z: cz * T + T / 2,
    sx: T,
    sy: TH,
    sz: T,
    pitch: 0,
    yaw: 0,
    level,
    dir: 0,
  }
}

/**
 * Mur sur le côté `dir` de la case (cx, cz). Deux cases voisines partagent
 * l'arête, donc la même clé : impossible de doubler un mur.
 */
export function wallSpec(cx: number, level: number, cz: number, dir: Dir): PieceSpec {
  const y = level * H + H / 2
  if (dir === 1 || dir === 3) {
    // Mur perpendiculaire à X, sur la frontière x = bx * T.
    const bx = dir === 1 ? cx : cx + 1
    return {
      type: 'wall',
      key: `wall:x:${bx}:${level}:${cz}`,
      x: bx * T,
      y,
      z: cz * T + T / 2,
      sx: TH,
      sy: H,
      sz: T,
      pitch: 0,
      yaw: 0,
      level,
      dir,
    }
  }
  // Mur perpendiculaire à Z, sur la frontière z = bz * T.
  const bz = dir === 0 ? cz : cz + 1
  return {
    type: 'wall',
    key: `wall:z:${cx}:${level}:${bz}`,
    x: cx * T + T / 2,
    y,
    z: bz * T,
    sx: T,
    sy: H,
    sz: TH,
    pitch: 0,
    yaw: 0,
    level,
    dir,
  }
}

/** Rampe montant vers la direction `dir`. Une seule rampe par case et par étage. */
export function rampSpec(cx: number, level: number, cz: number, dir: Dir): PieceSpec {
  return {
    type: 'ramp',
    key: `ramp:${cx}:${level}:${cz}`,
    x: cx * T + T / 2,
    y: level * H + H / 2,
    z: cz * T + T / 2,
    sx: T,
    sy: TH,
    sz: Math.hypot(T, H),
    // Inclinée autour de X (monte vers -Z), puis tournée vers `dir`.
    pitch: Math.atan2(H, T),
    yaw: dir * QUARTER_TURN,
    level,
    dir,
  }
}

/** Hauteur de la ligne médiane d'une rampe au point (x, z). */
export function rampMidlineY(spec: PieceSpec, x: number, z: number) {
  const [dx, dz] = DIR_VEC[spec.dir]
  // Progression le long de la rampe : -T/2 (bas) .. +T/2 (haut).
  const along = (x - spec.x) * dx + (z - spec.z) * dz
  return spec.level * H + (along / T + 0.5) * H
}

/**
 * Hauteur de la surface praticable d'un sol / d'une rampe au point (x, z),
 * ou `null` si le point n'est pas au-dessus de la pièce (ou si c'est un mur).
 */
export function walkableSurfaceY(spec: PieceSpec, x: number, z: number): number | null {
  const half = T / 2
  if (Math.abs(x - spec.x) > half || Math.abs(z - spec.z) > half) return null
  if (spec.type === 'floor') return spec.y + spec.sy / 2
  if (spec.type === 'ramp') return rampMidlineY(spec, x, z) + spec.sy
  return null
}

/**
 * Choisit l'emplacement de la pièce à poser selon la position et le regard
 * du joueur. `rampAt` permet de savoir si le joueur est sur une rampe, pour
 * enchaîner les pièces vers le haut ("ramp rush").
 */
export function computePlacement(type: PieceType, viewer: Viewer, rampAt: RampLookup): PieceSpec {
  const dir = yawToDir(viewer.yaw)
  const [fx, fz] = DIR_VEC[dir]
  const [cx, cz] = cellOf(viewer.x, viewer.z)
  const level = levelOf(viewer.feetY)

  const currentRamp = rampAt(cx, level, cz)
  const climbing = currentRamp?.dir === dir && viewer.feetY > level * H + ON_RAMP_MIN_HEIGHT
  if (climbing) {
    // Sur une rampe qui monte dans le sens du regard ("ramp rush") :
    //  - rampe / sol : dans la case suivante, un étage plus haut (prolongent la montée) ;
    //  - mur : au bout de la rampe, au même étage (la rampe s'appuie contre lui) ;
    //    en regardant vers le haut ou en sautant, il passe au-dessus de la rampe.
    // Dans tous les cas la pièce partage le bord haut de la rampe : elle est soutenue.
    const nx = cx + fx
    const nz = cz + fz
    if (type === 'ramp') return rampSpec(nx, level + 1, nz, dir)
    if (type === 'floor') return floorSpec(nx, level + 1, nz)
    const above = viewer.airborne || viewer.pitch > PITCH_WALL_UP
    return wallSpec(cx, above ? level + 1 : level, cz, dir)
  }

  // Case "devant" : celle qui contient un point situé un peu devant le joueur.
  const [ax, az] = cellOf(viewer.x + fx * T * LOOK_AHEAD_TILES, viewer.z + fz * T * LOOK_AHEAD_TILES)

  switch (type) {
    case 'wall':
      return wallSpec(cx, viewer.pitch > PITCH_WALL_UP ? level + 1 : level, cz, dir)
    case 'floor':
      if (viewer.pitch < PITCH_FLOOR_DOWN) return floorSpec(cx, level, cz)
      if (viewer.pitch > PITCH_FLOOR_UP) return floorSpec(cx, level + 1, cz)
      return floorSpec(ax, level, az)
    case 'ramp':
      return rampSpec(ax, level, az, dir)
  }
}
