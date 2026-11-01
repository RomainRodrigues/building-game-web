import type { Game } from './Game'

declare global {
  interface Window {
    /** Instance du jeu, exposée en développement uniquement (console / tests e2e). */
    __game?: Game
  }
}

/** Rend le jeu accessible via `window.__game` en dev ; sans effet en production. */
export function exposeForDebug(game: Game | undefined) {
  if (import.meta.dev) window.__game = game
}
