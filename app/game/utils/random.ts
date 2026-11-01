/**
 * Générateur pseudo-aléatoire déterministe (mulberry32).
 * Même graine => même suite de nombres : la carte est identique à chaque partie
 * (indispensable pour un futur multijoueur, et pour des tests reproductibles).
 */
export function createRandom(seed: number) {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    /** Nombre dans [0, 1[ */
    next,
    /** Nombre dans [min, max[ */
    range: (min: number, max: number) => min + next() * (max - min),
  }
}

export type Random = ReturnType<typeof createRandom>
