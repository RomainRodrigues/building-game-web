// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  devtools: { enabled: true },
  css: ['~/assets/main.css'],
  // Le jeu tourne uniquement dans le navigateur : pas de SSR sur la page de jeu.
  routeRules: {
    '/play': { ssr: false },
  },
  app: {
    head: {
      title: 'Build Arena',
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
    },
  },
  vite: {
    // Rapier embarque son WASM dans le JS (~2 Mo) : avertissement de taille attendu.
    build: { chunkSizeWarningLimit: 3000 },
    optimizeDeps: {
      include: ['three/webgpu', '@dimforge/rapier3d-compat'],
    },
  },
})
