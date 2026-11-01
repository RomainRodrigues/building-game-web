import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../app/game/config'
import {
  cellOf,
  computePlacement,
  floorSpec,
  levelOf,
  rampMidlineY,
  rampSpec,
  walkableSurfaceY,
  wallSpec,
  yawToDir,
  type PieceLookup,
  type PieceSpec,
  type Viewer,
} from '../../app/game/build/BuildGrid'
import { StructureGraph } from '../../app/game/build/Structure'

const T = CONFIG.build.tile
const H = CONFIG.build.height

/** Monde contenant les pièces données, interrogeable par clé comme dans le jeu. */
function world(...pieces: PieceSpec[]): PieceLookup {
  const byKey = new Map(pieces.map((piece) => [piece.key, piece]))
  return (key) => byKey.get(key)
}
const empty = world()

/** Joueur au centre de la case (cx, cz), regard horizontal. */
function viewer(cx: number, cz: number, overrides: Partial<Viewer> = {}): Viewer {
  return { x: cx * T + T / 2, z: cz * T + T / 2, feetY: 0, yaw: 0, pitch: 0, airborne: false, ...overrides }
}

describe('yawToDir', () => {
  it.each([
    [0, 0],
    [Math.PI / 2, 1],
    [Math.PI, 2],
    [-Math.PI / 2, 3],
    [2 * Math.PI, 0],
    [-2.5 * Math.PI, 3],
  ])('yaw %f -> direction %i', (yaw, dir) => {
    expect(yawToDir(yaw)).toBe(dir)
  })

  it('arrondit au quart de tour le plus proche', () => {
    expect(yawToDir(0.7)).toBe(0)
    expect(yawToDir(0.9)).toBe(1)
  })
})

describe('cellOf / levelOf', () => {
  it('gère les coordonnées négatives', () => {
    expect(cellOf(0.1, -0.1)).toEqual([0, -1])
    expect(cellOf(-T - 0.1, T)).toEqual([-2, 1])
  })

  it('compte un joueur posé sur un sol à l\'étage de ce sol', () => {
    expect(levelOf(0)).toBe(0)
    expect(levelOf(H - 0.1)).toBe(1)
    expect(levelOf(H + 0.1)).toBe(1)
  })
})

describe('wallSpec', () => {
  it('donne la même clé aux deux côtés d\'une arête partagée', () => {
    expect(wallSpec(0, 0, 0, 3).key).toBe(wallSpec(1, 0, 0, 1).key)
    expect(wallSpec(0, 0, 0, 2).key).toBe(wallSpec(0, 0, 1, 0).key)
  })

  it('place le mur sur la frontière de la case', () => {
    const north = wallSpec(0, 0, 0, 0)
    expect(north.z).toBe(0)
    expect(north.y).toBe(H / 2)
    const east = wallSpec(0, 1, 0, 3)
    expect(east.x).toBe(T)
    expect(east.y).toBe(H + H / 2)
  })
})

describe('rampSpec / rampMidlineY', () => {
  it('monte d\'un étage complet dans la direction de la rampe', () => {
    const ramp = rampSpec(0, 0, 0, 0) // monte vers -Z
    expect(rampMidlineY(ramp, ramp.x, ramp.z + T / 2)).toBeCloseTo(0)
    expect(rampMidlineY(ramp, ramp.x, ramp.z)).toBeCloseTo(H / 2)
    expect(rampMidlineY(ramp, ramp.x, ramp.z - T / 2)).toBeCloseTo(H)
  })

  it('suit l\'orientation', () => {
    const east = rampSpec(0, 1, 0, 3) // monte vers +X
    expect(rampMidlineY(east, east.x + T / 2, east.z)).toBeCloseTo(2 * H)
  })
})

describe('walkableSurfaceY', () => {
  it('renvoie le dessus d\'un sol', () => {
    const floor = floorSpec(0, 1, 0)
    expect(walkableSurfaceY(floor, floor.x, floor.z)).toBeCloseTo(H + CONFIG.build.thickness / 2)
  })

  it('renvoie null hors de la pièce ou pour un mur', () => {
    const floor = floorSpec(0, 0, 0)
    expect(walkableSurfaceY(floor, floor.x + T, floor.z)).toBeNull()
    const wall = wallSpec(0, 0, 0, 0)
    expect(walkableSurfaceY(wall, wall.x, wall.z)).toBeNull()
  })
})

describe('computePlacement', () => {
  it('pose un mur sur le bord de la case, face au regard', () => {
    expect(computePlacement('wall', viewer(0, 0), empty).key).toBe(wallSpec(0, 0, 0, 0).key)
    expect(computePlacement('wall', viewer(0, 0, { yaw: Math.PI / 2 }), empty).key).toBe(wallSpec(0, 0, 0, 1).key)
  })

  it('monte le mur d\'un étage quand on regarde vers le haut', () => {
    expect(computePlacement('wall', viewer(0, 0, { pitch: 1 }), empty).level).toBe(1)
  })

  it('choisit l\'étage du sol selon le regard', () => {
    expect(computePlacement('floor', viewer(0, 0, { pitch: -1 }), empty).key).toBe(floorSpec(0, 0, 0).key)
    expect(computePlacement('floor', viewer(0, 0, { pitch: 0.8 }), empty).key).toBe(floorSpec(0, 1, 0).key)
    expect(computePlacement('floor', viewer(0, 0), empty).key).toBe(floorSpec(0, 0, -1).key)
  })

  it('pose la rampe dans la case devant le joueur', () => {
    const spec = computePlacement('ramp', viewer(0, 0), empty)
    expect(spec.key).toBe(rampSpec(0, 0, -1, 0).key)
    expect(spec.dir).toBe(0)
  })

  describe('face à un mur', () => {
    it('construit la rampe dans la case du joueur, jamais derrière le mur', () => {
      const spec = computePlacement('ramp', viewer(0, 0), world(wallSpec(0, 0, 0, 0)))
      expect(spec.key).toBe(rampSpec(0, 0, 0, 0).key)
      expect(spec.dir).toBe(0)
    })

    it('construit le sol dans la case du joueur', () => {
      expect(computePlacement('floor', viewer(0, 0), world(wallSpec(0, 0, 0, 0))).key).toBe(floorSpec(0, 0, 0).key)
    })

    it('donne une rampe soutenue par le sol et le mur quand on est en hauteur', () => {
      const floor = floorSpec(0, 1, 0)
      const wall = wallSpec(0, 1, 0, 0)
      const lower = wallSpec(0, 0, 0, 1)
      const graph = new StructureGraph()
      ;[lower, floor, wall].forEach((piece) => graph.add(piece))

      const spec = computePlacement('ramp', viewer(0, 0, { feetY: H }), world(lower, floor, wall))
      expect(spec.key).toBe(rampSpec(0, 1, 0, 0).key)
      expect(graph.isSupported(spec)).toBe(true)
    })
  })

  describe('rampe déjà présente', () => {
    it('prolonge la rampe visée d\'une case et d\'un étage', () => {
      const existing = rampSpec(0, 0, -1, 0)
      expect(computePlacement('ramp', viewer(0, 0), world(existing)).key).toBe(rampSpec(0, 1, -2, 0).key)
    })

    it('n\'enchaîne pas si la rampe existante monte dans une autre direction', () => {
      const existing = rampSpec(0, 0, -1, 3)
      const spec = computePlacement('ramp', viewer(0, 0), world(existing))
      expect(spec.key).toBe(existing.key) // emplacement occupé : aperçu invalide
      expect(spec.level).toBe(0)
    })
  })

  describe('sur une rampe qui monte dans le sens du regard', () => {
    const current = rampSpec(0, 0, -1, 0)
    const lookup = world(current)
    const onRamp = viewer(0, -1, { feetY: H / 2 })

    it('enchaîne les rampes vers le haut ("ramp rush")', () => {
      expect(computePlacement('ramp', onRamp, lookup).key).toBe(rampSpec(0, 1, -2, 0).key)
    })

    it('enchaîne aussi depuis le bas de la rampe', () => {
      const z = -0.5 // tout près du bord bas (z = 0)
      const atBottom = viewer(0, -1, { z, feetY: rampMidlineY(current, T / 2, z) })
      expect(computePlacement('ramp', atBottom, lookup).key).toBe(rampSpec(0, 1, -2, 0).key)
    })

    it('ne considère pas qu\'on monte quand on est SOUS la rampe', () => {
      const z = -T + 0.5 // sous la partie haute
      const below = viewer(0, -1, { z, feetY: 0 })
      expect(computePlacement('floor', below, lookup).key).not.toBe(floorSpec(0, 1, -2).key)
    })

    it('pose le mur au bout de la rampe, au même étage, en regardant devant', () => {
      const wall = computePlacement('wall', onRamp, lookup)
      expect(wall.key).toBe(wallSpec(0, 0, -1, 0).key)
      // Le haut du mur est exactement au sommet de la rampe.
      expect(wall.y + wall.sy / 2).toBeCloseTo(H)
    })

    it('pose le mur au-dessus de la rampe en regardant vers le haut ou en sautant', () => {
      const above = wallSpec(0, 1, -1, 0).key
      expect(computePlacement('wall', { ...onRamp, pitch: 1 }, lookup).key).toBe(above)
      expect(computePlacement('wall', { ...onRamp, airborne: true }, lookup).key).toBe(above)
    })

    it('prolonge la montée avec un sol au sommet de la rampe', () => {
      expect(computePlacement('floor', onRamp, lookup).key).toBe(floorSpec(0, 1, -2).key)
    })

    it('pose des pièces reliées à la rampe (donc constructibles)', () => {
      const graph = new StructureGraph()
      graph.add(current)
      for (const type of ['wall', 'floor', 'ramp'] as const) {
        for (const view of [onRamp, { ...onRamp, airborne: true }]) {
          expect(graph.isSupported(computePlacement(type, view, lookup))).toBe(true)
        }
      }
    })
  })
})
