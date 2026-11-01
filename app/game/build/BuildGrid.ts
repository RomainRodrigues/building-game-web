/**
 * Logique PURE de la grille de construction (aucune dépendance à Three.js ni
 * Rapier) : elle pourra être partagée telle quelle avec un serveur.
 *
 * Le monde est découpé en cases de `tile` x `tile` mètres, et en étages de
 * `height` mètres. Il existe trois types de pièces :
 *
 *  - floor : une dalle horizontale qui couvre une case, posée à la base d'un étage.
 *  - wall  : un mur vertical posé sur une ARÊTE entre deux cases.
 *  - ramp  : une rampe à 45° qui couvre une case et monte d'un étage.
 *
 * Directions (comme le "yaw" de la caméra) :
 *   0 = nord (-Z), 1 = ouest (-X), 2 = sud (+Z), 3 = est (+X)
 */
import { CONFIG } from '../config'

export type PieceType = 'wall' | 'floor' | 'ramp'
export type Dir = 0 | 1 | 2 | 3

export const PIECE_TYPES: PieceType[] = ['wall', 'floor', 'ramp']

export interface PieceSpec {
  type: PieceType
  /** Identifiant unique de l'emplacement : deux pièces ne peuvent pas avoir le même. */
  key: string
  /** Centre de la pièce (monde). */
  x: number
  y: number
  z: number
  /** Dimensions de la boîte AVANT rotation de la rampe. */
  sx: number
  sy: number
  sz: number
  /** Rotation : inclinaison (rampe) puis orientation. */
  pitch: number
  yaw: number
  level: number
  dir: Dir
}

const T = CONFIG.build.tile
const H = CONFIG.build.height
const TH = CONFIG.build.thickness

/** Vecteur (x, z) unitaire pour chaque direction. */
export const DIR_VEC: Record<Dir, [number, number]> = {
  0: [0, -1],
  1: [-1, 0],
  2: [0, 1],
  3: [1, 0],
}

export function yawToDir(yaw: number): Dir {
  return ((((Math.round(yaw / (Math.PI / 2)) % 4) + 4) % 4) as Dir)
}

export function cellOf(x: number, z: number): [number, number] {
  return [Math.floor(x / T), Math.floor(z / T)]
}

export function levelOf(feetY: number) {
  return Math.floor((feetY + 0.3) / H)
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

/** Mur sur le côté `dir` de la case (cx, cz). Les deux cases voisines partagent la même clé. */
export function wallSpec(cx: number, level: number, cz: number, dir: Dir): PieceSpec {
  const y = level * H + H / 2
  if (dir === 1 || dir === 3) {
    // Mur perpendiculaire à X, sur la frontière x = bx * T
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

/** Rampe qui monte vers la direction `dir`. Une seule rampe par case et par étage. */
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
    // Inclinaison autour de X (monte vers -Z), puis rotation vers `dir`.
    pitch: Math.atan2(H, T),
    yaw: dir * (Math.PI / 2),
    level,
    dir,
  }
}

/** Hauteur de la surface d'une rampe au point (x, z). */
export function rampSurfaceY(spec: PieceSpec, x: number, z: number) {
  const [dx, dz] = DIR_VEC[spec.dir]
  // Progression le long de la rampe : -T/2 (bas) .. +T/2 (haut)
  const along = (x - spec.x) * dx + (z - spec.z) * dz
  return spec.level * H + (along / T + 0.5) * H
}

export interface Viewer {
  x: number
  z: number
  feetY: number
  yaw: number
  pitch: number
}

/**
 * Choisit l'emplacement de la pièce à poser à partir de la position et du
 * regard du joueur (règles simples, inspirées des jeux du genre).
 * `rampAt` permet de savoir si le joueur est déjà sur une rampe, pour
 * enchaîner les rampes vers le haut ("ramp rush").
 */
export function computePlacement(
  type: PieceType,
  v: Viewer,
  rampAt: (cx: number, level: number, cz: number) => PieceSpec | undefined,
): PieceSpec {
  const dir = yawToDir(v.yaw)
  const [fx, fz] = DIR_VEC[dir]
  const [cx, cz] = cellOf(v.x, v.z)
  const level = levelOf(v.feetY)

  // Case "devant" : celle qui contient un point situé un peu devant le joueur.
  const [ax, az] = cellOf(v.x + fx * T * 0.6, v.z + fz * T * 0.6)
  // Si on est sur une rampe qui monte dans le même sens, la suivante est un étage au-dessus.
  const currentRamp = rampAt(cx, level, cz)
  const onRampSameDir = !!currentRamp && currentRamp.dir === dir && v.feetY > level * H + 0.2

  if (onRampSameDir) {
    // "Ramp rush" : la pièce suivante va dans la case suivante, un étage plus haut.
    const nx = cx + fx
    const nz = cz + fz
    if (type === 'ramp') return rampSpec(nx, level + 1, nz, dir)
    if (type === 'floor') return floorSpec(nx, level + 1, nz)
    return wallSpec(nx, level + 1, nz, dir)
  }

  switch (type) {
    case 'wall':
      return wallSpec(cx, v.pitch > 0.75 ? level + 1 : level, cz, dir)
    case 'floor':
      if (v.pitch < -0.7) return floorSpec(cx, level, cz) // sous ses pieds
      if (v.pitch > 0.5) return floorSpec(cx, level + 1, cz) // au-dessus de la tête
      return floorSpec(ax, level, az)
    case 'ramp':
      return rampSpec(ax, level, az, dir)
  }
}
