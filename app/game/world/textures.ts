import * as THREE from 'three/webgpu'
import { createRandom } from '../utils/random'

/** Crée une texture à partir d'un dessin sur canvas 2D. */
function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D non disponible')
  draw(ctx, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

/** Herbe + bordure claire : une répétition = une case de la grille de construction. */
export function createGroundTexture() {
  const rng = createRandom(7)
  return canvasTexture(128, (ctx, s) => {
    ctx.fillStyle = '#5f9a4e'
    ctx.fillRect(0, 0, s, s)
    for (let i = 0; i < 400; i++) {
      ctx.fillStyle = rng.next() < 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)'
      ctx.fillRect(rng.next() * s, rng.next() * s, 3, 3)
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'
    ctx.lineWidth = 2
    ctx.strokeRect(1, 1, s - 2, s - 2)
  })
}

/** Planches de bois avec cadre sombre. */
export function createPlankTexture() {
  const rng = createRandom(42)
  const planks = 4
  return canvasTexture(256, (ctx, s) => {
    const plank = s / planks
    for (let i = 0; i < planks; i++) {
      const y = i * plank
      ctx.fillStyle = i % 2 ? '#e7c391' : '#f3d7ad'
      ctx.fillRect(0, y, s, plank)
      ctx.fillStyle = 'rgba(90, 50, 20, 0.35)'
      ctx.fillRect(0, y, s, 3)
      for (let k = 0; k < 18; k++) {
        ctx.fillStyle = 'rgba(120, 70, 30, 0.08)'
        ctx.fillRect(rng.next() * s, y + 6 + rng.next() * (plank - 10), rng.range(40, 120), 2)
      }
    }
    ctx.strokeStyle = 'rgba(60, 30, 10, 0.5)'
    ctx.lineWidth = 8
    ctx.strokeRect(0, 0, s, s)
  })
}
