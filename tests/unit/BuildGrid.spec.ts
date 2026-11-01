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
  type PieceSpec,
  type Viewer,
} from '../../app/game/build/BuildGrid'
import { StructureGraph } from '../../app/game/build/Structure'

const T = CONFIG.build.tile
const H = CONFIG.build.height
const noRamp = () => undefined

/** Joueur au centre de la case (cx, cz), regard horizontal. */
function viewer(cx: number, cz: number, overrides: Partial<Viewer> = {}): Viewer {
  return { x: cx * T + T / 2, z: cz * T + T / 2, feetY: 0, yaw: 0, pitch: 0, ...overrides }
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
    expect(computePlacement('wall', viewer(0, 0), noRamp).key).toBe(wallSpec(0, 0, 0, 0).key)
    expect(computePlacement('wall', viewer(0, 0, { yaw: Math.PI / 2 }), noRamp).key).toBe(wallSpec(0, 0, 0, 1).key)
  })

  it('monte le mur d\'un étage quand on regarde vers le haut', () => {
    expect(computePlacement('wall', viewer(0, 0, { pitch: 1 }), noRamp).level).toBe(1)
  })

  it('choisit l\'étage du sol selon le regard', () => {
    expect(computePlacement('floor', viewer(0, 0, { pitch: -1 }), noRamp).key).toBe(floorSpec(0, 0, 0).key)
    expect(computePlacement('floor', viewer(0, 0, { pitch: 0.8 }), noRamp).key).toBe(floorSpec(0, 1, 0).key)
    expect(computePlacement('floor', viewer(0, 0), noRamp).key).toBe(floorSpec(0, 0, -1).key)
  })

  it('pose la rampe dans la case devant le joueur', () => {
    const spec = computePlacement('ramp', viewer(0, 0), noRamp)
    expect(spec.key).toBe(rampSpec(0, 0, -1, 0).key)
    expect(spec.dir).toBe(0)
  })

  it('enchaîne les rampes vers le haut quand on est déjà sur une rampe ("ramp rush")', () => {
    const current = rampSpec(0, 0, -1, 0)
    const rampAt = (cx: number, level: number, cz: number): PieceSpec | undefined =>
      cx === 0 && level === 0 && cz === -1 ? current : undefined
    const onRamp = viewer(0, -1, { feetY: H / 2 })
    const next = computePlacement('ramp', onRamp, rampAt)
    expect(next.key).toBe(rampSpec(0, 1, -2, 0).key)
  })

  describe('sur une rampe qui monte dans le sens du regard', () => {
    const current = rampSpec(0, 0, -1, 0)
    const rampAt = (cx: number, level: number, cz: number): PieceSpec | undefined =>
      cx === 0 && level === 0 && cz === -1 ? current : undefined
    const onRamp = viewer(0, -1, { feetY: H / 2 })

    it('pose le mur sur le bord haut de la rampe, pas dans la case suivante', () => {
      const wall = computePlacement('wall', onRamp, rampAt)
      expect(wall.key).toBe(wallSpec(0, 1, -1, 0).key)
      // Le bas du mur est exactement au sommet de la rampe.
      expect(wall.y - wall.sy / 2).toBeCloseTo(H)
    })

    it('prolonge la montée avec un sol au sommet de la rampe', () => {
      expect(computePlacement('floor', onRamp, rampAt).key).toBe(floorSpec(0, 1, -2).key)
    })

    it('pose des pièces reliées à la rampe (donc constructibles)', () => {
      const graph = new StructureGraph()
      graph.add(current)
      for (const type of ['wall', 'floor', 'ramp'] as const) {
        expect(graph.isSupported(computePlacement(type, onRamp, rampAt))).toBe(true)
      }
    })
  })

  it('n\'enchaîne pas si la rampe monte dans une autre direction', () => {
    const current = rampSpec(0, 0, 0, 3)
    const spec = computePlacement('ramp', viewer(0, 0, { feetY: H / 2 }), () => current)
    expect(spec.level).toBe(0)
  })
})
