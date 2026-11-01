import * as THREE from 'three/webgpu'
import RAPIER from '@dimforge/rapier3d-compat'
import { CONFIG } from './config'
import { Loop } from './core/Loop'
import { Input, type InputFrame } from './core/Input'
import type { Action } from './core/bindings'
import { World } from './world/World'
import { Player, type PlayerCommand } from './player/Player'
import { ThirdPersonCamera } from './player/ThirdPersonCamera'
import { BuildSystem } from './build/BuildSystem'
import { liftHeightAfterPlacing, PIECE_TYPES, type PieceSpec, type PieceType } from './build/BuildGrid'
import type { HudState } from './hud'

export type { HudState } from './hud'

const MAX_PIXEL_RATIO = 2
const SPAWN = new THREE.Vector3(CONFIG.build.tile / 2, 0, CONFIG.build.tile / 2)
/** Petit jeu pour poser les pieds juste au-dessus d'un sol fraîchement construit. */
const LIFT_CLEARANCE = 0.05

const PIECE_SELECTION: Partial<Record<Action, PieceType>> = {
  selectWall: 'wall',
  selectFloor: 'floor',
  selectRamp: 'ramp',
  selectRoof: 'roof',
}

/**
 * Point d'entrée du moteur, totalement indépendant de Vue/Nuxt : le composant
 * crée le jeu, s'abonne au HUD (`onHud`) et appelle `dispose()` en quittant.
 *
 * - Un TICK (60/s) : entrées -> commande joueur -> physique -> construction.
 * - Une FRAME : souris -> interpolation -> caméra -> rendu.
 */
export class Game {
  onHud?: (state: HudState) => void

  private readonly scene = new THREE.Scene()
  private readonly physics: RAPIER.World
  private readonly loop: Loop
  private readonly input: Input
  private readonly world: World
  private readonly player: Player
  private readonly cam: ThirdPersonCamera
  private readonly build: BuildSystem
  private readonly resizeObserver: ResizeObserver
  private readonly aim = new THREE.Vector3()
  private readonly feet = new THREE.Vector3()

  private piece: PieceType | null = 'wall'
  private turboCooldown = 0
  private hudElapsed = 0
  private framesSinceHud = 0
  private fps = 0

  /** Initialise les modules asynchrones (WASM Rapier, GPU) puis crée le jeu. */
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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    container.appendChild(renderer.domElement)

    this.physics = new RAPIER.World({ x: 0, y: CONFIG.world.gravity, z: 0 })
    this.physics.timestep = 1 / CONFIG.tickRate

    this.world = new World(this.scene, RAPIER, this.physics)
    this.player = new Player(this.scene, RAPIER, this.physics, SPAWN)
    this.cam = new ThirdPersonCamera(RAPIER, this.physics, this.player.collider)
    this.build = new BuildSystem(this.scene, RAPIER, this.physics)

    this.input = new Input(renderer.domElement)
    this.input.onLockChange = () => this.emitHud()

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.resize()

    this.loop = new Loop({
      tickRate: CONFIG.tickRate,
      maxFrameDelta: CONFIG.maxFrameDelta,
      update: (dt) => this.update(dt),
      render: (alpha, frameDt) => this.render(alpha, frameDt),
    })
  }

  get backend(): HudState['backend'] {
    const backend = this.renderer.backend as { isWebGPUBackend?: boolean }
    return backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2'
  }

  start() {
    this.loop.start()
    this.emitHud()
  }

  /** Verrouille la souris (doit être appelé depuis un geste utilisateur). */
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
    this.world.dispose()
    this.physics.free()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  // ------------------------------------------------------------- simulation

  private update(dt: number) {
    const frame = this.input.pollFrame()
    this.updateSelection(frame)

    this.player.update(this.readCommand(), dt)
    this.physics.step()

    this.updateBuilding(frame, dt)
  }

  private readCommand(): PlayerCommand {
    const input = this.input
    return {
      forward: input.axis('backward', 'forward'),
      right: input.axis('left', 'right'),
      jump: input.isHeld('jump'),
      sprint: input.isHeld('sprint'),
      yaw: this.cam.yaw,
    }
  }

  private updateSelection({ pressed, wheel }: InputFrame) {
    for (const action of pressed) {
      const piece = PIECE_SELECTION[action]
      if (piece) this.piece = piece
    }
    if (pressed.has('toggleBuild')) this.piece = this.piece ? null : PIECE_TYPES[0]!

    if (wheel !== 0) {
      const count = PIECE_TYPES.length
      const index = this.piece ? PIECE_TYPES.indexOf(this.piece) : 0
      this.piece = PIECE_TYPES[(((index + wheel) % count) + count) % count]!
    }
  }

  private updateBuilding({ pressed }: InputFrame, dt: number) {
    const feet = this.feet.set(this.player.position.x, this.player.feetY, this.player.position.z)
    this.build.updatePreview(
      this.piece,
      {
        x: feet.x,
        z: feet.z,
        feetY: feet.y,
        yaw: this.cam.yaw,
        pitch: this.cam.pitch,
        airborne: !this.player.isGrounded,
      },
      feet,
    )

    // Clic = une pièce ; clic maintenu = une pièce toutes les `turboDelay` secondes.
    this.turboCooldown -= dt
    const wantsPlace = pressed.has('place') || (this.input.isHeld('place') && this.turboCooldown <= 0)
    if (this.piece && wantsPlace) {
      const placed = this.build.placePreview()
      if (placed) {
        this.turboCooldown = CONFIG.build.turboDelay
        this.liftPlayerOnto(placed)
      }
    }

    if (pressed.has('destroy')) {
      this.build.destroyAlongRay(
        this.cam.camera.position,
        this.cam.forward(this.aim),
        CONFIG.build.editRange + CONFIG.camera.distance,
        this.player.collider,
      )
    }
  }

  /** Un sol / une rampe posé à travers le joueur le remonte dessus au lieu de le bloquer. */
  private liftPlayerOnto(piece: PieceSpec) {
    const feet = this.feet.set(this.player.position.x, this.player.feetY, this.player.position.z)
    const surfaceY = liftHeightAfterPlacing(piece, feet, CONFIG.player.height)
    if (surfaceY !== null) this.player.liftFeetTo(surfaceY + LIFT_CLEARANCE)
  }

  // ------------------------------------------------------------------ rendu

  private render(alpha: number, frameDt: number) {
    // La souris est appliquée à chaque frame (pas à chaque tick) pour une visée réactive.
    const look = this.input.consumeLook()
    this.cam.rotate(look.x, look.y)

    this.player.render(alpha, frameDt)
    this.cam.update(this.player.renderFeet, frameDt)
    this.world.followTarget(this.player.renderFeet)
    this.renderer.render(this.scene, this.cam.camera)

    this.trackFps(frameDt)
  }

  private trackFps(frameDt: number) {
    this.framesSinceHud++
    this.hudElapsed += frameDt
    if (this.hudElapsed < CONFIG.hud.refreshInterval) return
    this.fps = Math.round(this.framesSinceHud / this.hudElapsed)
    this.framesSinceHud = 0
    this.hudElapsed = 0
    this.emitHud()
  }

  private emitHud() {
    this.onHud?.({
      locked: this.input.locked,
      piece: this.piece,
      pieces: this.build.pieceCount,
      fps: this.fps,
      speed: Math.round(this.player.horizontalSpeed * 10) / 10,
      backend: this.backend,
    })
  }

  private resize() {
    const { clientWidth: width, clientHeight: height } = this.container
    if (!width || !height) return
    this.renderer.setSize(width, height, false)
    this.cam.resize(width, height)
  }
}
