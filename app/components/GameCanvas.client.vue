<script setup lang="ts">
import type { Game, HudState } from '~/game/Game'

/**
 * Pont entre Vue et le moteur.
 * - Le moteur (`Game`) n'est JAMAIS rendu réactif : on le garde dans une
 *   variable simple. Le mettre dans un ref() ralentirait tout (proxies Vue).
 * - Seul le petit objet `hud` est réactif ; le moteur le met à jour ~4x/s.
 */
const container = ref<HTMLDivElement>()
const hud = shallowRef<HudState | null>(null)
const error = ref<string | null>(null)
let game: Game | null = null
let disposed = false

onMounted(async () => {
  try {
    // Import dynamique : Three.js et Rapier ne sont chargés que sur la page de jeu.
    const { Game } = await import('~/game/Game')
    const instance = await Game.create(container.value!)
    if (disposed) {
      instance.dispose()
      return
    }
    game = instance
    game.onHud = (s) => (hud.value = s)
    game.start()
    // Accès console en dev uniquement (debug) : window.__game
    if (import.meta.dev) (window as unknown as { __game: Game }).__game = game
  } catch (e) {
    console.error(e)
    error.value = e instanceof Error ? e.message : String(e)
  }
})

onBeforeUnmount(() => {
  disposed = true
  game?.dispose()
  game = null
})

defineExpose({
  lock: () => game?.lock(),
  clearBuilds: () => game?.clearBuilds(),
})
</script>

<template>
  <div class="game">
    <div ref="container" class="viewport" />
    <slot :hud="hud" :error="error" />
  </div>
</template>

<style scoped>
.game {
  position: relative;
  width: 100%;
  height: 100%;
}
.viewport {
  position: absolute;
  inset: 0;
}
.viewport :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
