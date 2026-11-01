/**
 * Logique PURE de la grille de construction : aucune dépendance à Three.js ni
 * à Rapier. Elle est testée unitairement et pourra être partagée avec un serveur.
 *
 * Le monde est découpé en cases de `tile` x `tile` mètres et en étages de
 * `height` mètres. Trois types de pièces :
 *
 *  - floor : dalle horizontale couvrant une case, à la base d'un étage ;
 *  - wall  : mur vertical posé sur une ARÊTE entre deux cases ;
 *  - ramp  : rampe couvrant une case et montant d'un étage ;
 *  - roof  : toit en pyramide couvrant une case, posé au sommet d'un étage.
 *
 * Directions (alignées sur le "yaw" de la caméra) :
 *   0 = nord (-Z), 1 = ouest (-X), 2 = sud (+Z), 3 = est (+X)
 */
import { CONFIG } from '../config'

export type PieceType = 'wall' | 'floor' | 'ramp' | 'roof'
export type Dir = 0 | 1 | 2 | 3

export const PIECE_TYPES: readonly PieceType[] = ['wall', 'floor', 'ramp', 'roof']

/** Description complète (et sérialisable) d'une pièce posée sur la grille. */
export interface PieceSpec {
  type: PieceType
  /**
   * Emplacement occupé (voir `docs/construction.md`) : deux pièces ne peuvent pas
   * partager la même clé. Rampe et toit occupent le même emplacement (le volume
   * de la case), donc ne peuvent pas coexister dans une case à un même étage.
   */
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

export interface Vec3 {
  x: number
  y: number
  z: number
}

/** Données de visée, seules entrées nécessaires au placement d'une pièce. */
export interface BuildAim {
  /** Pieds du joueur. */
  feet: Vec3
  /** Orientation horizontale de la caméra (radians) : sens des rampes et des murs. */
  yaw: number
  /**
   * Point visé au réticule : impact du rayon de visée sur le décor ou une pièce
   * (légèrement ramené vers la caméra), ou point à portée maximale.
   */
  target: Vec3
}

/** Recherche d'une pièce existante par sa clé d'emplacement. */
export type PieceLookup = (key: string) => PieceSpec | undefined

const T = CONFIG.build.tile
const H = CONFIG.build.height
const TH = CONFIG.build.thickness
const ROOF_H = CONFIG.build.roofHeight
const QUARTER_TURN = Math.PI / 2
/** Petite marge numérique pour les comparaisons aux lignes de la grille. */
const EPSILON = 1e-6

/** Marge pour qu'un joueur posé sur un sol soit compté à l'étage de ce sol. */
const LEVEL_TOLERANCE = 0.3
/** On ne construit que dans la case du joueur et ses voisines (en cases). */
const TILE_REACH = 1
/** On ne construit qu'à un étage près autour de celui du joueur. */
const LEVEL_REACH = 1
/**
 * Sols, toits et rampes (pièces posées sur une limite d'étage) passent à l'étage
 * supérieur quand le point visé dépasse les 3/4 de l'étage courant : regarder un
 * peu vers le haut ne suffit pas, mais sur une rampe on bascule vite au-dessus.
 */
const UPPER_LEVEL_FRACTION = 0.75

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

/** Emplacement "volume" d'une case à un étage, partagé par les rampes et les toits. */
function volumeKey(cx: number, level: number, cz: number) {
  return `volume:${cx}:${level}:${cz}`
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

/** Rampe montant vers la direction `dir`. Une seule rampe ou un seul toit par case et par étage. */
export function rampSpec(cx: number, level: number, cz: number, dir: Dir): PieceSpec {
  return {
    type: 'ramp',
    key: volumeKey(cx, level, cz),
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

/**
 * Hauteur à laquelle remonter un joueur après la pose de `spec`, ou `null`.
 *
 * Seule une pièce qui TRAVERSE le corps du joueur (surface entre ses pieds et
 * le haut de sa tête) le remonte dessus, pour qu'il ne reste pas coincé dedans.
 * Une pièce entièrement au-dessus de sa tête le laisse libre en dessous.
 */
export function liftHeightAfterPlacing(
  spec: PieceSpec,
  feet: { x: number, y: number, z: number },
  playerHeight: number,
): number | null {
  const surface = walkableSurfaceY(spec, feet.x, feet.z)
  if (surface === null) return null
  return surface > feet.y && surface < feet.y + playerHeight ? surface : null
}

/**
 * Toit en pyramide sur la case (cx, cz), base à la hauteur de l'étage `level`.
 * Il peut coexister avec un sol dans la même case, mais pas avec une rampe.
 */
export function roofSpec(cx: number, level: number, cz: number): PieceSpec {
  return {
    type: 'roof',
    key: volumeKey(cx, level, cz),
    x: cx * T + T / 2,
    y: level * H + ROOF_H / 2,
    z: cz * T + T / 2,
    sx: T,
    sy: ROOF_H,
    sz: T,
    pitch: 0,
    yaw: 0,
    level,
    dir: 0,
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
  if (spec.type === 'roof') {
    // Pyramide : la hauteur décroît linéairement du sommet vers le bord le plus proche.
    const fromCenter = Math.max(Math.abs(x - spec.x), Math.abs(z - spec.z)) / half
    return spec.level * H + spec.sy * (1 - fromCenter)
  }
  return null
}

/**
 * Choisit l'emplacement de la pièce à poser à partir du POINT VISÉ au réticule,
 * comme dans les jeux du genre :
 *  - la case est celle qui contient le point visé (bornée aux cases voisines) ;
 *  - l'étage dépend de la hauteur du point visé (borné à un étage près), avec la
 *    même règle pour toutes les pièces posées sur une limite d'étage (sol, toit, rampe) ;
 *  - sol / toit : sur la case visée, au sol compris ; un toit visé sur une rampe
 *    se pose au-dessus d'elle ;
 *  - rampe : sur la case visée, montant dans le sens du regard ; si une rampe
 *    montant dans le même sens y est déjà, la nouvelle la prolonge ;
 *  - mur : sur le bord de case, perpendiculaire au regard, le plus proche du point visé.
 *
 * Les comportements usuels en découlent : collé à un mur, le rayon touche le mur
 * et la rampe se pose de notre côté ; viser au-dessus d'un mur pose un toit derrière.
 */
export function computePlacement(type: PieceType, aim: BuildAim, lookup: PieceLookup): PieceSpec {
  const dir = yawToDir(aim.yaw)
  const [pcx, pcz] = cellOf(aim.feet.x, aim.feet.z)
  const playerLevel = levelOf(aim.feet.y)

  // Point visé ramené dans la zone constructible (case du joueur +/- TILE_REACH).
  const x = clamp(aim.target.x, (pcx - TILE_REACH) * T, (pcx + TILE_REACH + 1) * T - EPSILON)
  const z = clamp(aim.target.z, (pcz - TILE_REACH) * T, (pcz + TILE_REACH + 1) * T - EPSILON)
  const [cx, cz] = cellOf(x, z)
  const level = (raw: number) => clamp(raw, Math.max(0, playerLevel - LEVEL_REACH), playerLevel + LEVEL_REACH)

  switch (type) {
    case 'floor':
      return floorSpec(cx, level(surfaceLevel(aim.target.y)), cz)
    case 'roof': {
      // La base d'un toit se pose comme un sol : même règle d'étage.
      const target = roofSpec(cx, level(surfaceLevel(aim.target.y)), cz)
      // Le volume visé contient déjà une rampe : le toit se pose au-dessus d'elle.
      if (lookup(target.key)?.type !== 'ramp') return target
      return roofSpec(cx, target.level + 1, cz)
    }
    case 'ramp': {
      const target = rampSpec(cx, level(surfaceLevel(aim.target.y)), cz, dir)
      const existing = lookup(target.key)
      if (existing?.type !== 'ramp' || existing.dir !== dir) return target
      // Une rampe montant dans le même sens est déjà là : on la prolonge.
      const [fx, fz] = DIR_VEC[dir]
      return rampSpec(cx + fx, target.level + 1, cz + fz, dir)
    }
    case 'wall':
      return wallFacing(dir, x, z, aim.feet, level(Math.floor(aim.target.y / H)))
  }
}

/**
 * Mur perpendiculaire à `dir`, sur la ligne de grille la plus proche du point
 * (x, z) parmi celles qui ne sont pas derrière le joueur.
 */
function wallFacing(dir: Dir, x: number, z: number, feet: Vec3, level: number): PieceSpec {
  const alongX = dir === 1 || dir === 3
  const [fx, fz] = DIR_VEC[dir]
  const forward = alongX ? fx : fz
  const point = alongX ? x : z
  const player = alongX ? feet.x : feet.z

  // Les deux lignes de grille qui encadrent le point visé sur l'axe du regard.
  const before = Math.floor(point / T)
  // Lignes devant le joueur, de la plus proche de lui à la plus éloignée
  // (à distance égale du point visé, on garde la plus proche du joueur).
  const candidates = [before, before + 1]
    .filter((line) => (line * T - player) * forward > -EPSILON)
    .sort((a, b) => Math.abs(a * T - player) - Math.abs(b * T - player))
  // Point visé derrière le joueur : on prend le bord avant de sa propre case.
  const ownFrontLine = forward > 0 ? Math.floor(player / T) + 1 : Math.floor(player / T)
  const line = candidates.length === 0
    ? ownFrontLine
    : candidates.reduce((best, c) => (Math.abs(c * T - point) < Math.abs(best * T - point) ? c : best))

  // wallSpec attend une case et le côté de cette case : on prend la case
  // derrière la ligne (côté joueur) et son bord avant.
  if (alongX) {
    const [, cz] = cellOf(x, z)
    return forward > 0 ? wallSpec(line - 1, level, cz, 3) : wallSpec(line, level, cz, 1)
  }
  const [cx] = cellOf(x, z)
  return forward > 0 ? wallSpec(cx, level, line - 1, 2) : wallSpec(cx, level, line, 0)
}

/** Étage d'un sol, de la base d'un toit ou du bas d'une rampe, pour un point visé à la hauteur `y`. */
function surfaceLevel(y: number) {
  return Math.floor(y / H + 1 - UPPER_LEVEL_FRACTION)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
