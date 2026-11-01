// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt({
  rules: {
    // Les classes du moteur ont des membres "private readonly" initialisés au constructeur.
    '@typescript-eslint/no-non-null-assertion': 'off',
  },
})
