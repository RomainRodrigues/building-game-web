<script setup lang="ts">
import type { Game, HudState } from '~/game/Game'

/**
 * Pont entre Vue et le moteur.
 *
 * - Le moteur n'est JAMAIS rendu réactif : il vit dans une variable simple.
 *   Le mettre dans un `ref()` envelopperait la scène 3D dans des proxies Vue
 *   et effondrerait les performances.
 * - Seul `hud` est réactif ; le moteur le met à jour quelques fois par seconde.
 */
const container = useTemplateRef<HTMLDivElement>('container')
const hud = shallowRef<HudState | null>(null)
const error = ref<string | null>(null)

let game: Game | undefined
let unmounted = false

onMounted(async () => {
  try {
    // Import dynamique : Three.js et Rapier ne sont chargés que sur la page de jeu.
    const [{ Game }, { exposeForDebug }] = await Promise.all([import('~/game/Game'), import('~/game/debug')])
    const instance = await Game.create(container.value!)
    if (unmounted) {
      instance.dispose()
      return
    }
    game = instance
    game.onHud = (state) => (hud.value = state)
    game.start()
    exposeForDebug(game)
  }
  catch (e) {
    console.error(e)
    error.value = e instanceof Error ? e.message : String(e)
  }
})

onBeforeUnmount(() => {
  unmounted = true
  game?.dispose()
  game = undefined
  import('~/game/debug').then(({ exposeForDebug }) => exposeForDebug(undefined))
})

defineExpose({
  lock: () => game?.lock(),
  clearBuilds: () => game?.clearBuilds(),
})
</script>

<template>
  <div class="game">
    <div
      ref="container"
      class="viewport"
    />
    <slot
      :hud="hud"
      :error="error"
    />
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
