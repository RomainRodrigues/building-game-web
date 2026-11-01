/**
 * Boucle de jeu à pas de temps fixe ("fixed timestep").
 *
 * - `update(dt)` est appelé exactement `tickRate` fois par seconde, quelle que
 *   soit la vitesse de l'écran : la simulation est déterministe et stable.
 * - `render(alpha)` est appelé à chaque frame ; `alpha` (0..1) indique où l'on
 *   se trouve entre deux ticks, pour interpoler l'affichage en douceur.
 *
 * Réf : https://gafferongames.com/post/fix_your_timestep/
 */
export class Loop {
  private readonly step: number
  private accumulator = 0
  private last = 0
  private rafId = 0
  private running = false

  constructor(
    tickRate: number,
    private readonly update: (dt: number) => void,
    private readonly render: (alpha: number, frameDt: number) => void,
  ) {
    this.step = 1 / tickRate
  }

  start() {
    if (this.running) return
    this.running = true
    this.last = performance.now()
    this.rafId = requestAnimationFrame(this.frame)
  }

  stop() {
    this.running = false
    cancelAnimationFrame(this.rafId)
  }

  private frame = (now: number) => {
    if (!this.running) return
    // On borne le delta pour éviter la "spirale de la mort" après un onglet en pause.
    const frameDt = Math.min((now - this.last) / 1000, 0.25)
    this.last = now
    this.accumulator += frameDt

    while (this.accumulator >= this.step) {
      this.update(this.step)
      this.accumulator -= this.step
    }

    this.render(this.accumulator / this.step, frameDt)
    this.rafId = requestAnimationFrame(this.frame)
  }
}
