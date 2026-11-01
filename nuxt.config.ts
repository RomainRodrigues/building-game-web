// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/eslint'],
  devtools: { enabled: true },
  app: {
    head: {
      title: 'Build Arena',
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
    },
  },
  css: ['~/assets/main.css'],
  // Le jeu tourne uniquement dans le navigateur : pas de SSR sur la page de jeu.
  routeRules: {
    '/play': { ssr: false },
  },
  compatibilityDate: '2026-11-01',
  vite: {
    build: {
      // `@dimforge/rapier3d-compat` embarque son WASM en base64 (~4 Mo) : ce chunk
      // dépasse forcément la limite par défaut. Il n'est chargé que sur /play.
      chunkSizeWarningLimit: 4500,
      rolldownOptions: {
        output: {
          // Chunks séparés : mis en cache indépendamment du code du jeu.
          codeSplitting: {
            groups: [
              { name: 'rapier', test: /node_modules[\\/].*@dimforge/ },
              { name: 'three', test: /node_modules[\\/].*three/ },
            ],
          },
        },
      },
    },
    optimizeDeps: {
      include: ['three/webgpu', '@dimforge/rapier3d-compat'],
    },
  },
  eslint: {
    config: {
      // Formatage géré par ESLint Stylistic (pas besoin de Prettier).
      stylistic: { indent: 2, quotes: 'single', semi: false, arrowParens: true },
    },
  },
})
