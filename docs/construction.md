# Système de construction

Référence complète du fonctionnement des constructions : ce que fait le jeu, et où c'est
codé. **Toute modification des règles de construction doit mettre ce document à jour**,
ainsi que les tests associés.

| Sujet | Code | Tests |
|---|---|---|
| Grille, pièces, emplacements, placement | `app/game/build/BuildGrid.ts` | `tests/unit/BuildGrid.spec.ts` |
| Appuis et effondrements | `app/game/build/Structure.ts` | `tests/unit/Structure.spec.ts` |
| Rendu, collisions, visée, pose / destruction | `app/game/build/BuildSystem.ts` | navigateur (voir `CLAUDE.md`) |
| Orchestration (touches, turbo, remontée du joueur) | `app/game/Game.ts` | navigateur |
| Valeurs réglables | `app/game/config.ts` (section `build`) | |

## 1. La grille

Le monde est découpé en **cases** de 5 × 5 m (`build.tile`) et en **étages** de 4 m
(`build.height`). Une case est repérée par `(cx, cz)` et un étage par `level` (0 = le sol).

Les directions suivent l'orientation horizontale de la caméra :

| `dir` | Direction | Axe |
|---|---|---|
| 0 | nord | -Z |
| 1 | ouest | -X |
| 2 | sud | +Z |
| 3 | est | +X |

## 2. Les pièces

| Pièce | Touche | Forme | Position |
|---|---|---|---|
| Mur | 1 | Plaque verticale 5 × 4 m | Sur un **bord** de case, du bas au haut de l'étage |
| Sol | 2 | Dalle 5 × 5 m | Sur la **face du bas** de la case, à la hauteur de l'étage |
| Rampe | 3 | Plan incliné (~39°) | Dans le **volume** de la case, du bas d'un bord au haut du bord opposé |
| Toit | 4 | Pyramide de 2 m de haut (`build.roofHeight`) | Dans le **volume** de la case, base à la hauteur de l'étage |

Toutes les pièces ont 0,2 m d'épaisseur (`build.thickness`) et des points de vie
(`build.hp`, pas encore utilisés en jeu). La molette fait défiler les pièces, et **X**
range la pièce en main.

## 3. Les emplacements (une pièce par emplacement)

Chaque pièce occupe un **emplacement**, identifié par sa clé (`PieceSpec.key`). Deux pièces
ne peuvent jamais occuper le même emplacement : l'aperçu devient rouge.

| Emplacement | Clé | Pièces |
|---|---|---|
| Bord perpendiculaire à X | `wall:x:<bx>:<étage>:<cz>` | mur |
| Bord perpendiculaire à Z | `wall:z:<cx>:<étage>:<bz>` | mur |
| Face du bas d'une case | `floor:<cx>:<étage>:<cz>` | sol |
| Volume d'une case | `volume:<cx>:<étage>:<cz>` | rampe **ou** toit |

Conséquences :

- Un bord est partagé par les deux cases voisines : on ne peut pas doubler un mur.
- Dans une même case et à un même étage, on peut avoir un sol **et** une rampe, ou un sol
  **et** un toit, mais **jamais une rampe et un toit**, ni deux rampes.
- Le toit d'un étage et la rampe de l'étage du dessous ne se chevauchent pas : ils
  occupent deux emplacements différents.

## 4. Placement : là où vise le réticule

Le placement suit la convention du genre : **la pièce se pose là où l'on vise**. Il n'y a
pas de cas particulier par situation (rampe, saut, mur collé…). Tous ces comportements
découlent du point visé.

### 4.1 Le point visé (`BuildSystem.aimTarget`)

Un rayon part de la caméra dans l'axe du réticule. Il s'arrête :

- sur la première surface touchée (sol, pièce, décor), en reculant de 5 cm vers la caméra
  pour rester **du côté du joueur** (`AIM_SURFACE_OFFSET`) ;
- sinon, à 4,5 m au-delà de la tête du joueur (`build.aimReach`).

Il ignore le joueur lui-même. Il est recalculé à chaque tick, avec la caméra de la
dernière frame.

### 4.2 Case et étage (`computePlacement`)

1. **Case** : celle qui contient le point visé, ramenée si besoin dans la case du joueur ou
   une de ses 8 voisines (`TILE_REACH = 1`).
2. **Étage** : déduit de la hauteur du point visé, puis borné à un étage près autour de
   celui du joueur (`LEVEL_REACH = 1`), et jamais sous le sol.
   - Mur et toit : l'étage qui **contient** le point visé (`floor(y / 4)`).
   - Sol et rampe : on ne passe à l'étage supérieur qu'au-delà des 3/4 de l'étage
     (`UPPER_LEVEL_FRACTION`). Regarder à peine vers le haut ne suffit pas.
3. **Étage du joueur** : celui de ses pieds, avec 0,3 m de tolérance (`levelOf`). Un
   joueur debout sur un sol compte bien à l'étage de ce sol.

### 4.3 Règle propre à chaque pièce

| Pièce | Règle |
|---|---|
| Sol | Sur la case visée, au sol compris. |
| Toit | Sur la case visée, au sol compris (pour occuper une case) ou en hauteur (au-dessus d'une boîte, par-dessus un mur). |
| Rampe | Sur la case visée, **montant dans le sens du regard**. Si une rampe montant dans le même sens occupe déjà la case, la nouvelle la **prolonge** : case suivante, un étage plus haut. |
| Mur | Perpendiculaire au regard, sur la ligne de grille la plus proche du point visé, **jamais derrière le joueur**. À distance égale, la ligne la plus proche du joueur l'emporte. |

### 4.4 Comportements qui en découlent

| Situation | Résultat |
|---|---|
| Au sol, regard normal | Mur sur le bord avant de sa case ; sol / rampe / toit sur la case devant, au sol |
| Viser le sol à ses pieds | Sol / toit dans sa propre case |
| Regarder franchement vers le haut | La pièce passe à l'étage du dessus |
| Collé face à un mur, poser une rampe | Le rayon touche le mur : la rampe se pose dans **sa** case, montant vers le mur |
| Viser au-dessus d'un mur | Toit / sol dans la case **derrière** le mur, à l'étage du dessus |
| Sur une rampe, viser devant | Mur au **bout** de la rampe, au même étage (la rampe s'appuie contre lui) |
| Sur une rampe, viser haut (ou sauter) | Mur au-dessus de la rampe |
| Avancer en maintenant le clic, rampe en main ("ramp rush") | Chaque rampe prolonge la précédente : environ 4 m de montée par seconde |
| Dans une boîte de 4 murs, regarder vers le haut | Toit sur la boîte (en regardant presque à la verticale, sinon le rayon passe par-dessus le mur avant) |

## 5. Validité d'une pose

L'aperçu est **bleu** si la pièce peut être posée, **rouge** sinon. Une pose est refusée si :

1. son emplacement est déjà occupé (section 3) ;
2. elle sort du terrain (`world.halfSize`) ou passe sous le sol ;
3. c'est un mur qui traverserait le joueur ;
4. elle n'est **pas soutenue** (section 6).

Clic gauche : pose la pièce. Clic maintenu : pose en rafale toutes les 0,08 s
(`build.turboDelay`).

## 6. Appuis et effondrements (`Structure.ts`)

### 6.1 Règles

- Une pièce posée à l'**étage 0** repose sur le terrain : elle est **ancrée**.
- Une pièce ne peut être posée que si elle est ancrée **ou** connectée à une pièce
  existante. Toutes les pièces existantes étant reliées au sol, c'est vrai de proche en
  proche.
- Quand une pièce est détruite, **tout ce qui n'est plus relié au sol s'effondre**
  (disparaît), quel que soit le nombre de pièces concernées.

### 6.2 Connexions : les jointures

Deux pièces sont connectées si elles partagent une **jointure** de la grille. Un simple
contact par un coin ne suffit jamais.

| Jointure | Description | Occupée par |
|---|---|---|
| Arête horizontale | Un bord de case, à la hauteur d'un étage | sol (ses 4 bords), toit (les 4 bords de sa base), mur (bord bas et bord haut), rampe (bord bas et bord haut) |
| Poteau | Un coin de case, sur un étage | mur (ses 2 extrémités) |
| Diagonale | Le côté d'une rampe, sur la face verticale d'une frontière, pour un sens de montée | rampe (ses 2 côtés), mur (les 2 sens possibles sur sa face) |

Ce que cela donne :

| Pièces | Connectées ? |
|---|---|
| Mur posé sur le bord d'un sol, ou sol posé sur le haut d'un mur | Oui |
| Deux murs empilés, ou deux murs en coin | Oui |
| Toit sur le haut d'un mur, d'un sol ou d'une rampe | Oui |
| Rampe prolongeant une autre rampe | Oui (bord haut / bord bas) |
| Rampe contre un mur (sur son côté) | Oui |
| Deux rampes côte à côte montant dans le **même** sens | Oui (côté diagonal commun) |
| Deux rampes côte à côte de sens **différents** | **Non** (contact par un coin seulement) |
| Deux sols d'étages différents, ou éloignés | Non |

## 7. Le joueur et les pièces

- **Remontée** (`liftHeightAfterPlacing`) : si une pièce posée **traverse le corps** du
  joueur, c'est-à-dire si sa surface est entre ses pieds et le haut de sa tête, le joueur
  est remonté dessus, avec 5 cm de jeu (`LIFT_CLEARANCE`). Une pièce entièrement
  au-dessus de sa tête le laisse libre dessous : **jamais de téléportation**.
- **Collisions** : murs, sols et rampes sont des boîtes ; le toit est l'enveloppe convexe
  de sa pyramide. On peut marcher sur les rampes et les toits.
- **Destruction** : clic droit sur une pièce visée, jusqu'à 12 m du joueur
  (`build.editRange`). Les pièces qui ne tiennent plus s'effondrent (section 6).

## 8. Limites connues et évolutions prévues

- Pas d'édition de pièces (portes, fenêtres) ni de matériaux (bois / pierre / métal).
- Les points de vie existent mais rien ne les fait baisser (pas encore d'armes).
- Les effondrements sont instantanés, sans animation.
- Les rampes sont limitées aux 4 directions, et les murs ne peuvent pas être posés en
  diagonale.
