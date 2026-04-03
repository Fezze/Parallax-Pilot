function createScores(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `run-${index}`,
    timestamp: 1000 - index,
    score: 4000 - index * 111,
    survivedMs: 3000 + index * 250,
  }))
}

export const previewScenarios = {
  'home-round': {
    pageModule: '/zepp-app/page/home/index.js',
    deviceInfo: {
      width: 480,
      height: 480,
      screenShape: 'round',
      keyType: 'normal_21',
      keyNumber: 2,
    },
    localStorage: {
      settings_v1: JSON.stringify({
        controlMode: 'swipe',
        wristSide: 'left',
        timeScale: 2,
        spawnMultiplier: 1.6,
        tiltSensitivity: 1,
      }),
      scores_v1: JSON.stringify(createScores(5)),
    },
    sessionStorage: {},
    expectedTexts: ['PARALLAX PILOT', 'DODGE THE ASTEROIDS', 'START RUN'],
  },
  'settings-round-disabled-tilt': {
    pageModule: '/zepp-app/page/settings/index.js',
    deviceInfo: {
      width: 480,
      height: 480,
      screenShape: 'round',
      keyType: 'normal_21',
      keyNumber: 2,
    },
    localStorage: {
      settings_v1: JSON.stringify({
        controlMode: 'swipe',
        wristSide: 'left',
        timeScale: 1,
        spawnMultiplier: 1.3,
        tiltSensitivity: 1.4,
      }),
    },
    sessionStorage: {},
    expectedTexts: ['SETTINGS', 'CONTROL  SWIPE', 'TILT  1.4x'],
  },
  'results-round': {
    pageModule: '/zepp-app/page/results/index.js',
    initParams: JSON.stringify({ pageIndex: 0 }),
    deviceInfo: {
      width: 480,
      height: 480,
      screenShape: 'round',
      keyType: 'normal_21',
      keyNumber: 2,
    },
    localStorage: {
      scores_v1: JSON.stringify(createScores(10)),
    },
    sessionStorage: {
      last_session_v1: JSON.stringify({
        id: 'last',
        timestamp: 9999,
        score: 12345,
        survivedMs: 4321,
        timeScale: 2,
        spawnMultiplier: 1.3,
      }),
    },
    expectedTexts: ['RUN OVER', 'RECENT RUNS', 'NEXT', 'BACK', 'PLAY'],
  },
  'game-round': {
    pageModule: '/zepp-app/page/game/index.js',
    deviceInfo: {
      width: 480,
      height: 480,
      screenShape: 'round',
      keyType: 'normal_21',
      keyNumber: 2,
    },
    localStorage: {
      settings_v1: JSON.stringify({
        controlMode: 'tilt',
        wristSide: 'left',
        timeScale: 1,
        spawnMultiplier: 1,
        tiltSensitivity: 1,
      }),
    },
    sessionStorage: {},
    expectedTexts: [],
  },
  'game-square': {
    pageModule: '/zepp-app/page/game/index.js',
    deviceInfo: {
      width: 390,
      height: 390,
      screenShape: 'square',
      keyType: 'normal_21',
      keyNumber: 2,
    },
    localStorage: {
      settings_v1: JSON.stringify({
        controlMode: 'tilt',
        wristSide: 'left',
        timeScale: 1,
        spawnMultiplier: 1,
        tiltSensitivity: 1,
      }),
    },
    sessionStorage: {},
    expectedTexts: [],
  },
}
