import * as THREE from 'three/webgpu'
import { CONFIG } from '../config'
import type { RAPIER, RapierModule } from '../physics/rapier'
import { createRandom, type Random } from '../utils/random'
import { createGroundTexture } from './textures'

const SKY_COLOR = '#8ec9ff'
const FOG_NEAR = 80
const FOG_FAR = 260
const MAP_SEED = 1337

/** Le soleil suit le joueur : décalage de la lumière par rapport à lui. */
const SUN_OFFSET = new THREE.Vector3(40, 70, 25)
const SHADOW_MAP_SIZE = 2048
const SHADOW_HALF_EXTENT = 60
const SHADOW_FAR = 200
const SHADOW_BIAS = -0.0005

/** Les décors restent à cette distance du bord de la carte. */
const PROP_BORDER = 10

/**
 * Décor statique : ciel, lumières, sol, arbres et rochers.
 * Chaque élément solide a un mesh (affichage) ET un collider (physique).
 */
export class World {
  private readonly sun: THREE.DirectionalLight
  private readonly disposables: { dispose(): void }[] = []

  constructor(
    private readonly scene: THREE.Scene,
    private readonly rapier: RapierModule,
    private readonly physics: RAPIER.World,
  ) {
    const sky = new THREE.Color(SKY_COLOR)
    scene.background = sky
    scene.fog = new THREE.Fog(sky, FOG_NEAR, FOG_FAR)
    scene.add(new THREE.HemisphereLight('#cfe8ff', '#4a5a3a', 1.4))

    this.sun = createSun()
    scene.add(this.sun, this.sun.target)

    this.createGround()
    this.createProps(createRandom(MAP_SEED))
  }

  /** Recentre la lumière (et donc la zone d'ombres) sur le joueur. */
  followTarget(position: THREE.Vector3) {
    this.sun.position.copy(position).add(SUN_OFFSET)
    this.sun.target.position.copy(position)
  }

  dispose() {
    for (const resource of this.disposables) resource.dispose()
    this.disposables.length = 0
  }

  private track<T extends { dispose(): void }>(resource: T): T {
    this.disposables.push(resource)
    return resource
  }

  private createGround() {
    const { halfSize } = CONFIG.world
    const size = halfSize * 2
    const texture = this.track(createGroundTexture())
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping
    texture.repeat.setScalar(size / CONFIG.build.tile)
    texture.anisotropy = 8

    const ground = new THREE.Mesh(
      this.track(new THREE.PlaneGeometry(size, size)),
      this.track(new THREE.MeshStandardMaterial({ map: texture, roughness: 0.95 })),
    )
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    this.scene.add(ground)

    // Dalle épaisse dont le dessus est en y = 0.
    const groundThickness = 0.5
    this.addStaticCollider(
      this.rapier.ColliderDesc.cuboid(halfSize, groundThickness, halfSize),
      new THREE.Vector3(0, -groundThickness, 0),
    )
  }

  private createProps(rng: Random) {
    const materials = {
      rock: this.track(new THREE.MeshStandardMaterial({ color: '#8a8f99', roughness: 0.9, flatShading: true })),
      trunk: this.track(new THREE.MeshStandardMaterial({ color: '#7a5233', roughness: 1 })),
      leaves: this.track(new THREE.MeshStandardMaterial({ color: '#3f8f46', roughness: 0.8, flatShading: true })),
    }
    const extent = CONFIG.world.halfSize - PROP_BORDER

    for (let i = 0; i < CONFIG.world.propCount; i++) {
      const x = rng.range(-extent, extent)
      const z = rng.range(-extent, extent)
      // On consomme toujours le même nombre de tirages : la carte reste stable.
      const isRock = rng.next() < 0.5
      const sizeRoll = rng.next()
      if (Math.hypot(x, z) < CONFIG.world.spawnClearRadius) continue

      if (isRock) this.addRock(x, z, 1 + sizeRoll * 2.2, rng, materials.rock)
      else this.addTree(x, z, 4 + sizeRoll * 3, materials.trunk, materials.leaves)
    }
  }

  private addRock(x: number, z: number, radius: number, rng: Random, material: THREE.Material) {
    const rock = new THREE.Mesh(this.track(new THREE.DodecahedronGeometry(radius, 0)), material)
    rock.position.set(x, radius * 0.5, z)
    rock.rotation.set(rng.range(0, Math.PI), rng.range(0, Math.PI), rng.range(0, Math.PI))
    this.addShadowCaster(rock)
    // Collider sphérique un peu plus petit que le mesh (forme irrégulière).
    this.addStaticCollider(this.rapier.ColliderDesc.ball(radius * 0.85), rock.position)
  }

  private addTree(x: number, z: number, height: number, trunkMaterial: THREE.Material, leavesMaterial: THREE.Material) {
    const trunk = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.3, 0.45, height, 8)), trunkMaterial)
    trunk.position.set(x, height / 2, z)
    const leaves = new THREE.Mesh(this.track(new THREE.IcosahedronGeometry(2.4, 0)), leavesMaterial)
    leaves.position.set(x, height + 1, z)
    this.addShadowCaster(trunk)
    this.addShadowCaster(leaves)
    this.addStaticCollider(this.rapier.ColliderDesc.cylinder(height / 2, 0.4), trunk.position)
  }

  private addShadowCaster(mesh: THREE.Mesh) {
    mesh.castShadow = true
    mesh.receiveShadow = true
    this.scene.add(mesh)
  }

  private addStaticCollider(desc: RAPIER.ColliderDesc, position: THREE.Vector3) {
    const body = this.physics.createRigidBody(
      this.rapier.RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z),
    )
    this.physics.createCollider(desc, body)
  }
}

function createSun() {
  const sun = new THREE.DirectionalLight('#fff3dd', 2.6)
  sun.position.copy(SUN_OFFSET)
  sun.castShadow = true
  sun.shadow.mapSize.setScalar(SHADOW_MAP_SIZE)
  sun.shadow.bias = SHADOW_BIAS
  const camera = sun.shadow.camera
  camera.left = camera.bottom = -SHADOW_HALF_EXTENT
  camera.right = camera.top = SHADOW_HALF_EXTENT
  camera.near = 1
  camera.far = SHADOW_FAR
  return sun
}
