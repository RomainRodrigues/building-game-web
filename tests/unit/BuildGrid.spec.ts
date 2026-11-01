import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../app/game/config'
import {
  cellOf,
  computePlacement,
  floorSpec,
  levelOf,
  liftHeightAfterPlacing,
  rampMidlineY,
  rampSpec,
  roofSpec,
  walkableSurfaceY,
  wallSpec,
  yawToDir,
  type BuildAim,
  type PieceLookup,
  type PieceSpec,
  type Vec3,
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

/** Joueur au centre de la case (0, 0), au sol, regardant vers -Z, qui vise `target`. */
function aim(target: Vec3, overrides: Partial<BuildAim> = {}): BuildAim {
  return { feet: { x: T / 2, y: 0, z: T / 2 }, yaw: 0, target, ...overrides }
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

describe('roofSpec', () => {
  it('occupe le même emplacement qu\'une rampe (volume de la case)', () => {
    for (const dir of [0, 1, 2, 3] as const) {
      expect(roofSpec(0, 1, 0).key).toBe(rampSpec(0, 1, 0, dir).key)
    }
    expect(roofSpec(0, 1, 0).key).not.toBe(rampSpec(0, 0, 0, 0).key)
  })

  it('pose la base au sommet de l\'étage et a une clé distincte du sol', () => {
    const roof = roofSpec(0, 1, 0)
    expect(roof.y - roof.sy / 2).toBeCloseTo(H)
    expect(roof.key).not.toBe(floorSpec(0, 1, 0).key)
  })

  it('a une surface en pyramide : sommet au centre, base sur les bords', () => {
    const roof = roofSpec(0, 1, 0)
    const ROOF_H = CONFIG.build.roofHeight
    expect(walkableSurfaceY(roof, roof.x, roof.z)).toBeCloseTo(H + ROOF_H)
    expect(walkableSurfaceY(roof, roof.x + T / 2, roof.z)).toBeCloseTo(H)
    expect(walkableSurfaceY(roof, roof.x + T / 4, roof.z - T / 4)).toBeCloseTo(H + ROOF_H / 2)
  })
})

describe('liftHeightAfterPlacing', () => {
  const height = CONFIG.player.height
  const ramp = rampSpec(0, 0, 0, 0) // monte vers -Z, de z = T (bas) à z = 0 (haut)

  it('remonte le joueur sur une pièce qui traverse son corps', () => {
    const feet = { x: T / 2, y: 0, z: T - 1 } // près du bas de la rampe
    const lift = liftHeightAfterPlacing(ramp, feet, height)
    expect(lift).not.toBeNull()
    expect(lift!).toBeGreaterThan(0)
    expect(lift!).toBeLessThan(height)
  })

  it('ne téléporte pas un joueur qui se trouve SOUS la rampe', () => {
    const feet = { x: T / 2, y: 0, z: 0.5 } // sous la partie haute
    expect(liftHeightAfterPlacing(ramp, feet, height)).toBeNull()
  })

  it('ne fait rien pour un toit au-dessus de la tête, un mur, ou hors de la pièce', () => {
    expect(liftHeightAfterPlacing(floorSpec(0, 1, 0), { x: T / 2, y: 0, z: T / 2 }, height)).toBeNull()
    expect(liftHeightAfterPlacing(wallSpec(0, 0, 0, 0), { x: T / 2, y: 0, z: 0 }, height)).toBeNull()
    expect(liftHeightAfterPlacing(ramp, { x: T * 3, y: 0, z: T / 2 }, height)).toBeNull()
  })
})

describe('computePlacement', () => {
  describe('sol et toit', () => {
    it('posent sur la case visée, au sol compris', () => {
      expect(computePlacement('floor', aim({ x: 2.5, y: 0, z: -1 }), empty).key).toBe(floorSpec(0, 0, -1).key)
      expect(computePlacement('roof', aim({ x: 2.5, y: 0, z: -2.5 }), empty).key).toBe(roofSpec(0, 0, -1).key)
      expect(computePlacement('roof', aim({ x: 2.5, y: 0, z: 1 }), empty).key).toBe(roofSpec(0, 0, 0).key)
    })

    it('restent à l\'étage du joueur quand on regarde à peine vers le haut', () => {
      expect(computePlacement('floor', aim({ x: 2.5, y: 2.4, z: -1 }), empty).level).toBe(0)
    })

    it('montent d\'un étage quand on vise en hauteur', () => {
      expect(computePlacement('floor', aim({ x: 2.5, y: 4.5, z: 2.5 }), empty).key).toBe(floorSpec(0, 1, 0).key)
      expect(computePlacement('roof', aim({ x: 2.5, y: 5, z: 2.5 }), empty).key).toBe(roofSpec(0, 1, 0).key)
    })

    it('suivent la même règle d\'étage : sur une rampe, ils passent au-dessus de la tête', () => {
      const onRamp = aim({ x: 2.5, y: 3.2, z: -2 }, { feet: { x: 2.5, y: 2, z: -2.5 } })
      const ramp = rampSpec(0, 0, -1, 0)
      expect(computePlacement('floor', onRamp, world(ramp)).key).toBe(floorSpec(0, 1, -1).key)
      expect(computePlacement('roof', onRamp, world(ramp)).key).toBe(roofSpec(0, 1, -1).key)
    })

    it('posent le toit au-dessus d\'une rampe visée, relié à elle', () => {
      const ramp = rampSpec(0, 0, -1, 0)
      const roof = computePlacement('roof', aim({ x: 2.5, y: 1, z: -2.5 }), world(ramp))
      expect(roof.key).toBe(roofSpec(0, 1, -1).key)
      const graph = new StructureGraph()
      graph.add(ramp)
      expect(graph.isSupported(roof)).toBe(true)
    })

    it('permettent de poser un toit par-dessus un mur, dans la case derrière', () => {
      expect(computePlacement('roof', aim({ x: 2.5, y: 4.5, z: -1 }), empty).key).toBe(roofSpec(0, 1, -1).key)
    })
  })

  describe('rampe', () => {
    it('se pose sur la case visée, montant dans le sens du regard', () => {
      expect(computePlacement('ramp', aim({ x: 2.5, y: 0.8, z: -2.5 }), empty).key).toBe(rampSpec(0, 0, -1, 0).key)
      const east = computePlacement('ramp', aim({ x: 7.5, y: 0.8, z: 2.5 }, { yaw: -Math.PI / 2 }), empty)
      expect(east.key).toBe(rampSpec(1, 0, 0, 3).key)
      expect(east.dir).toBe(3)
    })

    it('se pose dans la case du joueur quand il est collé à un mur', () => {
      // Le rayon touche le mur (z = 0) et le point visé est ramené du côté du joueur.
      const spec = computePlacement('ramp', aim({ x: 2.5, y: 1.5, z: 0.05 }), world(wallSpec(0, 0, 0, 0)))
      expect(spec.key).toBe(rampSpec(0, 0, 0, 0).key)
    })

    it('ne prolonge pas un toit : l\'emplacement est occupé', () => {
      const roof = roofSpec(0, 0, -1)
      expect(computePlacement('ramp', aim({ x: 2.5, y: 0.8, z: -2.5 }), world(roof)).key).toBe(roof.key)
    })

    it('prolonge une rampe déjà présente dans le même sens', () => {
      const existing = rampSpec(0, 0, -1, 0)
      expect(computePlacement('ramp', aim({ x: 2.5, y: 0.8, z: -2.5 }), world(existing)).key).toBe(rampSpec(0, 1, -2, 0).key)
    })

    it('enchaîne vers le haut pendant une montée ("ramp rush")', () => {
      const current = rampSpec(0, 0, -1, 0)
      const climbing = aim({ x: 2.5, y: 3.4, z: -6 }, { feet: { x: 2.5, y: 2, z: -2.5 } })
      const next = computePlacement('ramp', climbing, world(current))
      expect(next.key).toBe(rampSpec(0, 1, -2, 0).key)
      const graph = new StructureGraph()
      graph.add(current)
      expect(graph.isSupported(next)).toBe(true)
    })
  })

  describe('mur', () => {
    it('se pose sur le bord avant de la case du joueur quand on vise devant soi', () => {
      expect(computePlacement('wall', aim({ x: 2.5, y: 0, z: 1 }), empty).key).toBe(wallSpec(0, 0, 0, 0).key)
      // À égalité, la ligne la plus proche du joueur l'emporte.
      expect(computePlacement('wall', aim({ x: 2.5, y: 1, z: -2.5 }), empty).key).toBe(wallSpec(0, 0, 0, 0).key)
    })

    it('se pose plus loin quand on vise plus loin', () => {
      expect(computePlacement('wall', aim({ x: 2.5, y: 1, z: -4 }), empty).key).toBe(wallSpec(0, 0, -1, 0).key)
    })

    it('n\'est jamais posé derrière le joueur', () => {
      const atBack = aim({ x: 2.5, y: 1, z: 2.5 }, { feet: { x: 2.5, y: 0, z: 4.5 } })
      expect(computePlacement('wall', atBack, empty).key).toBe(wallSpec(0, 0, 0, 0).key)
    })

    it('se pose au bout d\'une rampe en visant devant, au-dessus en visant haut', () => {
      const onRamp = { feet: { x: 2.5, y: 2, z: -2.5 } }
      expect(computePlacement('wall', aim({ x: 2.5, y: 2.8, z: -6 }, onRamp), empty).key).toBe(wallSpec(0, 0, -1, 0).key)
      expect(computePlacement('wall', aim({ x: 2.5, y: 5, z: -6 }, onRamp), empty).key).toBe(wallSpec(0, 1, -1, 0).key)
    })

    it('suit l\'orientation du regard', () => {
      const west = computePlacement('wall', aim({ x: 1, y: 1, z: 2.5 }, { yaw: Math.PI / 2 }), empty)
      expect(west.key).toBe(wallSpec(0, 0, 0, 1).key)
    })
  })

  describe('portée', () => {
    it('limite la case aux voisines de celle du joueur', () => {
      expect(computePlacement('floor', aim({ x: 2.5, y: 0, z: -30 }), empty).key).toBe(floorSpec(0, 0, -1).key)
    })

    it('limite l\'étage à un étage près autour du joueur', () => {
      expect(computePlacement('floor', aim({ x: 2.5, y: 40, z: 2.5 }), empty).level).toBe(1)
      expect(computePlacement('floor', aim({ x: 2.5, y: -10, z: 2.5 }), empty).level).toBe(0)
    })
  })
})
