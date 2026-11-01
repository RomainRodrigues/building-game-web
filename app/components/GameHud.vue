<script setup lang="ts">
import type { HudState } from '~/game/Game'

const props = defineProps<{ hud: HudState }>()
defineEmits<{ resume: [], clear: [] }>()

const slots = [
  { type: 'wall', key: '1', label: 'Mur' },
  { type: 'floor', key: '2', label: 'Sol' },
  { type: 'ramp', key: '3', label: 'Rampe' },
  { type: 'roof', key: '4', label: 'Toit' },
] as const

const paused = computed(() => !props.hud.locked)
</script>

<template>
  <div class="hud">
    <div class="stats">
      {{ hud.fps }} FPS · {{ hud.backend }} · {{ hud.pieces }} pièces · {{ hud.speed }} m/s
    </div>

    <div
      v-if="!paused"
      class="crosshair"
    />

    <div
      v-if="!paused"
      class="hotbar"
    >
      <div
        v-for="s in slots"
        :key="s.type"
        class="slot"
        :class="{ active: hud.piece === s.type }"
      >
        <span class="key">{{ s.key }}</span>
        <span>{{ s.label }}</span>
      </div>
    </div>

    <div
      v-if="paused"
      class="pause"
    >
      <div class="panel">
        <h1>Free Build</h1>
        <button
          class="primary"
          @click="$emit('resume')"
        >
          Cliquer pour jouer
        </button>
        <button @click="$emit('clear')">
          Tout effacer
        </button>
        <NuxtLink
          to="/"
          class="link"
        >Retour au menu</NuxtLink>
        <ul class="controls">
          <li><b>ZQSD / WASD</b> se déplacer · <b>Espace</b> sauter · <b>Maj</b> sprint</li>
          <li><b>Souris</b> viser · <b>Clic gauche</b> construire (maintenir = turbo)</li>
          <li><b>1 / 2 / 3 / 4</b> ou <b>molette</b> : mur / sol / rampe / toit · <b>X</b> ranger</li>
          <li><b>Clic droit</b> détruire la pièce visée · <b>Échap</b> pause</li>
          <li class="hint">
            La pièce se pose là où vise le réticule (case et étage). Elle doit être
            reliée au sol, sinon elle ne peut pas être posée.
          </li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hud {
  position: absolute;
  inset: 0;
  pointer-events: none;
  user-select: none;
}
.stats {
  position: absolute;
  top: 10px;
  left: 12px;
  font-size: 12px;
  opacity: 0.85;
  text-shadow: 0 1px 2px #000;
}
.crosshair {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 18px;
  height: 18px;
  transform: translate(-50%, -50%);
  background:
    linear-gradient(#fff, #fff) center / 2px 100% no-repeat,
    linear-gradient(#fff, #fff) center / 100% 2px no-repeat;
  filter: drop-shadow(0 0 1px #000);
}
.hotbar {
  position: absolute;
  bottom: 22px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
}
.slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 74px;
  padding: 8px 0;
  background: var(--panel);
  border: 2px solid transparent;
  border-radius: 8px;
  font-size: 13px;
}
.slot.active {
  border-color: var(--accent);
  box-shadow: 0 0 12px rgba(79, 195, 255, 0.5);
}
.key {
  font-size: 11px;
  opacity: 0.6;
}
.pause {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgba(5, 8, 16, 0.55);
  pointer-events: auto;
}
.panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 380px;
  padding: 28px;
  background: var(--panel);
  border-radius: 14px;
  backdrop-filter: blur(6px);
}
h1 {
  margin: 0 0 6px;
  font-size: 28px;
  letter-spacing: 1px;
}
button {
  padding: 12px;
  font-size: 15px;
  font-weight: 600;
  color: inherit;
  background: rgba(255, 255, 255, 0.08);
  border: none;
  border-radius: 8px;
  cursor: pointer;
}
button:hover {
  background: rgba(255, 255, 255, 0.16);
}
button.primary {
  color: #08121f;
  background: var(--accent);
}
.link {
  color: inherit;
  text-align: center;
  opacity: 0.7;
}
.controls {
  margin: 8px 0 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.7;
  opacity: 0.85;
}
.hint {
  opacity: 0.7;
}
</style>
