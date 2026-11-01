import type RAPIER from '@dimforge/rapier3d-compat'

/** Type du module Rapier (injecté dans les systèmes plutôt qu'importé partout). */
export type RapierModule = typeof RAPIER

export type { RAPIER }
