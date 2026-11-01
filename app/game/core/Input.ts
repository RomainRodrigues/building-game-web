import { BINDINGS, type Action } from './bindings'

/** Durée pendant laquelle on ignore la souris juste après le verrouillage (ms). */
const LOCK_GRACE_MS = 100
/** Au-delà, un mouvement de souris en un seul événement est considéré comme aberrant (px). */
const MAX_MOUSE_DELTA = 400

const ACTIONS = Object.keys(BINDINGS) as Action[]

/** Entrées "ponctuelles" accumulées depuis le dernier tick de simulation. */
export interface InputFrame {
  /** Actions déclenchées (appui) pendant l'intervalle. */
  pressed: ReadonlySet<Action>
  /** Crans de molette (positif = vers le bas). */
  wheel: number
}

/**
 * Gestion clavier / souris basée sur des ACTIONS (voir `bindings.ts`).
 *
 * - `isHeld(action)` : état continu (déplacement, sprint, clic maintenu).
 * - `pollFrame()` : événements ponctuels, consommés une fois par tick.
 * - `consumeLook()` : mouvement de souris, consommé une fois par frame.
 */
export class Input {
  private readonly down = new Set<string>()
  private pressedCodes = new Set<string>()
  private lookX = 0
  private lookY = 0
  private wheel = 0
  private lockTime = 0
  private _locked = false

  onLockChange?: (locked: boolean) => void

  constructor(private readonly element: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('blur', this.onBlur)
    window.addEventListener('mouseup', this.onMouseUp)
    window.addEventListener('mousemove', this.onMouseMove)
    element.addEventListener('mousedown', this.onMouseDown)
    element.addEventListener('wheel', this.onWheel, { passive: true })
    element.addEventListener('contextmenu', preventDefault)
    document.addEventListener('pointerlockchange', this.onPointerLockChange)
  }

  get locked() {
    return this._locked
  }

  requestLock() {
    // Promise dans les navigateurs récents, void dans les anciens : on ignore le refus.
    Promise.resolve(this.element.requestPointerLock()).catch(() => undefined)
  }

  isHeld(action: Action) {
    return BINDINGS[action].some((code) => this.down.has(code))
  }

  /** -1, 0 ou 1 selon les deux actions opposées. */
  axis(negative: Action, positive: Action) {
    return Number(this.isHeld(positive)) - Number(this.isHeld(negative))
  }

  pollFrame(): InputFrame {
    const codes = this.pressedCodes
    this.pressedCodes = new Set()
    const pressed = new Set<Action>()
    for (const action of ACTIONS) {
      if (BINDINGS[action].some((code) => codes.has(code))) pressed.add(action)
    }
    const wheel = this.wheel
    this.wheel = 0
    return { pressed, wheel }
  }

  consumeLook() {
    const delta = { x: this.lookX, y: this.lookY }
    this.lookX = 0
    this.lookY = 0
    return delta
  }

  dispose() {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    window.removeEventListener('mouseup', this.onMouseUp)
    window.removeEventListener('mousemove', this.onMouseMove)
    this.element.removeEventListener('mousedown', this.onMouseDown)
    this.element.removeEventListener('wheel', this.onWheel)
    this.element.removeEventListener('contextmenu', preventDefault)
    document.removeEventListener('pointerlockchange', this.onPointerLockChange)
    if (document.pointerLockElement === this.element) document.exitPointerLock()
  }

  private press(code: string) {
    this.down.add(code)
    this.pressedCodes.add(code)
  }

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (!this._locked) return
    if (e.code !== 'Escape') e.preventDefault()
    if (e.repeat) return
    this.press(e.code)
  }

  private readonly onKeyUp = (e: KeyboardEvent) => {
    this.down.delete(e.code)
  }

  private readonly onBlur = () => {
    this.down.clear()
  }

  private readonly onMouseDown = (e: MouseEvent) => {
    if (!this._locked) {
      this.requestLock()
      return
    }
    this.press(`Mouse${e.button}`)
  }

  private readonly onMouseUp = (e: MouseEvent) => {
    this.down.delete(`Mouse${e.button}`)
  }

  private readonly onMouseMove = (e: MouseEvent) => {
    if (!this._locked) return
    // Chromium envoie parfois un "saut" énorme juste après le verrouillage du
    // pointeur ou lors d'un clic : on filtre ces valeurs aberrantes.
    if (performance.now() - this.lockTime < LOCK_GRACE_MS) return
    if (Math.abs(e.movementX) > MAX_MOUSE_DELTA || Math.abs(e.movementY) > MAX_MOUSE_DELTA) return
    this.lookX += e.movementX
    this.lookY += e.movementY
  }

  private readonly onWheel = (e: WheelEvent) => {
    if (this._locked) this.wheel += Math.sign(e.deltaY)
  }

  private readonly onPointerLockChange = () => {
    this._locked = document.pointerLockElement === this.element
    this.lockTime = performance.now()
    if (!this._locked) this.down.clear()
    this.onLockChange?.(this._locked)
  }
}

function preventDefault(e: Event) {
  e.preventDefault()
}
