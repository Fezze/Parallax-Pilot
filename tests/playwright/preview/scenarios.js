const DEFAULT_LOCALE = 'en-US'
const CONFIGURED_LOCALES = ['en-US', 'pl-PL']

const ROUND_480_DEVICE = {
  width: 480,
  height: 480,
  screenShape: 'round',
  keyType: 'normal_21',
  keyNumber: 2,
  resolution: '480x480',
}

const ROUND_466_DEVICE = {
  width: 466,
  height: 466,
  screenShape: 'round',
  keyType: 'normal_21',
  keyNumber: 2,
  resolution: '466x466',
}

const SQUARE_390X450_DEVICE = {
  width: 390,
  height: 450,
  screenShape: 'square',
  keyType: 'normal_21',
  keyNumber: 2,
  resolution: '390x450',
}

const LOCALE_META = {
  'en-US': {
    languageCode: 2,
    strings: {
      homeTitle: 'PARALLAX PILOT',
      homeSubtitle: 'DODGE THE ASTEROIDS',
      startRun: 'START RUN',
      settings: 'SETTINGS',
      scoreboard: 'SCOREBOARD',
      homeMeta: 'TIME {timeScale}x  SPAWN {spawnMultiplier}x',
      savedRuns: '{count} RUNS SAVED',
      tapToChange: 'TAP TO CHANGE',
      controlLabel: 'CONTROL',
      wristLabel: 'WRIST',
      timeLabel: 'TIME',
      spawnLabel: 'SPAWN',
      tiltLabel: 'TILT',
      back: 'BACK',
      play: 'PLAY',
      prev: 'PREVIOUS',
      next: 'NEXT',
      runOver: 'RUN OVER',
      recentRuns: 'RECENT RUNS',
      noRunsSavedYet: 'NO RUNS SAVED YET',
      controlMode_tilt: 'TILT',
      controlMode_touch: 'TOUCH',
      controlMode_swipe: 'SWIPE',
      controlMode_crown: 'ROTARY',
    },
  },
  'pl-PL': {
    languageCode: 9,
    strings: {
      homeTitle: 'PARALLAX PILOT',
      homeSubtitle: 'OMIJAJ ASTEROIDY',
      startRun: 'START',
      settings: 'USTAWIENIA',
      scoreboard: 'WYNIKI',
      homeMeta: 'CZAS {timeScale}x  ILO\u015a\u0106 {spawnMultiplier}x',
      savedRuns: 'WYNIKI: {count}',
      tapToChange: 'DOTKNIJ, BY ZMIENI\u0106',
      controlLabel: 'STEROWANIE',
      wristLabel: 'R\u0118KA',
      timeLabel: 'CZAS',
      spawnLabel: 'ILO\u015a\u0106',
      tiltLabel: 'PRZECHYLENIE',
      back: 'MENU',
      play: 'GRAJ',
      prev: 'POPRZEDNIA',
      next: 'NAST\u0118PNA',
      runOver: 'KONIEC',
      recentRuns: 'OSTATNIE WYNIKI',
      noRunsSavedYet: 'BRAK WYNIK\u00d3W',
      controlMode_tilt: 'PRZECHYLENIE',
      controlMode_touch: 'DOTYK',
      controlMode_swipe: 'PRZESUWANIE',
      controlMode_crown: 'OBR\u00d3T',
    },
  },
}

function localeMeta(locale) {
  return LOCALE_META[locale] || LOCALE_META[DEFAULT_LOCALE] || LOCALE_META['en-US']
}

function t(locale, key, params = {}) {
  const template = localeMeta(locale).strings[key] ?? key
  return String(template).replace(/\{(\w+)\}/g, (_, paramKey) =>
    Object.prototype.hasOwnProperty.call(params, paramKey) ? params[paramKey] : `{${paramKey}}`
  )
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

function createScenarioBase({
  locale,
  pageName,
  shape,
  variant,
  pageModule,
  deviceInfo,
  localStorage,
  sessionStorage = {},
  initParams,
  expectedTexts = [],
  forbiddenTexts = [],
  afterBuild,
}) {
  return {
    locale,
    languageCode: localeMeta(locale).languageCode,
    pageName,
    shape,
    variant,
    pageModule,
    deviceInfo,
    resolution: deviceInfo.resolution || `${deviceInfo.width}x${deviceInfo.height}`,
    localStorage,
    sessionStorage,
    initParams,
    expectedTexts,
    forbiddenTexts,
    afterBuild,
  }
}

function createHomeScenario({
  locale,
  deviceInfo,
  variant,
  controlMode,
  wristSide,
  timeScale,
  spawnMultiplier,
  tiltSensitivity,
  scoreCount,
  expectedTexts,
}) {
  return createScenarioBase({
    locale,
    pageName: 'home',
    shape: deviceInfo.screenShape,
    variant,
    pageModule: '/zepp-app/page/home/index.js',
    deviceInfo,
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
    expectedTexts,
  })
}

function createSettingsScenario({
  locale,
  deviceInfo,
  variant,
  controlMode,
  wristSide = 'left',
  timeScale = 1,
  spawnMultiplier = 1.3,
  tiltSensitivity = 1.4,
  expectedTexts,
}) {
  return createScenarioBase({
    locale,
    pageName: 'settings',
    shape: deviceInfo.screenShape,
    variant,
    pageModule: '/zepp-app/page/settings/index.js',
    deviceInfo,
    localStorage: {
      settings_v1: createSettings({
        controlMode,
        wristSide,
        timeScale,
        spawnMultiplier,
        tiltSensitivity,
      }),
    },
    expectedTexts,
  })
}

function createResultsScenario({
  locale,
  deviceInfo,
  variant,
  scores = [],
  lastSession = null,
  pageIndex = 0,
  expectedTexts,
  forbiddenTexts = [],
}) {
  return createScenarioBase({
    locale,
    pageName: 'results',
    shape: deviceInfo.screenShape,
    variant,
    pageModule: '/zepp-app/page/results/index.js',
    deviceInfo,
    initParams: JSON.stringify({ pageIndex }),
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
  })
}

function createGameScenario({
  locale,
  deviceInfo,
  variant,
  wristSide,
  controlMode = 'tilt',
  timeScale = 1,
  spawnMultiplier = 1,
  tiltSensitivity = 1,
}) {
  return createScenarioBase({
    locale,
    pageName: 'game',
    shape: deviceInfo.screenShape,
    variant,
    pageModule: '/zepp-app/page/game/index.js',
    deviceInfo,
    localStorage: {
      settings_v1: createSettings({
        controlMode,
        wristSide,
        timeScale,
        spawnMultiplier,
        tiltSensitivity,
      }),
    },
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
  })
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

const DEVICE_FAMILIES = [
  { key: 'round-480', deviceInfo: ROUND_480_DEVICE },
  { key: 'round-466', deviceInfo: ROUND_466_DEVICE },
  { key: 'square-390x450', deviceInfo: SQUARE_390X450_DEVICE },
]

function scenariosForDevice(locale, deviceFamily) {
  const { key, deviceInfo } = deviceFamily
  const isRound = deviceInfo.screenShape === 'round'
  const shapeKey = isRound ? 'round' : 'square'

  return [
    [
      `home-${key}-default-${locale}`,
      createHomeScenario({
        locale,
        deviceInfo,
        variant: 'default',
        controlMode: 'tilt',
        wristSide: 'left',
        timeScale: 1,
        spawnMultiplier: 1,
        tiltSensitivity: 1,
        scoreCount: 0,
        expectedTexts: [t(locale, 'homeTitle'), t(locale, 'startRun'), t(locale, 'savedRuns', { count: 0 })],
      }),
    ],
    [
      `home-${key}-tuned-${locale}`,
      createHomeScenario({
        locale,
        deviceInfo,
        variant: 'tuned',
        controlMode: isRound ? 'swipe' : 'touch',
        wristSide: isRound ? 'right' : 'left',
        timeScale: isRound ? 2 : 3,
        spawnMultiplier: isRound ? 1.6 : 2,
        tiltSensitivity: 1,
        scoreCount: isRound ? 5 : 12,
        expectedTexts: isRound
          ? [
              t(locale, 'homeSubtitle'),
              t(locale, 'homeMeta', { timeScale: 2, spawnMultiplier: 1.6 }),
              t(locale, 'savedRuns', { count: 5 }),
            ]
          : [t(locale, 'homeTitle'), t(locale, 'scoreboard'), t(locale, 'savedRuns', { count: 12 })],
      }),
    ],
    [
      `settings-${key}-tilt-${locale}`,
      createSettingsScenario({
        locale,
        deviceInfo,
        variant: 'tilt',
        controlMode: 'tilt',
        expectedTexts: [
          t(locale, 'settings'),
          `${t(locale, 'controlLabel')}  ${t(locale, 'controlMode_tilt')}`,
          isRound ? `${t(locale, 'tiltLabel')}  1.4x` : t(locale, 'back'),
        ],
      }),
    ],
    [
      `settings-${key}-${isRound ? 'touch' : 'touch'}-${locale}`,
      createSettingsScenario({
        locale,
        deviceInfo,
        variant: 'touch',
        controlMode: 'touch',
        expectedTexts: [
          t(locale, 'settings'),
          `${t(locale, 'controlLabel')}  ${t(locale, 'controlMode_touch')}`,
          isRound ? `${t(locale, 'tiltLabel')}  1.4x` : t(locale, 'play'),
        ],
      }),
    ],
    ...(isRound
      ? [
          [
            `settings-${key}-swipe-${locale}`,
            createSettingsScenario({
              locale,
              deviceInfo,
              variant: 'swipe',
              controlMode: 'swipe',
              expectedTexts: [
                t(locale, 'settings'),
                `${t(locale, 'controlLabel')}  ${t(locale, 'controlMode_swipe')}`,
                `${t(locale, 'spawnLabel')}  1.3x`,
              ],
            }),
          ],
          [
            `settings-${key}-rotary-${locale}`,
            createSettingsScenario({
              locale,
              deviceInfo,
              variant: 'rotary',
              controlMode: 'crown',
              expectedTexts: [
                t(locale, 'settings'),
                `${t(locale, 'controlLabel')}  ${t(locale, 'controlMode_crown')}`,
                t(locale, 'play'),
              ],
            }),
          ],
        ]
      : []),
    [
      `results-${key}-empty-${locale}`,
      createResultsScenario({
        locale,
        deviceInfo,
        variant: 'empty',
        scores: [],
        expectedTexts: [t(locale, 'scoreboard'), t(locale, 'noRunsSavedYet'), t(locale, 'back'), t(locale, 'play')],
        forbiddenTexts: [t(locale, 'prev'), t(locale, 'next')],
      }),
    ],
    [
      `results-${key}-session-${locale}`,
      createResultsScenario({
        locale,
        deviceInfo,
        variant: 'session',
        scores: createScores(5),
        lastSession,
        expectedTexts: [t(locale, 'runOver'), t(locale, 'recentRuns'), t(locale, 'back'), t(locale, 'play')],
        forbiddenTexts: [t(locale, 'prev'), t(locale, 'next')],
      }),
    ],
    [
      `results-${key}-page-first-${locale}`,
      createResultsScenario({
        locale,
        deviceInfo,
        variant: 'page-first',
        scores: pagedScores,
        pageIndex: 0,
        expectedTexts: [t(locale, 'scoreboard'), '1 / 2', t(locale, 'next'), t(locale, 'back'), t(locale, 'play')],
        forbiddenTexts: [t(locale, 'prev')],
      }),
    ],
    [
      `results-${key}-page-last-${locale}`,
      createResultsScenario({
        locale,
        deviceInfo,
        variant: 'page-last',
        scores: pagedScores,
        pageIndex: 1,
        expectedTexts: [t(locale, 'scoreboard'), '2 / 2', t(locale, 'prev'), t(locale, 'back'), t(locale, 'play')],
        forbiddenTexts: [t(locale, 'next')],
      }),
    ],
    [
      `game-${key}-left-${locale}`,
      createGameScenario({
        locale,
        deviceInfo,
        variant: 'left',
        wristSide: 'left',
      }),
    ],
    [
      `game-${key}-right-${locale}`,
      createGameScenario({
        locale,
        deviceInfo,
        variant: 'right',
        wristSide: 'right',
      }),
    ],
  ]
}

export const previewScenarios = Object.fromEntries(
  CONFIGURED_LOCALES.flatMap((locale) => DEVICE_FAMILIES.flatMap((deviceFamily) => scenariosForDevice(locale, deviceFamily)))
)
