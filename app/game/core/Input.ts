/**
 * Gestion des entrées clavier / souris.
 *
 * On utilise `KeyboardEvent.code` (touche *physique*) plutôt que `key` :
 * "KeyW" correspond à Z sur un clavier AZERTY et à W en QWERTY, donc les
 * contrôles fonctionnent partout sans configuration.
 *
 * Les événements "ponctuels" (appui sur une touche, clic) sont accumulés puis
 * consommés une fois par tick de simulation via `consumePressed()`.
 */
export class Input {
  private readonly down = new Set<string>()
  private pressed = new Set<string>()
  private mouseDX = 0
  private mouseDY = 0
  private wheel = 0
  private lockTime = 0

  locked = false
  onLockChange?: (locked: boolean) => void

  constructor(private readonly element: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
    element.addEventListener('mousedown', this.onMouseDown)
    window.addEventListener('mouseup', this.onMouseUp)
    window.addEventListener('mousemove', this.onMouseMove)
    element.addEventListener('wheel', this.onWheel, { passive: true })
    element.addEventListener('contextmenu', this.preventDefault)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
  }

  requestLock() {
    // requestPointerLock renvoie une Promise dans les navigateurs récents.
    const result = this.element.requestPointerLock() as unknown
    if (result instanceof Promise) result.catch(() => {})
  }

  isDown(code: string) {
    return this.down.has(code)
  }

  /** Renvoie les touches/boutons pressés depuis le dernier appel, puis les vide. */
  consumePressed(): ReadonlySet<string> {
    const p = this.pressed
    this.pressed = new Set()
    return p
  }

  consumeMouseDelta() {
    const d = { x: this.mouseDX, y: this.mouseDY }
    this.mouseDX = 0
    this.mouseDY = 0
    return d
  }

  consumeWheel() {
    const w = this.wheel
    this.wheel = 0
    return w
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    this.element.removeEventListener('mousedown', this.onMouseDown)
    window.removeEventListener('mouseup', this.onMouseUp)
    window.removeEventListener('mousemove', this.onMouseMove)
    this.element.removeEventListener('wheel', this.onWheel)
    this.element.removeEventListener('contextmenu', this.preventDefault)
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
    if (document.pointerLockElement === this.element) document.exitPointerLock()
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.locked) return
    if (e.code !== 'Escape') e.preventDefault()
    if (!e.repeat) this.pressed.add(e.code)
    this.down.add(e.code)
  }

  private onKeyUp = (e: KeyboardEvent) => {
    this.down.delete(e.code)
  }

  private onBlur = () => {
    this.down.clear()
  }

  private onMouseDown = (e: MouseEvent) => {
    if (!this.locked) {
      this.requestLock()
      return
    }
    const code = `Mouse${e.button}`
    this.down.add(code)
    this.pressed.add(code)
  }

  private onMouseUp = (e: MouseEvent) => {
    this.down.delete(`Mouse${e.button}`)
  }

  private onMouseMove = (e: MouseEvent) => {
    if (!this.locked) return
    // Certains navigateurs envoient un "saut" énorme juste après le verrouillage
    // du pointeur (ou lors d'un clic) : on ignore ces valeurs aberrantes.
    if (performance.now() - this.lockTime < 100) return
    if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return
    this.mouseDX += e.movementX
    this.mouseDY += e.movementY
  }

  private onWheel = (e: WheelEvent) => {
    if (this.locked) this.wheel += Math.sign(e.deltaY)
  }

  private onPointerLockChange = () => {
    this.locked = document.pointerLockElement === this.element
    this.lockTime = performance.now()
    if (!this.locked) this.down.clear()
    this.onLockChange?.(this.locked)
  }

  private preventDefault = (e: Event) => e.preventDefault()
}
