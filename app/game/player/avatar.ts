import * as THREE from 'three/webgpu'

/**
 * Avatar "low poly" construit en primitives, en attendant un vrai modèle glTF animé.
 * L'origine du groupe est aux pieds ; l'avatar regarde vers -Z.
 */
export function createAvatar(): THREE.Group {
  const group = new THREE.Group()
  group.name = 'avatar'

  const suit = new THREE.MeshStandardMaterial({ color: '#ff7a3d', roughness: 0.6 })
  const dark = new THREE.MeshStandardMaterial({ color: '#273046', roughness: 0.7 })
  const skin = new THREE.MeshStandardMaterial({ color: '#f1c7a1', roughness: 0.8 })

  const parts: [THREE.BufferGeometry, THREE.Material, [number, number, number]][] = [
    [new THREE.CapsuleGeometry(0.28, 0.35, 4, 12), dark, [0, 0.45, 0]], // jambes
    [new THREE.CapsuleGeometry(0.33, 0.55, 4, 12), suit, [0, 1.05, 0]], // torse
    [new THREE.BoxGeometry(0.4, 0.45, 0.2), dark, [0, 1.1, 0.33]], // sac à dos
    [new THREE.SphereGeometry(0.24, 16, 12), skin, [0, 1.6, 0]], // tête
    [new THREE.BoxGeometry(0.3, 0.09, 0.1), dark, [0, 1.63, -0.2]], // visière
  ]

  for (const [geometry, material, [x, y, z]] of parts) {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    group.add(mesh)
  }
  return group
}
