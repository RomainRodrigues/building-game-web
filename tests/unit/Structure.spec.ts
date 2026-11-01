import { beforeEach, describe, expect, it } from 'vitest'
import { floorSpec, rampSpec, wallSpec } from '../../app/game/build/BuildGrid'
import { isAnchored, jointsOf, StructureGraph } from '../../app/game/build/Structure'

const shareJoint = (a: string[], b: string[]) => a.some((joint) => b.includes(joint))

describe('jointsOf', () => {
  it('relie un mur posé sur le bord d\'un sol', () => {
    expect(shareJoint(jointsOf(floorSpec(0, 1, 0)), jointsOf(wallSpec(0, 1, 0, 0)))).toBe(true)
  })

  it('relie un sol posé sur le haut d\'un mur', () => {
    expect(shareJoint(jointsOf(wallSpec(0, 0, 0, 3)), jointsOf(floorSpec(0, 1, 0)))).toBe(true)
  })

  it('relie deux murs empilés et deux murs en coin', () => {
    expect(shareJoint(jointsOf(wallSpec(0, 0, 0, 0)), jointsOf(wallSpec(0, 1, 0, 0)))).toBe(true)
    expect(shareJoint(jointsOf(wallSpec(0, 0, 0, 0)), jointsOf(wallSpec(0, 0, 0, 3)))).toBe(true)
  })

  it('relie deux rampes qui se suivent', () => {
    expect(shareJoint(jointsOf(rampSpec(0, 0, -1, 0)), jointsOf(rampSpec(0, 1, -2, 0)))).toBe(true)
  })

  it('relie une rampe aux murs et aux rampes posés à côté', () => {
    const ramp = rampSpec(0, 1, 0, 0)
    expect(shareJoint(jointsOf(ramp), jointsOf(wallSpec(0, 1, 0, 1)))).toBe(true)
    expect(shareJoint(jointsOf(ramp), jointsOf(rampSpec(1, 1, 0, 0)))).toBe(true)
  })

  it('ne relie pas deux sols éloignés ni deux sols d\'étages différents', () => {
    expect(shareJoint(jointsOf(floorSpec(0, 1, 0)), jointsOf(floorSpec(2, 1, 0)))).toBe(false)
    expect(shareJoint(jointsOf(floorSpec(0, 1, 0)), jointsOf(floorSpec(0, 2, 0)))).toBe(false)
  })

  it('identifie les pièces posées sur le terrain', () => {
    expect(isAnchored(wallSpec(0, 0, 0, 0))).toBe(true)
    expect(isAnchored(floorSpec(0, 1, 0))).toBe(false)
  })
})

describe('StructureGraph', () => {
  let graph: StructureGraph

  beforeEach(() => {
    graph = new StructureGraph()
  })

  it('accepte une pièce posée au sol', () => {
    expect(graph.isSupported(wallSpec(0, 0, 0, 0))).toBe(true)
  })

  it('refuse une pièce en l\'air sans appui', () => {
    expect(graph.isSupported(floorSpec(0, 1, 0))).toBe(false)
    expect(graph.isSupported(wallSpec(5, 2, 5, 1))).toBe(false)
  })

  it('accepte une pièce qui touche une construction existante', () => {
    graph.add(wallSpec(0, 0, 0, 0))
    expect(graph.isSupported(floorSpec(0, 1, 0))).toBe(true)
    expect(graph.isSupported(floorSpec(0, 1, -1))).toBe(true)
  })

  it('fait s\'effondrer ce qui ne tient plus quand on retire le support', () => {
    const wall = wallSpec(0, 0, 0, 0)
    const floor = floorSpec(0, 1, 0)
    const upperWall = wallSpec(0, 1, 0, 2)
    graph.add(wall)
    graph.add(floor)
    graph.add(upperWall)

    const collapsed = graph.remove(wall.key)

    expect(collapsed.sort()).toEqual([floor.key, upperWall.key].sort())
    expect(graph.size).toBe(0)
  })

  it('garde une pièce qui reste reliée au sol par un autre chemin', () => {
    const left = wallSpec(0, 0, 0, 1)
    const right = wallSpec(0, 0, 0, 3)
    const roof = floorSpec(0, 1, 0)
    graph.add(left)
    graph.add(right)
    graph.add(roof)

    expect(graph.remove(left.key)).toEqual([])
    expect(graph.has(roof.key)).toBe(true)
  })

  it('effondre toute une montée de rampes quand on coupe la première', () => {
    const ramps = [rampSpec(0, 0, -1, 0), rampSpec(0, 1, -2, 0), rampSpec(0, 2, -3, 0)]
    for (const ramp of ramps) {
      expect(graph.isSupported(ramp)).toBe(true)
      graph.add(ramp)
    }
    expect(graph.remove(ramps[0]!.key).sort()).toEqual([ramps[1]!.key, ramps[2]!.key].sort())
  })

  it('ne renvoie rien pour une pièce inconnue et vide tout avec clear()', () => {
    expect(graph.remove('inconnue')).toEqual([])
    graph.add(wallSpec(0, 0, 0, 0))
    graph.clear()
    expect(graph.size).toBe(0)
  })
})
