/** Horloge minimale utilisée par la boucle (injectable pour les tests). */
export interface FrameScheduler {
  now(): number
  request(callback: (time: number) => void): number
  cancel(handle: number): void
}

const browserScheduler: FrameScheduler = {
  now: () => performance.now(),
  request: (cb) => requestAnimationFrame(cb),
  cancel: (handle) => cancelAnimationFrame(handle),
}

export interface LoopOptions {
  tickRate: number
  /** Delta max d'une frame (s), pour ne pas "rattraper" des secondes après une pause. */
  maxFrameDelta: number
  /** Simulation : appelée exactement `tickRate` fois par seconde. */
  update: (dt: number) => void
  /** Affichage : appelé à chaque frame avec `alpha` (0..1) entre deux ticks. */
  render: (alpha: number, frameDt: number) => void
  scheduler?: FrameScheduler
}

/**
 * Boucle de jeu à pas de temps fixe ("fixed timestep").
 *
 * La simulation avance par pas constants, quelle que soit la fréquence de
 * l'écran (60 Hz, 144 Hz...) : le comportement est stable et reproductible.
 * Le rendu interpole entre les deux derniers états grâce à `alpha`.
 *
 * Réf : https://gafferongames.com/post/fix_your_timestep/
 */
export class Loop {
  private readonly step: number
  private readonly scheduler: FrameScheduler
  private accumulator = 0
  private last = 0
  private handle = 0
  private running = false

  constructor(private readonly options: LoopOptions) {
    this.step = 1 / options.tickRate
    this.scheduler = options.scheduler ?? browserScheduler
  }

  get isRunning() {
    return this.running
  }

  start() {
    if (this.running) return
    this.running = true
    this.accumulator = 0
    this.last = this.scheduler.now()
    this.handle = this.scheduler.request(this.frame)
  }

  stop() {
    this.running = false
    this.scheduler.cancel(this.handle)
  }

  private readonly frame = (now: number) => {
    if (!this.running) return
    const frameDt = Math.min((now - this.last) / 1000, this.options.maxFrameDelta)
    this.last = now
    this.accumulator += frameDt

    while (this.accumulator >= this.step) {
      this.options.update(this.step)
      this.accumulator -= this.step
    }

    this.options.render(this.accumulator / this.step, frameDt)
    this.handle = this.scheduler.request(this.frame)
  }
}
