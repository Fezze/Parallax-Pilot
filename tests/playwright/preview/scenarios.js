const ROUND_DEVICE = {
  width: 480,
  height: 480,
  screenShape: 'round',
  keyType: 'normal_21',
  keyNumber: 2,
}

const SQUARE_DEVICE = {
  width: 390,
  height: 390,
  screenShape: 'square',
  keyType: 'normal_21',
  keyNumber: 2,
}

function createScores(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `run-${index}`,
    timestamp: 1000 - index,
    score: 4000 - index * 111,
    survivedMs: 3000 + index * 250,
  }))
}

function createSettings({
  controlMode = 'tilt',
  wristSide = 'left',
  timeScale = 1,
  spawnMultiplier = 1,
  tiltSensitivity = 1,
} = {}) {
  return JSON.stringify({
    controlMode,
    wristSide,
    timeScale,
    spawnMultiplier,
    tiltSensitivity,
  })
}

function createHomeScenario({
  deviceInfo,
  languageCode = 2,
  controlMode,
  wristSide,
  timeScale,
  spawnMultiplier,
  tiltSensitivity,
  scoreCount,
  expectedTexts,
}) {
  return {
    pageModule: '/zepp-app/page/home/index.js',
    deviceInfo,
    languageCode,
    localStorage: {
      settings_v1: createSettings({
        controlMode,
        wristSide,
        timeScale,
        spawnMultiplier,
        tiltSensitivity,
      }),
      scores_v1: JSON.stringify(createScores(scoreCount)),
    },
    sessionStorage: {},
    expectedTexts,
  }
}

function createSettingsScenario({
  deviceInfo,
  languageCode = 2,
  controlMode,
  wristSide = 'left',
  timeScale = 1,
  spawnMultiplier = 1.3,
  tiltSensitivity = 1.4,
  expectedTexts,
}) {
  return {
    pageModule: '/zepp-app/page/settings/index.js',
    deviceInfo,
    languageCode,
    localStorage: {
      settings_v1: createSettings({
        controlMode,
        wristSide,
        timeScale,
        spawnMultiplier,
        tiltSensitivity,
      }),
    },
    sessionStorage: {},
    expectedTexts,
  }
}

function createResultsScenario({
  deviceInfo,
  languageCode = 2,
  scores = [],
  lastSession = null,
  pageIndex = 0,
  expectedTexts,
  forbiddenTexts = [],
}) {
  return {
    pageModule: '/zepp-app/page/results/index.js',
    initParams: JSON.stringify({ pageIndex }),
    deviceInfo,
    languageCode,
    localStorage: {
      scores_v1: JSON.stringify(scores),
    },
    sessionStorage: lastSession
      ? {
          last_session_v1: JSON.stringify(lastSession),
        }
      : {},
    expectedTexts,
    forbiddenTexts,
  }
}

function createGameScenario({
  deviceInfo,
  languageCode = 2,
  wristSide,
  controlMode = 'tilt',
  timeScale = 1,
  spawnMultiplier = 1,
  tiltSensitivity = 1,
}) {
  return {
    pageModule: '/zepp-app/page/game/index.js',
    deviceInfo,
    languageCode,
    localStorage: {
      settings_v1: createSettings({
        controlMode,
        wristSide,
        timeScale,
        spawnMultiplier,
        tiltSensitivity,
      }),
    },
    sessionStorage: {},
    expectedTexts: [],
    afterBuild(page) {
      page.lastSpawnAt = page.startedAt - 2600
      page.lastFrameAt = Date.now() - 16
      page.tick()
      page.tick()

      page.asteroids.slice(0, 3).forEach((asteroid, index) => {
        asteroid.x = Math.round(page.viewport.width * (0.78 - index * 0.18))
        asteroid.y = Math.round(page.viewport.height * (0.24 + index * 0.22))
      })
      page.drawFrame()
    },
  }
}

const pagedScores = createScores(13)
const lastSession = {
  id: 'last',
  timestamp: 9999,
  score: 12345,
  survivedMs: 4321,
  timeScale: 2,
  spawnMultiplier: 1.3,
}

export const previewScenarios = {
  'home-round-default': createHomeScenario({
    deviceInfo: ROUND_DEVICE,
    controlMode: 'tilt',
    wristSide: 'left',
    timeScale: 1,
    spawnMultiplier: 1,
    tiltSensitivity: 1,
    scoreCount: 0,
    expectedTexts: ['PARALLAX PILOT', 'START RUN', '0 RUNS SAVED'],
  }),
  'home-round-tuned': createHomeScenario({
    deviceInfo: ROUND_DEVICE,
    controlMode: 'swipe',
    wristSide: 'right',
    timeScale: 2,
    spawnMultiplier: 1.6,
    tiltSensitivity: 1,
    scoreCount: 5,
    expectedTexts: ['DODGE THE ASTEROIDS', 'TIME 2x  SPAWN 1.6x', '5 RUNS SAVED'],
  }),
  'home-square-tuned': createHomeScenario({
    deviceInfo: SQUARE_DEVICE,
    controlMode: 'touch',
    wristSide: 'left',
    timeScale: 3,
    spawnMultiplier: 2,
    tiltSensitivity: 1,
    scoreCount: 12,
    expectedTexts: ['PARALLAX PILOT', 'SCOREBOARD', '12 RUNS SAVED'],
  }),
  'home-round-pl': createHomeScenario({
    deviceInfo: ROUND_DEVICE,
    languageCode: 9,
    controlMode: 'swipe',
    wristSide: 'left',
    timeScale: 2,
    spawnMultiplier: 1.6,
    tiltSensitivity: 1,
    scoreCount: 5,
    expectedTexts: ['OMIJAJ ASTEROIDY', 'CZAS 2x  ILOŚĆ 1.6x', 'WYNIKI: 5'],
  }),

  'settings-round-tilt': createSettingsScenario({
    deviceInfo: ROUND_DEVICE,
    controlMode: 'tilt',
    expectedTexts: ['SETTINGS', 'CONTROL  TILT', 'TILT  1.4x'],
  }),
  'settings-round-touch': createSettingsScenario({
    deviceInfo: ROUND_DEVICE,
    controlMode: 'touch',
    expectedTexts: ['SETTINGS', 'CONTROL  TOUCH', 'TILT  1.4x'],
  }),
  'settings-round-swipe': createSettingsScenario({
    deviceInfo: ROUND_DEVICE,
    controlMode: 'swipe',
    expectedTexts: ['SETTINGS', 'CONTROL  SWIPE', 'SPAWN  1.3x'],
  }),
  'settings-round-rotary': createSettingsScenario({
    deviceInfo: ROUND_DEVICE,
    controlMode: 'crown',
    expectedTexts: ['SETTINGS', 'CONTROL  ROTARY', 'PLAY'],
  }),
  'settings-square-tilt': createSettingsScenario({
    deviceInfo: SQUARE_DEVICE,
    controlMode: 'tilt',
    expectedTexts: ['SETTINGS', 'CONTROL  TILT', 'BACK'],
  }),
  'settings-square-touch': createSettingsScenario({
    deviceInfo: SQUARE_DEVICE,
    controlMode: 'touch',
    expectedTexts: ['SETTINGS', 'CONTROL  TOUCH', 'PLAY'],
  }),
  'settings-square-pl': createSettingsScenario({
    deviceInfo: SQUARE_DEVICE,
    languageCode: 9,
    controlMode: 'crown',
    wristSide: 'right',
    timeScale: 3,
    spawnMultiplier: 1.3,
    tiltSensitivity: 1.4,
    expectedTexts: ['USTAWIENIA', 'STER.  OBRÓT', 'MENU'],
  }),

  'results-round-empty': createResultsScenario({
    deviceInfo: ROUND_DEVICE,
    scores: [],
    expectedTexts: ['SCOREBOARD', 'NO RUNS SAVED YET', 'BACK', 'PLAY'],
    forbiddenTexts: ['PREV', 'NEXT'],
  }),
  'results-square-empty': createResultsScenario({
    deviceInfo: SQUARE_DEVICE,
    scores: [],
    expectedTexts: ['SCOREBOARD', 'NO RUNS SAVED YET', 'BACK', 'PLAY'],
    forbiddenTexts: ['PREV', 'NEXT'],
  }),
  'results-round-session': createResultsScenario({
    deviceInfo: ROUND_DEVICE,
    scores: createScores(5),
    lastSession,
    expectedTexts: ['RUN OVER', 'RECENT RUNS', 'BACK', 'PLAY'],
    forbiddenTexts: ['PREV', 'NEXT'],
  }),
  'results-square-session': createResultsScenario({
    deviceInfo: SQUARE_DEVICE,
    scores: createScores(5),
    lastSession,
    expectedTexts: ['RUN OVER', 'RECENT RUNS', 'BACK', 'PLAY'],
    forbiddenTexts: ['PREV', 'NEXT'],
  }),
  'results-round-page-first': createResultsScenario({
    deviceInfo: ROUND_DEVICE,
    scores: pagedScores,
    pageIndex: 0,
    expectedTexts: ['SCOREBOARD', '1 / 2', 'NEXT', 'BACK', 'PLAY'],
    forbiddenTexts: ['PREV'],
  }),
  'results-round-page-last': createResultsScenario({
    deviceInfo: ROUND_DEVICE,
    scores: pagedScores,
    pageIndex: 1,
    expectedTexts: ['SCOREBOARD', '2 / 2', 'PREV', 'BACK', 'PLAY'],
    forbiddenTexts: ['NEXT'],
  }),
  'results-square-page-first': createResultsScenario({
    deviceInfo: SQUARE_DEVICE,
    scores: pagedScores,
    pageIndex: 0,
    expectedTexts: ['SCOREBOARD', '1 / 2', 'NEXT', 'BACK', 'PLAY'],
    forbiddenTexts: ['PREV'],
  }),
  'results-square-page-last': createResultsScenario({
    deviceInfo: SQUARE_DEVICE,
    scores: pagedScores,
    pageIndex: 1,
    expectedTexts: ['SCOREBOARD', '2 / 2', 'PREV', 'BACK', 'PLAY'],
    forbiddenTexts: ['NEXT'],
  }),
  'results-round-pl-empty': createResultsScenario({
    deviceInfo: ROUND_DEVICE,
    languageCode: 9,
    scores: [],
    expectedTexts: ['WYNIKI', 'BRAK WYNIKÓW', 'MENU', 'GRAJ'],
    forbiddenTexts: ['POPRZ.', 'DALEJ'],
  }),

  'game-round-left': createGameScenario({
    deviceInfo: ROUND_DEVICE,
    wristSide: 'left',
  }),
  'game-round-right': createGameScenario({
    deviceInfo: ROUND_DEVICE,
    wristSide: 'right',
  }),
  'game-square-left': createGameScenario({
    deviceInfo: SQUARE_DEVICE,
    wristSide: 'left',
  }),
  'game-square-right': createGameScenario({
    deviceInfo: SQUARE_DEVICE,
    wristSide: 'right',
  }),
}
