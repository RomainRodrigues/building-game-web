/**
 * Constantes de gameplay. Tout est en mètres / secondes.
 * Centraliser ces valeurs permet de les régler facilement (et plus tard de
 * les partager avec un serveur multijoueur).
 */
export const CONFIG = {
  /** Fréquence de la simulation (physique + logique), indépendante des FPS. */
  tickRate: 60,

  world: {
    gravity: -30,
    /** Demi-taille du terrain constructible. */
    halfSize: 120,
  },

  player: {
    radius: 0.45,
    /** Hauteur totale de la capsule (pieds -> tête). */
    height: 1.8,
    walkSpeed: 7,
    sprintSpeed: 10.5,
    jumpVelocity: 11,
    airControl: 0.35,
    /** Angle max d'une pente gravissable (les rampes font 45°). */
    maxSlopeDeg: 50,
  },

  camera: {
    fov: 75,
    distance: 4.2,
    shoulderOffset: 0.9,
    heightOffset: 0.55,
    sensitivity: 0.0022,
    minPitch: -1.35,
    maxPitch: 1.35,
  },

  build: {
    /** Taille d'une case de la grille (largeur d'un mur / sol). */
    tile: 4,
    /** Hauteur d'un étage (hauteur d'un mur). */
    height: 4,
    /** Épaisseur des pièces. */
    thickness: 0.2,
    /** Délai entre deux poses quand on maintient le clic (turbo build). */
    turboDelay: 0.08,
    /** Portée max pour détruire une pièce. */
    editRange: 12,
  },
} as const
