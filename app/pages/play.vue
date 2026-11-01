<script setup lang="ts">
const canvas = useTemplateRef('canvas')
</script>

<template>
  <GameCanvas
    ref="canvas"
    class="screen"
  >
    <template #default="{ hud, error }">
      <div
        v-if="error"
        class="overlay error"
      >
        Impossible de démarrer le jeu : {{ error }}
      </div>
      <div
        v-else-if="!hud"
        class="overlay"
      >
        Chargement…
      </div>
      <GameHud
        v-else
        :hud="hud"
        @resume="canvas?.lock()"
        @clear="canvas?.clearBuilds()"
      />
    </template>
  </GameCanvas>
</template>

<style scoped>
.screen {
  width: 100vw;
  height: 100vh;
}

.overlay {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 20px;
  background: var(--bg);
}

.error {
  color: #ff8a8a;
}
</style>
