/**
 * Intégrité structurelle des constructions : logique PURE (ni Three.js ni Rapier).
 *
 * Chaque pièce occupe des "jointures" de la grille :
 *  - arêtes horizontales (bord d'une case, à la hauteur d'un étage) ;
 *  - poteaux verticaux (coin d'une case, sur un étage), partagés par les murs et les rampes.
 * Deux pièces qui partagent une jointure sont connectées.
 *
 * Règles :
 *  - une pièce posée à l'étage 0 repose sur le terrain : elle est ancrée ;
 *  - une pièce ne peut être posée que si elle est ancrée OU touche une pièce existante
 *    (toutes les pièces existantes étant elles-mêmes reliées au sol) ;
 *  - quand une pièce disparaît, tout ce qui n'est plus relié au sol s'effondre.
 */
import { CONFIG } from '../config'
import type { PieceSpec } from './BuildGrid'

const T = CONFIG.build.tile

/** Arête parallèle à X, sur la frontière z = bz, au-dessus de la case cx, à l'étage `level`. */
const edgeAlongX = (cx: number, level: number, bz: number) => `ex:${cx}:${level}:${bz}`
/** Arête parallèle à Z, sur la frontière x = bx, au-dessus de la case cz, à l'étage `level`. */
const edgeAlongZ = (bx: number, level: number, cz: number) => `ez:${bx}:${level}:${cz}`
/** Poteau vertical au coin (bx, bz), entre les étages `level` et `level + 1`. */
const post = (bx: number, bz: number, level: number) => `p:${bx}:${bz}:${level}`

/** Indice de case contenant un centre de pièce (centre = case * T + T/2). */
const cellIndex = (center: number) => Math.floor(center / T)
/** Indice de frontière pour une coordonnée posée exactement sur une ligne de la grille. */
const boundaryIndex = (coordinate: number) => Math.round(coordinate / T)

/** Jointures occupées par une pièce. */
export function jointsOf(spec: PieceSpec): string[] {
  const level = spec.level
  switch (spec.type) {
    case 'floor': {
      const cx = cellIndex(spec.x)
      const cz = cellIndex(spec.z)
      return [
        edgeAlongX(cx, level, cz),
        edgeAlongX(cx, level, cz + 1),
        edgeAlongZ(cx, level, cz),
        edgeAlongZ(cx + 1, level, cz),
      ]
    }
    case 'wall': {
      // Mur sur une frontière X (directions ouest/est) ou Z (nord/sud).
      if (spec.dir === 1 || spec.dir === 3) {
        const bx = boundaryIndex(spec.x)
        const cz = cellIndex(spec.z)
        return [
          edgeAlongZ(bx, level, cz),
          edgeAlongZ(bx, level + 1, cz),
          post(bx, cz, level),
          post(bx, cz + 1, level),
        ]
      }
      const bz = boundaryIndex(spec.z)
      const cx = cellIndex(spec.x)
      return [
        edgeAlongX(cx, level, bz),
        edgeAlongX(cx, level + 1, bz),
        post(cx, bz, level),
        post(cx + 1, bz, level),
      ]
    }
    case 'ramp': {
      const cx = cellIndex(spec.x)
      const cz = cellIndex(spec.z)
      // Les 4 poteaux de coin relient la rampe aux murs et rampes posés à côté d'elle.
      const corners = [post(cx, cz, level), post(cx + 1, cz, level), post(cx, cz + 1, level), post(cx + 1, cz + 1, level)]
      // Bord bas à l'étage `level`, bord haut à `level + 1`, côté vers lequel la rampe monte.
      switch (spec.dir) {
        case 0: return [edgeAlongX(cx, level, cz + 1), edgeAlongX(cx, level + 1, cz), ...corners]
        case 2: return [edgeAlongX(cx, level, cz), edgeAlongX(cx, level + 1, cz + 1), ...corners]
        case 1: return [edgeAlongZ(cx + 1, level, cz), edgeAlongZ(cx, level + 1, cz), ...corners]
        case 3: return [edgeAlongZ(cx, level, cz), edgeAlongZ(cx + 1, level + 1, cz), ...corners]
      }
    }
  }
}

/** Une pièce posée à l'étage 0 repose sur le terrain (plat, en y = 0). */
export function isAnchored(spec: PieceSpec) {
  return spec.level === 0
}

interface Node {
  readonly spec: PieceSpec
  readonly joints: readonly string[]
}

/**
 * Graphe des constructions : pièces reliées par leurs jointures communes.
 * Invariant : toute pièce du graphe est reliée (directement ou non) au terrain.
 */
export class StructureGraph {
  private readonly nodes = new Map<string, Node>()
  private readonly occupants = new Map<string, Set<string>>()

  get size() {
    return this.nodes.size
  }

  has(key: string) {
    return this.nodes.has(key)
  }

  /** Vrai si la pièce tiendrait : ancrée au sol, ou touchant une pièce existante. */
  isSupported(spec: PieceSpec) {
    return isAnchored(spec) || jointsOf(spec).some((joint) => (this.occupants.get(joint)?.size ?? 0) > 0)
  }

  /** Ajoute une pièce. L'appelant doit avoir vérifié `isSupported` (invariant du graphe). */
  add(spec: PieceSpec) {
    if (this.nodes.has(spec.key)) return
    const joints = jointsOf(spec)
    this.nodes.set(spec.key, { spec, joints })
    for (const joint of joints) {
      let set = this.occupants.get(joint)
      if (!set) {
        set = new Set()
        this.occupants.set(joint, set)
      }
      set.add(spec.key)
    }
  }

  /**
   * Retire une pièce et renvoie les clés des pièces qui s'effondrent
   * (celles qui ne sont plus reliées au terrain), déjà retirées du graphe.
   */
  remove(key: string): string[] {
    const node = this.nodes.get(key)
    if (!node) return []
    const neighbors = this.neighborsOf(node)
    this.detach(key, node)

    // Seuls les voisins de la pièce retirée peuvent avoir perdu leur appui :
    // on explore la composante de chacun et on la supprime si elle ne touche pas le sol.
    const collapsed: string[] = []
    const settled = new Set<string>()
    for (const start of neighbors) {
      if (settled.has(start) || !this.nodes.has(start)) continue
      const component = this.componentOf(start)
      component.keys.forEach((k) => settled.add(k))
      if (component.anchored) continue
      for (const k of component.keys) {
        this.detach(k, this.nodes.get(k)!)
        collapsed.push(k)
      }
    }
    return collapsed
  }

  clear() {
    this.nodes.clear()
    this.occupants.clear()
  }

  private neighborsOf(node: Node) {
    const result = new Set<string>()
    for (const joint of node.joints) {
      for (const other of this.occupants.get(joint) ?? []) {
        if (other !== node.spec.key) result.add(other)
      }
    }
    return result
  }

  /** Parcours en largeur de la composante connexe contenant `start`. */
  private componentOf(start: string) {
    const keys = new Set<string>([start])
    const queue = [start]
    let anchored = false
    while (queue.length > 0) {
      const node = this.nodes.get(queue.pop()!)!
      if (isAnchored(node.spec)) anchored = true
      for (const next of this.neighborsOf(node)) {
        if (keys.has(next)) continue
        keys.add(next)
        queue.push(next)
      }
    }
    return { keys, anchored }
  }

  private detach(key: string, node: Node) {
    this.nodes.delete(key)
    for (const joint of node.joints) {
      const set = this.occupants.get(joint)
      set?.delete(key)
      if (set?.size === 0) this.occupants.delete(joint)
    }
  }
}
