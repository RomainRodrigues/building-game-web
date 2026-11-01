import { describe, expect, it, vi } from 'vitest'
import { Loop, type FrameScheduler } from '../../app/game/core/Loop'

/** Horloge manuelle : chaque `advance(ms)` déclenche une frame. */
function createManualScheduler() {
  let time = 0
  let pending: ((time: number) => void) | null = null
  const scheduler: FrameScheduler = {
    now: () => time,
    request: (cb) => {
      pending = cb
      return 1
    },
    cancel: () => {
      pending = null
    },
  }
  const advance = (ms: number) => {
    time += ms
    const cb = pending
    pending = null
    cb?.(time)
  }
  return { scheduler, advance }
}

function createLoop(tickRate = 60, maxFrameDelta = 0.25) {
  const { scheduler, advance } = createManualScheduler()
  const update = vi.fn<(dt: number) => void>()
  const render = vi.fn<(alpha: number, frameDt: number) => void>()
  const loop = new Loop({ tickRate, maxFrameDelta, update, render, scheduler })
  return { loop, advance, update, render }
}

describe('Loop', () => {
  it('exécute un nombre fixe de ticks quelle que soit la durée des frames', () => {
    const { loop, advance, update } = createLoop(60)
    loop.start()
    for (let i = 0; i < 60; i++) advance(1000 / 30) // écran à 30 FPS pendant 2 s
    expect(update.mock.calls.length).toBeGreaterThanOrEqual(119)
    expect(update.mock.calls.length).toBeLessThanOrEqual(120)
    expect(update).toHaveBeenCalledWith(1 / 60)
  })

  it('fournit un alpha d\'interpolation entre 0 et 1', () => {
    const { loop, advance, render } = createLoop(10)
    loop.start()
    advance(150) // 1 tick (100 ms) + 50 ms de reste
    const [alpha] = render.mock.lastCall!
    expect(alpha).toBeCloseTo(0.5)
  })

  it('borne le delta après une longue pause', () => {
    const { loop, advance, update } = createLoop(60, 0.25)
    loop.start()
    advance(10_000)
    expect(update).toHaveBeenCalledTimes(15)
  })

  it('ne fait plus rien une fois arrêtée', () => {
    const { loop, advance, update, render } = createLoop()
    loop.start()
    loop.stop()
    advance(100)
    expect(update).not.toHaveBeenCalled()
    expect(render).not.toHaveBeenCalled()
    expect(loop.isRunning).toBe(false)
  })
})
