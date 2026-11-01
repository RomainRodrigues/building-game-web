# CLAUDE.md

Guide pour les agents (Claude Code) qui travaillent sur ce dépôt. Pour la présentation
du jeu, les contrôles et la feuille de route, voir `README.md`.

## Projet

Jeu de construction + tir à la 3e personne dans le navigateur (genre "build & shoot"),
projet d'apprentissage non publié. Mode actuel : Free Build solo. Le jeu doit rester une
création originale du genre, pas la copie d'un jeu existant.

**Règle d'or du propriétaire : le code doit être le plus professionnel possible.**

## Commandes

```bash
pnpm dev          # http://localhost:3000
pnpm check        # lint + typecheck + tests : OBLIGATOIRE avant chaque commit
pnpm lint:fix     # corrige le formatage (ESLint Stylistic, pas de Prettier)
pnpm test         # Vitest (tests/unit)
pnpm build        # build de production
```

- pnpm est épinglé via `packageManager` dans `package.json` : ne pas utiliser npm/yarn.
- TypeScript est épinglé en `^5` : `vue-tsc` ne supporte pas encore TypeScript 7.

## Architecture

- `app/game/` : moteur en TypeScript pur. **N'importe jamais Vue ni Nuxt** (seule
  exception : `debug.ts`, qui utilise `import.meta.dev`).
- `app/components/GameCanvas.client.vue` : seul pont Vue <-> moteur. Crée le `Game`,
  l'expose au HUD et appelle `dispose()` au démontage.
- `app/game/hud.ts` : contrat `HudState`, le SEUL état réactif côté Vue.
- `app/game/build/BuildGrid.ts`, `build/Structure.ts`, `core/Loop.ts`, `utils/random.ts` : logique pure,
  sans Three.js ni Rapier, couverte par les tests unitaires.
- Stack : Nuxt 4, Three.js `WebGPURenderer` (import depuis `three/webgpu`, avec fallback
  WebGL2 automatique), Rapier `@dimforge/rapier3d-compat`.

## Règles à respecter

### Performance et cycle de vie
- **Jamais d'objet du moteur dans `ref()` / `reactive()`** : les proxies Vue détruisent
  les performances. Côté Vue, utiliser `shallowRef` pour le HUD.
- **Simulation à pas fixe** : la logique de jeu va dans `update(dt)` (60 ticks/s), et
  l'affichage dans `render(alpha)`. La souris est lue par frame, les commandes par tick.
- **Zéro allocation par tick ou par frame** dans les chemins chauds : réutiliser des
  `Vector3` et des `Ray` stockés en champs privés.
- **Tout système qui crée des ressources GPU** (géométries, matériaux, textures) les
  libère dans `dispose()`.

### Organisation du code
- **Aucun nombre magique** : les valeurs de gameplay vont dans `app/game/config.ts`, et
  les constantes internes dans des `const` nommées en haut du fichier.
- **Entrées par actions** : ajouter une touche dans `core/bindings.ts`, puis utiliser
  `input.isHeld(action)` ou `frame.pressed.has(action)`. Toujours des codes physiques
  (`KeyW`), jamais `event.key` : le propriétaire est en AZERTY.
- **Pas de `Math.random()` dans le monde ou la génération** : utiliser `createRandom(seed)`,
  pour que la carte reste reproductible.
- **Injecter Rapier** (`RapierModule`) dans les systèmes plutôt que l'importer partout.
  Les types viennent de `app/game/physics/rapier.ts`.
- **Placement guidé par le réticule** : `computePlacement` ne dépend que du point visé
  (`BuildAim.target`, rayon lancé depuis la caméra), des pieds du joueur et de son regard
  horizontal. Pas de cas particuliers par situation : un nouveau comportement doit découler
  du point visé, et être couvert par un test.
- **Intégrité structurelle** : toute pose passe par `StructureGraph.isSupported`, et toute
  destruction par `BuildSystem.destroy` (qui gère les effondrements). Ne jamais retirer
  un mesh ou un collider de pièce à la main.
- **Le joueur ne doit jamais être placé au contact exact d'une surface** (téléportation,
  apparition) : le character controller Rapier ne sort pas d'une pénétration. Garder un jeu
  (voir `SPAWN_CLEARANCE`, `LIFT_CLEARANCE`). Ne le remonter sur une pièce que si elle
  traverse son corps (`liftHeightAfterPlacing`) : jamais de téléportation sur une pièce
  au-dessus de sa tête.
- **`PlayerCommand`** est le format d'entrée de la simulation, prévu pour un futur
  multijoueur. Ne pas faire lire `Input` directement par la simulation.

### Style et tests
- **Langues** : identifiants en anglais, commentaires et textes d'interface en français.
- **Tests** : toute nouvelle logique pure doit avoir ses tests dans `tests/unit/*.spec.ts`.
  Si une logique est difficile à tester, l'extraire du rendu plutôt que de s'en passer.

## Vérifier un changement de gameplay

Les tests unitaires ne couvrent pas le rendu ni la physique. Pour ça, utiliser Playwright
(Chromium pré-installé, voir l'environnement) sur `pnpm dev` :

- `window.__game` donne accès à l'instance en dev (absent en production).
- En headless, le rendu tourne en logiciel (environ 2 à 4 FPS) : ne pas juger la vitesse
  en temps réel. Arrêter la boucle (`__game.loop.stop()`) et appeler `__game.update(1/60)`
  à la main, en simulant les touches via `__game.input`.
- La caméra (donc la visée et le rayon de destruction) n'est mise à jour qu'au rendu :
  dans un test, appeler `__game.render(1, 1/60)` après chaque `update`, et laisser passer
  2 ticks après avoir changé `cam.yaw` / `cam.pitch`.
- Au moment du clic, Chromium envoie un faux mouvement de souris énorme : fixer
  `__game.cam.yaw` et `__game.cam.pitch` après le verrouillage du pointeur.
- Les messages « WebGPU is not available » et « GPU stall due to ReadPixels » sont
  normaux en headless.

## Git

- Messages de commit en anglais, à l'impératif, avec un corps qui explique le pourquoi.
- Un commit par sujet cohérent. Lancer `pnpm check` avant de commiter.
