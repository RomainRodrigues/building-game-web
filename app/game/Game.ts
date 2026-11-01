import * as THREE from 'three/webgpu'
import RAPIER from '@dimforge/rapier3d-compat'
import { CONFIG } from './config'
import { Loop } from './core/Loop'
import { Input } from './core/Input'
import { World } from './world/World'
import { Player, type PlayerCommand } from './player/Player'
import { ThirdPersonCamera } from './player/ThirdPersonCamera'
import { BuildSystem } from './build/BuildSystem'
import { PIECE_TYPES, type PieceType } from './build/BuildGrid'

/** État exposé à l'interface Vue (HUD). Volontairement petit et sérialisable. */
export interface HudState {
  locked: boolean
  piece: PieceType | null
  pieces: number
  fps: number
  speed: number
  backend: string
}

const PIECE_KEYS: Record<string, PieceType> = {
  Digit1: 'wall',
  Digit2: 'floor',
  Digit3: 'ramp',
}

/**
 * Point d'entrée du moteur. Totalement indépendant de Vue/Nuxt :
 * le composant crée le jeu, s'abonne au HUD et appelle `dispose()` en quittant.
 *
 * Un tick = lire les entrées -> simuler -> (plus tard : envoyer au serveur).
 * Une frame = interpoler -> caméra -> rendu.
 */
export class Game {
  private readonly scene = new THREE.Scene()
  private readonly loop: Loop
  private readonly input: Input
  private readonly world: World
  private readonly player: Player
  private readonly cam: ThirdPersonCamera
  private readonly build: BuildSystem
  private readonly resizeObserver: ResizeObserver
  private readonly physics: RAPIER.World

  private piece: PieceType | null = 'wall'
  private turboTimer = 0
  private hudTimer = 0
  private frames = 0
  private fps = 0
  private readonly tmpDir = new THREE.Vector3()

  onHud?: (state: HudState) => void

  static async create(container: HTMLElement) {
    await RAPIER.init()
    const renderer = new THREE.WebGPURenderer({ antialias: true })
    await renderer.init()
    return new Game(container, renderer)
  }

  private constructor(
    private readonly container: HTMLElement,
    private readonly renderer: THREE.WebGPURenderer,
  ) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    container.appendChild(renderer.domElement)

    const physics = new RAPIER.World({ x: 0, y: CONFIG.world.gravity, z: 0 })
    physics.timestep = 1 / CONFIG.tickRate
    this.physics = physics

    this.world = new World(this.scene, RAPIER, physics)
    this.player = new Player(this.scene, RAPIER, physics, new THREE.Vector3(CONFIG.build.tile / 2, 0, CONFIG.build.tile / 2))
    this.cam = new ThirdPersonCamera(RAPIER, physics, this.player.collider)
    this.build = new BuildSystem(this.scene, RAPIER, physics)
    this.input = new Input(renderer.domElement)
    this.input.onLockChange = () => this.emitHud()

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.resize()

    this.loop = new Loop(CONFIG.tickRate, (dt) => this.update(dt), (a, fdt) => this.render(a, fdt))
  }

  get backend() {
    const b = this.renderer.backend as { isWebGPUBackend?: boolean }
    return b.isWebGPUBackend ? 'WebGPU' : 'WebGL2'
  }

  start() {
    this.loop.start()
    this.emitHud()
  }

  lock() {
    this.input.requestLock()
  }

  clearBuilds() {
    this.build.clear()
    this.emitHud()
  }

  dispose() {
    this.loop.stop()
    this.resizeObserver.disconnect()
    this.input.dispose()
    this.build.dispose()
    this.physics.free()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  // ---------------------------------------------------------------- simulation

  private update(dt: number) {
    const input = this.input
    const pressed = input.consumePressed()

    // Sélection de la pièce : 1/2/3, molette, X pour ranger.
    for (const code of pressed) {
      const p = PIECE_KEYS[code]
      if (p) this.piece = p
      if (code === 'KeyX') this.piece = this.piece ? null : 'wall'
    }
    const wheel = input.consumeWheel()
    if (wheel !== 0) {
      const i = this.piece ? PIECE_TYPES.indexOf(this.piece) : 0
      this.piece = PIECE_TYPES[(i + wheel + PIECE_TYPES.length) % PIECE_TYPES.length]!
    }

    const cmd: PlayerCommand = {
      forward: (input.isDown('KeyW') ? 1 : 0) - (input.isDown('KeyS') ? 1 : 0),
      right: (input.isDown('KeyD') ? 1 : 0) - (input.isDown('KeyA') ? 1 : 0),
      jump: input.isDown('Space'),
      sprint: input.isDown('ShiftLeft') || input.isDown('ShiftRight'),
      yaw: this.cam.yaw,
    }
    this.player.update(cmd, dt)
    this.physics.step()

    // Aperçu + pose des constructions.
    this.build.updatePreview(
      this.piece,
      {
        x: this.player.pos.x,
        z: this.player.pos.z,
        feetY: this.player.feetY,
        yaw: this.cam.yaw,
        pitch: this.cam.pitch,
      },
      this.player,
    )

    this.turboTimer -= dt
    const wantsPlace = pressed.has('Mouse0') || (input.isDown('Mouse0') && this.turboTimer <= 0)
    if (this.piece && wantsPlace) {
      const placed = this.build.placePreview()
      if (placed) {
        this.turboTimer = CONFIG.build.turboDelay
        const surface = this.build.surfaceUnder(placed, this.player.pos.x, this.player.pos.z)
        if (surface !== null && this.player.feetY < surface && this.player.feetY > surface - 2.5) {
          this.player.liftFeetTo(surface + 0.05)
        }
      }
    }

    // Clic droit : détruire la pièce visée.
    if (pressed.has('Mouse2')) {
      this.build.destroyAt(
        this.cam.camera.position,
        this.cam.forward(this.tmpDir),
        CONFIG.build.editRange + CONFIG.camera.distance,
        this.player.collider,
      )
    }
  }

  // ------------------------------------------------------------------- rendu

  private render(alpha: number, frameDt: number) {
    // La souris est appliquée à chaque frame (et non à chaque tick) pour une visée réactive.
    const d = this.input.consumeMouseDelta()
    this.cam.rotate(d.x, d.y)

    this.player.render(alpha, frameDt)
    this.cam.update(this.player.renderPos, frameDt)
    this.world.followTarget(this.player.renderPos)
    this.renderer.render(this.scene, this.cam.camera)

    this.frames++
    this.hudTimer += frameDt
    if (this.hudTimer >= 0.25) {
      this.fps = Math.round(this.frames / this.hudTimer)
      this.frames = 0
      this.hudTimer = 0
      this.emitHud()
    }
  }

  private emitHud() {
    this.onHud?.({
      locked: this.input.locked,
      piece: this.piece,
      pieces: this.build.count,
      fps: this.fps,
      speed: Math.round(this.player.horizontalSpeed * 10) / 10,
      backend: this.backend,
    })
  }

  private resize() {
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    if (!w || !h) return
    this.renderer.setSize(w, h, false)
    this.cam.resize(w, h)
  }
}
