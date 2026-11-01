import { defineConfig } from 'vitest/config'

/**
 * Tests unitaires de la logique PURE du moteur (grille, boucle, aléatoire).
 * Pas besoin de Nuxt ni de navigateur : environnement Node, exécution rapide.
 */
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.spec.ts'],
    environment: 'node',
  },
})
