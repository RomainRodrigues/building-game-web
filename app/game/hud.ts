import type { PieceType } from './build/BuildGrid'

/**
 * État exposé à l'interface Vue (HUD).
 * Volontairement petit et sérialisable : c'est le SEUL lien réactif avec Vue.
 */
export interface HudState {
  locked: boolean
  piece: PieceType | null
  pieces: number
  /** Mode édition actif. */
  editing: boolean
  /** La sélection d'édition en cours peut être validée. */
  editValid: boolean
  fps: number
  speed: number
  backend: 'WebGPU' | 'WebGL2'
}
