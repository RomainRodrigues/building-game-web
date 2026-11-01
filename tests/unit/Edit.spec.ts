import { describe, expect, it } from 'vitest'
import { CONFIG } from '../../app/game/config'
import { floorSpec, rampSpec, roofSpec, wallSpec } from '../../app/game/build/BuildGrid'
import {
  columnMask,
  editGrid,
  fullMask,
  hasTile,
  isEditable,
  isValidEdit,
  NO_EDIT,
  remainingBoxes,
  tileAt,
  tileBoxes,
  withTile,
  type TileMask,
} from '../../app/game/build/Edit'

const T = CONFIG.build.tile
const H = CONFIG.build.height

/** Masque à partir d'une liste de tuiles retirées. */
const mask = (...tiles: number[]): TileMask => tiles.reduce((m, t) => withTile(m, t, true), NO_EDIT)

// Mur 3 x 3 : tuiles 0-2 en bas, 3-5 au milieu, 6-8 en haut.
const WINDOW = mask(4)
const DOOR = mask(1, 4)
const ARCH = mask(0, 1, 2, 4)
const HALF_WALL = mask(3, 4, 5, 6, 7, 8)

describe('grilles', () => {
  it('découpe murs, sols et rampes ; le toit n\'est pas éditable', () => {
    expect(editGrid('wall')).toEqual({ cols: 3, rows: 3 })
    expect(editGrid('floor')).toEqual({ cols: 2, rows: 2 })
    expect(editGrid('ramp')).toEqual({ cols: 2, rows: 2 })
    expect(isEditable('roof')).toBe(false)
  })

  it('manipule les masques de tuiles', () => {
    expect(hasTile(DOOR, 1)).toBe(true)
    expect(hasTile(DOOR, 7)).toBe(false)
    expect(withTile(DOOR, 1, false)).toBe(WINDOW)
    expect(fullMask({ cols: 2, rows: 2 })).toBe(0b1111)
    expect(columnMask({ cols: 2, rows: 2 }, 1)).toBe(0b1010)
  })
})

describe('isValidEdit', () => {
  it('accepte les éditions usuelles d\'un mur', () => {
    for (const edit of [NO_EDIT, WINDOW, DOOR, ARCH, HALF_WALL]) expect(isValidEdit('wall', edit)).toBe(true)
  })

  it('exige qu\'au moins une tuile reste sur un mur ou un sol', () => {
    expect(isValidEdit('wall', fullMask({ cols: 3, rows: 3 }))).toBe(false)
    expect(isValidEdit('floor', 0b1111)).toBe(false)
    expect(isValidEdit('floor', 0b0111)).toBe(true)
    expect(isValidEdit('floor', 0b1001)).toBe(true)
  })

  it('n\'autorise sur une rampe que le retrait d\'une colonne entière', () => {
    expect(isValidEdit('ramp', 0b0101)).toBe(true)
    expect(isValidEdit('ramp', 0b1010)).toBe(true)
    expect(isValidEdit('ramp', 0b0001)).toBe(false)
    expect(isValidEdit('ramp', 0b0011)).toBe(false)
  })

  it('refuse toute édition d\'un toit et les tuiles hors grille', () => {
    expect(isValidEdit('roof', 0b1)).toBe(false)
    expect(isValidEdit('roof', NO_EDIT)).toBe(true)
    expect(isValidEdit('floor', 1 << 4)).toBe(false)
  })
})

describe('tileAt', () => {
  it('repère les tuiles d\'un mur, quelle que soit son orientation', () => {
    const north = wallSpec(0, 0, 0, 0) // largeur selon X
    expect(tileAt(north, { x: 0, y: 0, z: 0 })).toBe(4)
    expect(tileAt(north, { x: 0, y: -H / 2 + 0.1, z: 0 })).toBe(1)
    expect(tileAt(north, { x: T / 2 - 0.1, y: H / 2 - 0.1, z: 0 })).toBe(8)
    const east = wallSpec(0, 0, 0, 3) // largeur selon Z
    expect(tileAt(east, { x: 0, y: -H / 2 + 0.1, z: -T / 2 + 0.1 })).toBe(0)
  })

  it('repère les tuiles d\'un sol et d\'une rampe', () => {
    expect(tileAt(floorSpec(0, 0, 0), { x: -1, y: 0, z: -1 })).toBe(0)
    expect(tileAt(floorSpec(0, 0, 0), { x: 1, y: 0, z: 1 })).toBe(3)
    expect(tileAt(rampSpec(0, 0, 0, 0), { x: 1, y: 0, z: -1 })).toBe(1)
  })

  it('renvoie null hors de la pièce ou pour un toit', () => {
    expect(tileAt(floorSpec(0, 0, 0), { x: T, y: 0, z: 0 })).toBeNull()
    expect(tileAt(roofSpec(0, 0, 0), { x: 0, y: 0, z: 0 })).toBeNull()
  })
})

describe('boîtes des tuiles', () => {
  it('découpe la pièce en tuiles qui la recouvrent exactement', () => {
    const wall = wallSpec(0, 0, 0, 0)
    const boxes = tileBoxes(wall)
    expect(boxes).toHaveLength(9)
    expect(boxes[0]!.size.x).toBeCloseTo(T / 3)
    expect(boxes[0]!.size.y).toBeCloseTo(H / 3)
    expect(boxes[0]!.center.x).toBeCloseTo(-T / 3)
    expect(boxes[0]!.center.y).toBeCloseTo(-H / 3)
    const volume = boxes.reduce((sum, b) => sum + b.size.x * b.size.y * b.size.z, 0)
    expect(volume).toBeCloseTo(wall.sx * wall.sy * wall.sz)
  })

  it('garde la pièce entière sans édition, et les tuiles restantes sinon', () => {
    const wall = wallSpec(0, 0, 0, 0)
    expect(remainingBoxes(wall, NO_EDIT)).toHaveLength(1)
    expect(remainingBoxes(wall, DOOR)).toHaveLength(7)
    const halfRamp = remainingBoxes(rampSpec(0, 0, 0, 0), 0b1010)
    expect(halfRamp).toHaveLength(2)
    expect(halfRamp.every((b) => b.center.x < 0)).toBe(true)
  })
})
