<script setup lang="ts">
const game = ref<{ lock: () => void; clearBuilds: () => void }>()
</script>

<template>
  <GameCanvas ref="game" class="screen">
    <template #default="{ hud, error }">
      <div v-if="error" class="error">
        Impossible de démarrer le jeu : {{ error }}
      </div>
      <div v-else-if="!hud" class="loading">Chargement…</div>
      <GameHud v-else :hud="hud" @resume="game?.lock()" @clear="game?.clearBuilds()" />
    </template>
  </GameCanvas>
</template>

<style scoped>
.screen {
  width: 100vw;
  height: 100vh;
}
.loading,
.error {
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
