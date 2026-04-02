export const ROUTES = {
  HOME: 'page/home/index',
  GAME: 'page/game/index',
  SETTINGS: 'page/settings/index',
  RESULTS: 'page/results/index',
}

export const STORAGE_KEYS = {
  SETTINGS: 'settings_v1',
  SCORES: 'scores_v1',
  LAST_SESSION: 'last_session_v1',
}

export const CONTROL_MODES = ['tilt', 'touch', 'swipe', 'crown']
export const WRIST_SIDES = ['left', 'right']
export const TIME_SCALE_OPTIONS = [0.5, 1, 1.5, 2, 3]
export const SPAWN_MULTIPLIER_OPTIONS = [0.8, 1, 1.3, 1.6, 2]
export const TILT_SENSITIVITY_OPTIONS = [0.6, 1, 1.4, 1.8, 2.2]

export const CONTROL_MODE_LABELS = {
  tilt: 'TILT',
  touch: 'TOUCH',
  swipe: 'SWIPE',
  crown: 'ROTARY',
}

export const WRIST_SIDE_LABELS = {
  left: 'LEFT',
  right: 'RIGHT',
}

export const DEFAULT_SETTINGS = {
  controlMode: 'tilt',
  wristSide: 'left',
  timeScale: 1,
  spawnMultiplier: 1,
  tiltSensitivity: 1,
}

export const MAX_SCORE_HISTORY = 100
export const RESULTS_PAGE_SIZE = 7
export const HP_MAX = 100
export const COLLISION_COOLDOWN_MS = 260
export const ASTEROID_RADIUS_MIN = 7
export const ASTEROID_RADIUS_MAX = 18
export const COLLISION_SLICE_WIDTH = ASTEROID_RADIUS_MAX * 2 + 8
export const COLLISION_BUCKET_HEIGHT = ASTEROID_RADIUS_MAX * 2 + 8
export const COLLISION_GRID_PADDING = ASTEROID_RADIUS_MAX + 8

export const COLORS = {
  background: 0x000000,
  ship: 0xffd400,
  asteroid: 0xffffff,
  hudActive: 0xffd400,
  hudInactive: 0x303030,
  textPrimary: 0xffffff,
  textMuted: 0x9f9f9f,
  button: 0x171717,
  buttonPress: 0x303030,
  accent: 0xffd400,
}
