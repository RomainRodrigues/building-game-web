# Build Arena

Un jeu de construction + tir à la 3e personne **dans le navigateur**, projet d'apprentissage
(non publié). Mode actuel : **Free Build** en solo.

## Lancer le jeu

```bash
pnpm install
pnpm dev
```

Puis ouvrir http://localhost:3000 → **Free Build** → cliquer pour verrouiller la souris.

| Action | Touche |
|---|---|
| Se déplacer | ZQSD (AZERTY) / WASD (QWERTY) — touches physiques |
| Sauter / Sprint | Espace / Maj |
| Construire (maintenir = turbo) | Clic gauche |
| Choisir mur / sol / rampe | 1 / 2 / 3 ou molette |
| Ranger les pièces | X |
| Détruire la pièce visée | Clic droit |
| Pause | Échap |

Astuce : regarder vers le haut / bas change l'étage du sol et du mur. Rampe + avancer en
maintenant le clic = "ramp rush".

## Scripts

| Commande | Rôle |
|---|---|
| `pnpm dev` | Serveur de développement (http://localhost:3000) |
| `pnpm lint` / `pnpm lint:fix` | ESLint (+ formatage ESLint Stylistic) |
| `pnpm typecheck` | Vérification TypeScript (app + tests) |
| `pnpm test` / `pnpm test:watch` | Tests unitaires Vitest |
| `pnpm check` | Lint + types + tests (à lancer avant chaque commit) |
| `pnpm build` | Build de production |

La CI GitHub Actions (`.github/workflows/ci.yml`) exécute lint, types, tests et build
sur chaque pull request.

## Stack

- **Nuxt 4** : menu, HUD, pages (le jeu est en `ssr: false`).
- **Three.js `WebGPURenderer`** : WebGPU si dispo, sinon WebGL2 automatiquement.
- **Rapier** (WASM) : physique, collisions, *kinematic character controller*.
- **TypeScript** strict, **ESLint** (`@nuxt/eslint` + Stylistic), **Vitest**, **pnpm**.

## Architecture

```
app/
  pages/                    index (menu), play (jeu)
  components/
    GameCanvas.client.vue   pont Vue <-> moteur (crée / détruit le Game)
    GameHud.vue             HUD + menu pause (Vue pur)
  game/                     moteur 100 % TypeScript, aucune dépendance à Vue
    Game.ts                 orchestrateur : tick de simulation + frame de rendu
    config.ts               TOUTES les constantes de gameplay (aucun nombre magique ailleurs)
    hud.ts                  contrat de données moteur -> Vue
    core/Loop.ts            boucle à pas fixe (60 ticks/s) + interpolation
    core/Input.ts           clavier/souris par actions, pointer lock
    core/bindings.ts        actions -> touches physiques
    world/                  ciel, lumière, sol, décor, textures procédurales
    player/                 joueur (Rapier), caméra 3e personne, avatar
    build/BuildGrid.ts      règles de la grille (PURES, testées, partageables avec un serveur)
    build/BuildSystem.ts    aperçu, pose, destruction des pièces
    utils/random.ts         aléatoire déterministe (carte identique à chaque partie)
tests/unit/                 tests Vitest de la logique pure
```

Principes :

1. **La boucle de jeu ne passe jamais par la réactivité Vue.** Le moteur pousse un petit
   objet `HudState` ~4 fois/s ; tout le reste vit dans des objets JS classiques.
2. **Simulation à pas fixe** (60 Hz) séparée du rendu (interpolé) : comportement identique
   quel que soit l'écran (60/144 Hz).
3. **Entrées → commande → simulation** (`PlayerCommand`) : c'est exactement le format qu'on
   enverrait à un serveur si on ajoute un multijoueur un jour.
4. **Logique pure séparée du rendu** (`BuildGrid`, `Loop`, `random`) : testable sans navigateur.
5. **Zéro allocation par tick** dans les chemins chauds (vecteurs et rayons réutilisés),
   et chaque système libère ses ressources GPU dans `dispose()`.

En dev, le jeu est accessible dans la console via `window.__game`.

## Feuille de route

- [x] Phase 0 : Nuxt 4 + Three.js WebGPU + Rapier, boucle de jeu
- [x] Phase 1 : personnage 3e personne, caméra par-dessus l'épaule anti-collision
- [x] Qualité : ESLint, Vitest, CI GitHub Actions
- [x] Phase 3 (base) : mur / sol / rampe sur grille, aperçu, turbo build, destruction
- [ ] Toit (pyramide), édition de pièces, matériaux (bois / pierre / métal) et PV visibles
- [ ] Intégrité structurelle (les pièces non reliées au sol s'effondrent)
- [ ] Armes (hitscan), cibles d'entraînement, bot simple
- [ ] Vrai modèle animé (glTF + Mixamo), sons, particules
- [ ] Passer à `@dimforge/rapier3d` (vrai fichier `.wasm`, ~30 % plus léger que la version base64)
- [ ] (optionnel) Multijoueur local : serveur Colyseus/WebSocket, testable en 2 onglets
