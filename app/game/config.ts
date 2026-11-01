/**
 * Constantes de gameplay. Unités : mètres, secondes, radians.
 *
 * Toutes les valeurs "à régler" vivent ici : le reste du moteur ne contient
 * aucun nombre magique. Elles pourront aussi être partagées avec un serveur.
 */
export const CONFIG = {
  /** Fréquence de la simulation (physique + logique), indépendante des FPS. */
  tickRate: 60,
  /** Delta max d'une frame : évite la "spirale de la mort" après une pause. */
  maxFrameDelta: 0.25,

  world: {
    gravity: -30,
    /** Demi-taille du terrain constructible. */
    halfSize: 120,
    /** Altitude sous laquelle le joueur est replacé au point d'apparition. */
    killY: -30,
    /** Rayon autour du spawn sans décor. */
    spawnClearRadius: 14,
    propCount: 40,
  },

  player: {
    radius: 0.45,
    /** Hauteur totale de la capsule (pieds -> tête). */
    height: 1.8,
    /** Course de base : déjà rapide, le sprint n'apporte qu'un léger bonus. */
    walkSpeed: 5.5,
    sprintSpeed: 6.5,
    jumpVelocity: 11,
    /** Réactivité du contrôle en l'air (0 = aucun contrôle). */
    airControl: 0.35,
    /** Vitesse verticale appliquée au sol pour rester "collé" aux pentes descendantes. */
    groundStickVelocity: -1,
    /** Angle max d'une pente gravissable (les rampes font 45°). */
    maxSlopeDeg: 50,
    /** Angle à partir duquel on glisse quand on est immobile. */
    minSlopeSlideDeg: 55,
    /** Marge de collision du character controller Rapier. */
    controllerOffset: 0.02,
    autostepMaxHeight: 0.45,
    autostepMinWidth: 0.2,
    snapToGroundDistance: 0.4,
    /** Multiplicateur max pour compenser la perte de vitesse en montée. */
    maxSlopeBoost: 2,
    /** Vitesse de rotation de l'avatar vers sa direction de déplacement. */
    turnSpeed: 14,
  },

  camera: {
    fov: 75,
    near: 0.1,
    far: 500,
    /** Distance derrière le pivot. */
    distance: 2.6,
    /** Décalage vers la droite (vue par-dessus l'épaule). */
    shoulderOffset: 0.8,
    /** Hauteur du pivot au-dessus des pieds (niveau des épaules / de la tête). */
    pivotHeight: 1.75,
    /** Distance minimale quand un mur pousse la caméra vers le joueur. */
    minDistance: 0.3,
    /** Écart conservé entre la caméra et un mur. */
    collisionMargin: 0.2,
    /** Vitesse de retour à la distance normale après une collision. */
    recoverSpeed: 6,
    sensitivity: 0.0022,
    minPitch: -1.35,
    maxPitch: 1.35,
    initialPitch: -0.15,
  },

  build: {
    /** Taille d'une case de la grille (largeur d'un mur / sol). */
    tile: 5,
    /** Hauteur d'un étage (hauteur d'un mur). */
    height: 4,
    /** Épaisseur des pièces. */
    thickness: 0.2,
    /** Délai entre deux poses quand on maintient le clic (turbo build). */
    turboDelay: 0.08,
    /** Portée max pour détruire une pièce, depuis le joueur. */
    editRange: 12,
    /** Un sol/une rampe posé jusqu'à cette hauteur au-dessus des pieds remonte le joueur dessus. */
    maxLiftHeight: 2.5,
    hp: { wall: 150, floor: 140, ramp: 140 },
  },

  hud: {
    /** Intervalle de rafraîchissement du HUD Vue (s). */
    refreshInterval: 0.25,
  },
} as const
