/**
 * Association actions -> touches PHYSIQUES (`KeyboardEvent.code`).
 * "KeyW" est la touche Z en AZERTY et W en QWERTY : les contrôles
 * fonctionnent sur tous les claviers sans configuration.
 */
export const BINDINGS = {
  forward: ['KeyW', 'ArrowUp'],
  backward: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  place: ['Mouse0'],
  destroy: ['Mouse2'],
  toggleBuild: ['KeyX'],
  selectWall: ['Digit1'],
  selectFloor: ['Digit2'],
  selectRamp: ['Digit3'],
} as const satisfies Record<string, readonly string[]>

export type Action = keyof typeof BINDINGS
