import { describe, expect, it } from 'vitest'
import { createRandom } from '../../app/game/utils/random'

describe('createRandom', () => {
  it('est déterministe pour une même graine', () => {
    const a = createRandom(1337)
    const b = createRandom(1337)
    const seqA = Array.from({ length: 5 }, a.next)
    const seqB = Array.from({ length: 5 }, b.next)
    expect(seqA).toEqual(seqB)
  })

  it('produit des valeurs dans les bornes demandées', () => {
    const rng = createRandom(1)
    for (let i = 0; i < 1000; i++) {
      const n = rng.next()
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThan(1)
      const r = rng.range(-5, 5)
      expect(r).toBeGreaterThanOrEqual(-5)
      expect(r).toBeLessThan(5)
    }
  })
})
