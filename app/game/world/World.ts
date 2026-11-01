import * as THREE from 'three/webgpu'
import type RAPIER from '@dimforge/rapier3d-compat'
import { CONFIG } from '../config'

type Rapier = typeof RAPIER

/**
 * Décor statique : ciel, lumières, sol, quelques obstacles.
 * Chaque élément solide a un mesh (affichage) ET un collider (physique).
 */
export class World {
  readonly sun: THREE.DirectionalLight

  constructor(
    private readonly scene: THREE.Scene,
    private readonly rapier: Rapier,
    private readonly physics: RAPIER.World,
  ) {
    const sky = new THREE.Color('#8ec9ff')
    scene.background = sky
    scene.fog = new THREE.Fog(sky, 80, 260)

    scene.add(new THREE.HemisphereLight('#cfe8ff', '#4a5a3a', 1.4))

    this.sun = new THREE.DirectionalLight('#fff3dd', 2.6)
    this.sun.position.set(40, 70, 25)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    const s = this.sun.shadow.camera
    s.left = -60
    s.right = 60
    s.top = 60
    s.bottom = -60
    s.near = 1
    s.far = 200
    this.sun.shadow.bias = -0.0005
    scene.add(this.sun, this.sun.target)

    this.createGround()
    this.createProps()
  }

  /** L'ombre suit le joueur pour garder une bonne résolution autour de lui. */
  followTarget(pos: THREE.Vector3) {
    this.sun.position.set(pos.x + 40, pos.y + 70, pos.z + 25)
    this.sun.target.position.copy(pos)
  }

  private createGround() {
    const size = CONFIG.world.halfSize * 2
    const tex = gridTexture()
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(size / CONFIG.build.tile, size / CONFIG.build.tile)
    tex.anisotropy = 8

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }),
    )
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    this.scene.add(ground)

    const body = this.physics.createRigidBody(this.rapier.RigidBodyDesc.fixed())
    this.physics.createCollider(
      this.rapier.ColliderDesc.cuboid(CONFIG.world.halfSize, 0.5, CONFIG.world.halfSize).setTranslation(0, -0.5, 0),
      body,
    )
  }

  private createProps() {
    // Pseudo-aléatoire déterministe : la carte est la même à chaque partie.
    let seed = 1337
    const rand = () => {
      seed = (seed * 16807) % 2147483647
      return (seed - 1) / 2147483646
    }

    const rockMat = new THREE.MeshStandardMaterial({ color: '#8a8f99', roughness: 0.9, flatShading: true })
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#7a5233', roughness: 1 })
    const leafMat = new THREE.MeshStandardMaterial({ color: '#3f8f46', roughness: 0.8, flatShading: true })

    for (let i = 0; i < 40; i++) {
      const x = (rand() * 2 - 1) * (CONFIG.world.halfSize - 10)
      const z = (rand() * 2 - 1) * (CONFIG.world.halfSize - 10)
      if (Math.hypot(x, z) < 14) continue // zone de spawn dégagée

      if (rand() < 0.5) {
        // Rocher
        const r = 1 + rand() * 2.2
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), rockMat)
        rock.position.set(x, r * 0.5, z)
        rock.rotation.set(rand() * 3, rand() * 3, rand() * 3)
        rock.castShadow = rock.receiveShadow = true
        this.scene.add(rock)
        this.addStaticBall(x, r * 0.5, z, r * 0.85)
      } else {
        // Arbre (tronc + feuillage)
        const h = 4 + rand() * 3
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, h, 8), trunkMat)
        trunk.position.set(x, h / 2, z)
        const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(2 + rand(), 0), leafMat)
        leaves.position.set(x, h + 1, z)
        for (const m of [trunk, leaves]) {
          m.castShadow = m.receiveShadow = true
          this.scene.add(m)
        }
        const body = this.physics.createRigidBody(this.rapier.RigidBodyDesc.fixed().setTranslation(x, h / 2, z))
        this.physics.createCollider(this.rapier.ColliderDesc.cylinder(h / 2, 0.4), body)
      }
    }
  }

  private addStaticBall(x: number, y: number, z: number, r: number) {
    const body = this.physics.createRigidBody(this.rapier.RigidBodyDesc.fixed().setTranslation(x, y, z))
    this.physics.createCollider(this.rapier.ColliderDesc.ball(r), body)
  }
}

/** Texture de sol générée à la volée : herbe + quadrillage aligné sur la grille de construction. */
function gridTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  g.fillStyle = '#5f9a4e'
  g.fillRect(0, 0, 128, 128)
  for (let i = 0; i < 400; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)'
    g.fillRect(Math.random() * 128, Math.random() * 128, 3, 3)
  }
  g.strokeStyle = 'rgba(255,255,255,0.18)'
  g.lineWidth = 2
  g.strokeRect(1, 1, 126, 126)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
