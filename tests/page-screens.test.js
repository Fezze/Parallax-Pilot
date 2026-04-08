import test from 'node:test'
import assert from 'node:assert/strict'
import {
  __resetDeviceInfo,
  __setDeviceInfo,
  SCREEN_SHAPE_ROUND,
} from './mocks/zos/device.mjs'
import { __getRouterCalls, __resetRouter } from './mocks/zos/router.mjs'
import {
  __getButtonWidgets,
  __getCanvasWidgets,
  __getTextWidgets,
  __isStatusBarVisible,
  __resetUI,
} from './mocks/zos/ui.mjs'
import { __resetInteraction } from './mocks/zos/interaction.mjs'
import { __resetSensors } from './mocks/zos/sensor.mjs'
import {
  __getLastBrightTime,
  __getResetCount,
  __resetDisplay,
} from './mocks/zos/display.mjs'
import { __resetLanguage, __setLanguage } from './mocks/zos/settings.mjs'
import {
  __readLocalStorage,
  __resetStorage,
  __seedLocalStorage,
  __seedSessionStorage,
} from './mocks/zos/storage.mjs'

function resetEnv() {
  __resetDeviceInfo()
  __resetRouter()
  __resetUI()
  __resetInteraction()
  __resetSensors()
  __resetDisplay()
  __resetStorage()
  __resetLanguage()
}

async function loadPageDefinition(relativePath) {
  globalThis.__zeppPageDefinition = null
  await import(new URL(`${relativePath}?test=${Date.now()}-${Math.random()}`, import.meta.url))
  return globalThis.__zeppPageDefinition
}

function findButton(textPrefix) {
  const directMatch = __getButtonWidgets().find((widget) =>
    typeof widget.props.text === 'string' &&
    widget.props.text.startsWith(textPrefix)
  )

  if (directMatch) {
    return directMatch
  }

  const textWidget = __getTextWidgets().find((widget) =>
    widget.props.text.startsWith(textPrefix)
  )

  if (!textWidget) {
    return undefined
  }

  const centerX = textWidget.props.x + textWidget.props.w / 2
  const centerY = textWidget.props.y + textWidget.props.h / 2

  return __getButtonWidgets().find((widget) => {
    const { x, y, w, h } = widget.props
    return centerX >= x && centerX <= x + w && centerY >= y && centerY <= y + h
  })
}

function hasExactButtonText(text) {
  return __getButtonWidgets().some((widget) => widget.props.text === text) ||
    __getTextWidgets().some((widget) => widget.props.text === text)
}

function getTexts() {
  return __getTextWidgets().map((widget) => widget.props.text)
}

function findText(text) {
  return __getTextWidgets().find((widget) => widget.props.text === text)
}

test('home screen renders simplified copy and routes from main actions', async () => {
  resetEnv()
  __seedLocalStorage({
    settings_v1: JSON.stringify({
      controlMode: 'swipe',
      wristSide: 'left',
      timeScale: 2,
      spawnMultiplier: 1.25,
      tiltSensitivity: 1,
    }),
    scores_v1: JSON.stringify([{ id: 'run-1', timestamp: 1 }]),
  })

  const page = await loadPageDefinition('../zepp-app/page/home/index.js')
  page.build()

  const texts = getTexts()
  assert.equal(__isStatusBarVisible(), false)
  assert.ok(texts.includes('PARALLAX PILOT'))
  assert.ok(texts.includes('DODGE THE ASTEROIDS'))
  assert.ok(texts.includes('TIME 2x  SPAWN 1.25x'))
  assert.ok(texts.includes('1 RUNS SAVED'))
  assert.equal(texts.some((text) => text.includes('CROWN AVAILABLE')), false)
  assert.equal(texts.some((text) => text.startsWith('SHIP ')), false)
  assert.equal(texts.some((text) => text.startsWith('CONTROL ')), false)

  findButton('START RUN').props.click_func()
  findButton('SCOREBOARD').props.click_func()

  assert.deepEqual(__getRouterCalls(), [
    { type: 'push', payload: { url: 'page/game/index' } },
    { type: 'push', payload: { url: 'page/results/index' } },
  ])
})

test('home screen renders Polish copy when the watch language is pl-PL', async () => {
  resetEnv()
  __setLanguage(9)
  __seedLocalStorage({
    settings_v1: JSON.stringify({
      controlMode: 'swipe',
      wristSide: 'left',
      timeScale: 2,
      spawnMultiplier: 1.25,
      tiltSensitivity: 1,
    }),
    scores_v1: JSON.stringify([{ id: 'run-1', timestamp: 1 }]),
  })

  const page = await loadPageDefinition('../zepp-app/page/home/index.js')
  page.build()

  const texts = getTexts()
  assert.ok(texts.includes('OMIJAJ ASTEROIDY'))
  assert.ok(texts.includes('CZAS 2x  ILO\u015a\u0106 1.25x'))
  assert.ok(texts.includes('WYNIKI: 1'))
  assert.ok(findButton('START'))
  assert.ok(findButton('USTAWIENIA'))
  assert.ok(findButton('WYNIKI'))
})

test('home square layout keeps metadata below the action stack', async () => {
  resetEnv()
  __setDeviceInfo({
    width: 390,
    height: 450,
    screenShape: 'square',
  })
  __seedLocalStorage({
    settings_v1: JSON.stringify({
      controlMode: 'touch',
      wristSide: 'left',
      timeScale: 3,
      spawnMultiplier: 1.25,
      tiltSensitivity: 1,
    }),
    scores_v1: JSON.stringify(Array.from({ length: 12 }, (_, index) => ({ id: `${index}` }))),
  })

  const page = await loadPageDefinition('../zepp-app/page/home/index.js')
  page.build()

  const scoreButton = findButton('SCOREBOARD')
  const timeLabel = findText('TIME 3x  SPAWN 1.25x')

  assert.ok(scoreButton)
  assert.ok(timeLabel)
  assert.equal(scoreButton.props.y, 238)
  assert.equal(timeLabel.props.y, 358)
})

test('settings screen routes into tilt calibration', async () => {
  resetEnv()
  __seedLocalStorage({
    settings_v1: JSON.stringify({
      controlMode: 'tilt',
      wristSide: 'left',
      timeScale: 1,
      spawnMultiplier: 1,
      tiltSensitivity: 0.95,
    }),
  })

  const page = await loadPageDefinition('../zepp-app/page/settings/index.js')
  page.build()

  const calibrateButton = findButton('CALIBRATE')
  calibrateButton.props.click_func()

  assert.deepEqual(__getRouterCalls(), [
    { type: 'push', payload: { url: 'page/tilt-calibration/index' } },
  ])
})

test('settings screen keeps calibration inactive outside tilt mode', async () => {
  resetEnv()
  __seedLocalStorage({
    settings_v1: JSON.stringify({
      controlMode: 'touch',
      wristSide: 'left',
      timeScale: 1,
      spawnMultiplier: 1,
      tiltSensitivity: 0.95,
    }),
  })

  const page = await loadPageDefinition('../zepp-app/page/settings/index.js')
  page.build()

  const calibrateButton = findButton('CALIBRATE  NOT SET')
  assert.ok(calibrateButton)
  calibrateButton.props.click_func?.()
  assert.deepEqual(__getRouterCalls(), [])
  assert.equal(calibrateButton.props.color, 0x9f9f9f)
})

test('settings screen shows calibration status when a tilt profile exists', async () => {
  resetEnv()
  __seedLocalStorage({
    settings_v1: JSON.stringify({
      controlMode: 'tilt',
      wristSide: 'left',
      timeScale: 1,
      spawnMultiplier: 1,
      tiltSensitivity: 0.95,
    }),
    tilt_calibration_v1: JSON.stringify({
      offset: 0.2,
      deadzone: 0.8,
      negativeRange: 8,
      positiveRange: 9,
      responseExponent: 1.1,
      noisePeak: 0.3,
      timestamp: 1,
    }),
  })

  const page = await loadPageDefinition('../zepp-app/page/settings/index.js')
  page.build()

  assert.ok(findButton('CALIBRATE  READY'))
})

test('settings square layout leaves clear space above footer actions', async () => {
  resetEnv()
  __setDeviceInfo({
    width: 390,
    height: 450,
    screenShape: 'square',
  })
  __seedLocalStorage({
    settings_v1: JSON.stringify({
      controlMode: 'touch',
      wristSide: 'left',
      timeScale: 1,
      spawnMultiplier: 1.25,
      tiltSensitivity: 0.95,
    }),
  })

  const page = await loadPageDefinition('../zepp-app/page/settings/index.js')
  page.build()

  const tiltButton = findButton('CALIBRATE')
  const backButton = findButton('BACK')
  const playButton = findButton('PLAY')

  assert.ok(tiltButton)
  assert.equal(tiltButton.props.y, 285)
  assert.equal(backButton.props.y, 392)
  assert.equal(playButton.props.y, 392)
})

test('settings small round layout keeps footer buttons inside the visible circle', async () => {
  resetEnv()
  __setDeviceInfo({
    width: 416,
    height: 416,
    screenShape: SCREEN_SHAPE_ROUND,
  })
  __seedLocalStorage({
    settings_v1: JSON.stringify({
      controlMode: 'tilt',
      wristSide: 'left',
      timeScale: 1,
      spawnMultiplier: 1,
      tiltSensitivity: 0.95,
    }),
  })

  const page = await loadPageDefinition('../zepp-app/page/settings/index.js')
  page.build()

  const backButton = findButton('BACK')
  const playButton = findButton('PLAY')
  const calibrateButton = findButton('CALIBRATE')

  assert.ok(calibrateButton)
  assert.ok(backButton)
  assert.ok(playButton)
  assert.equal(calibrateButton.props.y < backButton.props.y, true)
  assert.equal(backButton.props.y, 352)
  assert.equal(playButton.props.y, 352)
})

test('settings screen renders Polish labels and values when the watch language is pl-PL', async () => {
  resetEnv()
  __setLanguage(9)
  __seedLocalStorage({
    settings_v1: JSON.stringify({
      controlMode: 'swipe',
      wristSide: 'right',
      timeScale: 3,
      spawnMultiplier: 1.25,
      tiltSensitivity: 0.95,
    }),
  })

  const page = await loadPageDefinition('../zepp-app/page/settings/index.js')
  page.build()

  const texts = getTexts()
  assert.ok(texts.includes('USTAWIENIA'))
  assert.ok(texts.includes('DOTKNIJ, BY ZMIENI\u0106'))
  assert.ok(findButton('STEROWANIE  PRZESUWANIE'))
  assert.ok(findButton('KALIBRACJA  BRAK'))
  assert.ok(findButton('R\u0118KA  PRAWA'))
  assert.ok(findButton('CZAS  3x'))
  assert.ok(findButton('ILO\u015a\u0106  1.25x'))
  assert.ok(findButton('MENU'))
  assert.ok(findButton('GRAJ'))
})

test('tilt calibration screen shows guide and initial step state', async () => {
  resetEnv()

  const page = await loadPageDefinition('../zepp-app/page/tilt-calibration/index.js')
  page.build()

  const texts = getTexts()
  assert.ok(texts.includes('TILT CALIBRATION'))
  assert.ok(texts.includes('FOLLOW THE MOTION PROMPTS'))
  assert.ok(texts.includes('STEP 1 / 3'))
  assert.ok(texts.includes('HOLD CENTER'))
  assert.ok(texts.includes('HOLD STILL 0.0 / 1.4s'))

  page.onDestroy?.()
})

test('tilt calibration logs use a safe single back action on round screens', async () => {
  resetEnv()
  __setDeviceInfo({
    width: 480,
    height: 480,
    screenShape: SCREEN_SHAPE_ROUND,
  })
  __seedLocalStorage({
    tilt_calibration_report_v1: JSON.stringify({
      metrics: {
        offset: 0.22,
        noisePeak: 0.31,
        downPeak: 8.2,
        upPeak: 7.9,
      },
    }),
  })

  const page = await loadPageDefinition('../zepp-app/page/tilt-calibration-logs/index.js')
  page.build()

  const backButton = findButton('BACK')
  assert.ok(backButton)
  assert.equal(backButton.props.y, 406)
  assert.equal(hasExactButtonText('PLAY'), false)
  assert.ok(getTexts().includes('DEBUG'))
  backButton.props.click_func()
  assert.deepEqual(__getRouterCalls(), [
    { type: 'replace', payload: { url: 'page/settings/index' } },
  ])
})

test('results screen keeps nav buttons separate from back/play on round screens', async () => {
  resetEnv()
  __setDeviceInfo({
    width: 480,
    height: 480,
    screenShape: SCREEN_SHAPE_ROUND,
  })
  __seedLocalStorage({
    scores_v1: JSON.stringify(
      Array.from({ length: 10 }, (_, index) => ({
        id: `run-${index}`,
        timestamp: 100 - index,
        score: 1000 - index,
        survivedMs: 1000 + index,
      }))
    ),
  })
  __seedSessionStorage({
    last_session_v1: JSON.stringify({
      score: 1234,
      survivedMs: 4321,
      timeScale: 2,
      spawnMultiplier: 1.3,
    }),
  })

  const page = await loadPageDefinition('../zepp-app/page/results/index.js')
  page.onInit(JSON.stringify({ pageIndex: 0 }))
  page.build()

  const nextButton = findButton('NEXT')
  const backButton = findButton('BACK')
  const playButton = findButton('PLAY')
  const pageLabel = findText('1 / 2')

  assert.ok(getTexts().includes('RUN OVER'))
  assert.ok(getTexts().includes('RECENT RUNS'))
  assert.ok(pageLabel)
  assert.equal(hasExactButtonText('PREVIOUS'), false)
  assert.equal(pageLabel.props.y, 344)
  assert.equal(nextButton.props.y, 360)
  assert.equal(backButton.props.y, 422)
  assert.equal(playButton.props.y, 422)

  nextButton.props.click_func()

  assert.deepEqual(__getRouterCalls(), [
    {
      type: 'replace',
      payload: {
        url: 'page/results/index',
        params: JSON.stringify({ pageIndex: 1 }),
      },
    },
  ])
})

test('results screen shows the highest scores first on the first page', async () => {
  resetEnv()
  __seedLocalStorage({
    scores_v1: JSON.stringify([
      { id: 'a', timestamp: 1, score: 1200, survivedMs: 10000 },
      { id: 'b', timestamp: 2, score: 3400, survivedMs: 8000 },
      { id: 'c', timestamp: 3, score: 2200, survivedMs: 12000 },
    ]),
  })

  const page = await loadPageDefinition('../zepp-app/page/results/index.js')
  page.onInit(JSON.stringify({ pageIndex: 0 }))
  page.build()

  const texts = getTexts()
  assert.ok(texts.includes('01  3400  8.00s'))
  assert.ok(texts.includes('02  2200  12.0s'))
  assert.ok(texts.includes('03  1200  10.0s'))
})

test('results round page-last layout matches the real scoreboard spacing', async () => {
  resetEnv()
  __setDeviceInfo({
    width: 480,
    height: 480,
    screenShape: SCREEN_SHAPE_ROUND,
  })
  __seedLocalStorage({
    scores_v1: JSON.stringify(
      Array.from({ length: 13 }, (_, index) => ({
        id: `run-${index}`,
        timestamp: 100 - index,
        score: 7000 - index * 123,
        survivedMs: 6000 + index * 210,
      }))
    ),
  })

  const page = await loadPageDefinition('../zepp-app/page/results/index.js')
  page.onInit(JSON.stringify({ pageIndex: 1 }))
  page.build()

  const prevButton = findButton('PREVIOUS')
  const backButton = findButton('BACK')
  const playButton = findButton('PLAY')
  const firstRow = findText('08  6139  7.47s')
  const pageLabel = findText('2 / 2')

  assert.ok(firstRow)
  assert.ok(pageLabel)
  assert.equal(firstRow.props.y, 96)
  assert.equal(pageLabel.props.y, 336)
  assert.equal(prevButton.props.y, 360)
  assert.equal(backButton.props.y, 422)
  assert.equal(playButton.props.y, 422)
  assert.equal(hasExactButtonText('NEXT'), false)
})

test('results round first page keeps the page label below the last visible score', async () => {
  resetEnv()
  __setDeviceInfo({
    width: 480,
    height: 480,
    screenShape: SCREEN_SHAPE_ROUND,
  })
  __seedLocalStorage({
    scores_v1: JSON.stringify(
      Array.from({ length: 13 }, (_, index) => ({
        id: `run-${index}`,
        timestamp: 100 - index,
        score: 7000 - index * 123,
        survivedMs: 6000 + index * 210,
      }))
    ),
  })

  const page = await loadPageDefinition('../zepp-app/page/results/index.js')
  page.onInit(JSON.stringify({ pageIndex: 0 }))
  page.build()

  const lastVisibleRow = findText('07  6262  7.26s')
  const pageLabel = findText('1 / 2')
  const nextButton = findButton('NEXT')

  assert.ok(lastVisibleRow)
  assert.ok(pageLabel)
  assert.equal(lastVisibleRow.props.y, 264)
  assert.equal(pageLabel.props.y, 336)
  assert.equal(nextButton.props.y, 360)
})

test('results square pagination keeps the page label above nav and footer rows', async () => {
  resetEnv()
  __setDeviceInfo({
    width: 390,
    height: 450,
    screenShape: 'square',
  })
  __seedLocalStorage({
    scores_v1: JSON.stringify(
      Array.from({ length: 13 }, (_, index) => ({
        id: `run-${index}`,
        timestamp: 100 - index,
        score: 7000 - index * 123,
        survivedMs: 6000 + index * 210,
      }))
    ),
  })

  const page = await loadPageDefinition('../zepp-app/page/results/index.js')
  page.onInit(JSON.stringify({ pageIndex: 0 }))
  page.build()

  const lastVisibleRow = findText('07  6262  7.26s')
  const pageLabel = findText('1 / 2')
  const nextButton = findButton('NEXT')
  const backButton = findButton('BACK')
  const playButton = findButton('PLAY')

  assert.ok(lastVisibleRow)
  assert.ok(pageLabel)
  assert.equal(lastVisibleRow.props.y, 248)
  assert.equal(pageLabel.props.y, 320)
  assert.equal(nextButton.props.y, 344)
  assert.equal(backButton.props.y, 396)
  assert.equal(playButton.props.y, 396)
})

test('results small round pagination keeps page label and actions above the lower cutout', async () => {
  resetEnv()
  __setDeviceInfo({
    width: 416,
    height: 416,
    screenShape: SCREEN_SHAPE_ROUND,
  })
  __seedLocalStorage({
    scores_v1: JSON.stringify(
      Array.from({ length: 13 }, (_, index) => ({
        id: `run-${index}`,
        timestamp: 100 - index,
        score: 7000 - index * 123,
        survivedMs: 6000 + index * 210,
      }))
    ),
  })

  const page = await loadPageDefinition('../zepp-app/page/results/index.js')
  page.onInit(JSON.stringify({ pageIndex: 1 }))
  page.build()

  const prevButton = findButton('PREVIOUS')
  const backButton = findButton('BACK')
  const playButton = findButton('PLAY')
  const pageLabel = findText('2 / 2')

  assert.ok(prevButton)
  assert.ok(pageLabel)
  assert.equal(pageLabel.props.y, 272)
  assert.equal(prevButton.props.y, 296)
  assert.equal(backButton.props.y, 352)
  assert.equal(playButton.props.y, 352)
})

test('results small round middle page keeps both prev and next above the footer on three pages', async () => {
  resetEnv()
  __setDeviceInfo({
    width: 416,
    height: 416,
    screenShape: SCREEN_SHAPE_ROUND,
  })
  __seedLocalStorage({
    scores_v1: JSON.stringify(
      Array.from({ length: 15 }, (_, index) => ({
        id: `run-${index}`,
        timestamp: 100 - index,
        score: 7000 - index * 123,
        survivedMs: 6000 + index * 210,
      }))
    ),
  })

  const page = await loadPageDefinition('../zepp-app/page/results/index.js')
  page.onInit(JSON.stringify({ pageIndex: 1 }))
  page.build()

  const prevButton = findButton('PREVIOUS')
  const nextButton = findButton('NEXT')
  const backButton = findButton('BACK')
  const playButton = findButton('PLAY')
  const pageLabel = findText('2 / 3')

  assert.ok(prevButton)
  assert.ok(nextButton)
  assert.ok(pageLabel)
  assert.equal(pageLabel.props.y, 274)
  assert.equal(prevButton.props.y, 296)
  assert.equal(nextButton.props.y, 296)
  assert.equal(backButton.props.y, 352)
  assert.equal(playButton.props.y, 352)
})

test('tilt calibration logs small round layout keeps debug rows above the footer', async () => {
  resetEnv()
  __setDeviceInfo({
    width: 416,
    height: 416,
    screenShape: SCREEN_SHAPE_ROUND,
  })
  __seedLocalStorage({
    tilt_calibration_report_v1: JSON.stringify({
      metrics: {
        offset: 0.22,
        noisePeak: 0.31,
        downPeak: 8.2,
        upPeak: 7.9,
      },
      profile: {
        negativeRange: 6.1,
        positiveRange: 6.4,
        deadzone: 0.74,
        responseExponent: 1.08,
      },
      debug: {
        center: { samples: 24, holdMs: 1440, resets: 1, settleRange: 0.31, avgStepDelta: 0.18, avgDeviation: 0.12 },
        down: { entryMs: 240, peakDelta: 8.2, holdMs: 720, resets: 0, settleRange: 0.36, avgStepDelta: 0.48, avgDeviation: 0.33 },
        up: { entryMs: 220, peakDelta: 7.9, holdMs: 720, resets: 1, settleRange: 0.41, avgStepDelta: 0.52, avgDeviation: 0.38 },
      },
    }),
  })

  const page = await loadPageDefinition('../zepp-app/page/tilt-calibration-logs/index.js')
  page.build()

  const backButton = findButton('BACK')
  const debugRow = getTexts().find((text) => text.startsWith('UP  ent='))
  const debugWidget = findText(debugRow)

  assert.ok(backButton)
  assert.ok(debugWidget)
  assert.equal(backButton.props.y, 356)
  assert.equal(debugWidget.props.y < backButton.props.y, true)
})

test('results screen renders Polish copy when the watch language is pl-PL', async () => {
  resetEnv()
  __setLanguage(9)
  __seedLocalStorage({
    scores_v1: JSON.stringify([]),
  })

  const page = await loadPageDefinition('../zepp-app/page/results/index.js')
  page.onInit(JSON.stringify({ pageIndex: 0 }))
  page.build()

  const texts = getTexts()
  assert.ok(texts.includes('WYNIKI'))
  assert.ok(texts.includes('BRAK WYNIK\u00d3W'))
  assert.ok(findButton('MENU'))
  assert.ok(findButton('GRAJ'))
})

test('game screen renders without debug text widgets in the canvas HUD', async () => {
  resetEnv()
  __seedLocalStorage({
    settings_v1: JSON.stringify({
      controlMode: 'tilt',
      wristSide: 'left',
      timeScale: 1,
      spawnMultiplier: 1,
      tiltSensitivity: 1,
    }),
  })

  const originalSetInterval = globalThis.setInterval
  const originalClearInterval = globalThis.clearInterval
  globalThis.setInterval = () => 1
  globalThis.clearInterval = () => {}

  try {
    const page = await loadPageDefinition('../zepp-app/page/game/index.js')
    page.onInit()
    page.build()

    const [canvas] = __getCanvasWidgets()
    const drawTextCalls = canvas.__getDrawCalls().filter((call) => call.method === 'drawText')

    assert.equal(drawTextCalls.length, 0)
    assert.equal(__getLastBrightTime(), 600000)
    page.onDestroy()
    assert.equal(__getResetCount(), 1)
  } finally {
    globalThis.setInterval = originalSetInterval
    globalThis.clearInterval = originalClearInterval
  }
})

test('game swipe input moves relatively and does not teleport on touch down', async () => {
  resetEnv()
  __seedLocalStorage({
    settings_v1: JSON.stringify({
      controlMode: 'swipe',
      wristSide: 'left',
      timeScale: 1,
      spawnMultiplier: 1,
      tiltSensitivity: 1,
    }),
  })

  const originalSetInterval = globalThis.setInterval
  const originalClearInterval = globalThis.clearInterval
  globalThis.setInterval = () => 1
  globalThis.clearInterval = () => {}

  try {
    const page = await loadPageDefinition('../zepp-app/page/game/index.js')
    page.onInit()
    page.build()

    const [canvas] = __getCanvasWidgets()
    const initialCenterY = page.shipCenterY

    canvas.__emit('CLICK_DOWN', { y: 80 })
    assert.equal(page.shipCenterY, initialCenterY)

    canvas.__emit('MOVE', { y: 140 })
    assert.equal(page.shipCenterY, initialCenterY)
    page.lastFrameAt = Date.now() - 16
    page.tick()
    assert.equal(page.shipCenterY, initialCenterY + 60)

    canvas.__emit('CLICK_UP')
    canvas.__emit('CLICK_DOWN', { y: 300 })
    assert.equal(page.shipCenterY, initialCenterY + 60)

    page.onDestroy()
  } finally {
    globalThis.setInterval = originalSetInterval
    globalThis.clearInterval = originalClearInterval
  }
})

test('game spawn catch-up is capped to avoid burst walls after a delayed frame', async () => {
  resetEnv()
  __seedLocalStorage({
    settings_v1: JSON.stringify({
      controlMode: 'tilt',
      wristSide: 'left',
      timeScale: 1,
      spawnMultiplier: 2,
      tiltSensitivity: 1,
    }),
  })

  const originalSetInterval = globalThis.setInterval
  const originalClearInterval = globalThis.clearInterval
  globalThis.setInterval = () => 1
  globalThis.clearInterval = () => {}

  try {
    const page = await loadPageDefinition('../zepp-app/page/game/index.js')
    page.onInit()
    page.build()

    const shipRect = {
      x: 120,
      y: 120,
      w: 30,
      h: 20,
      centerX: 135,
      centerY: 130,
    }

    page.lastSpawnAt = 0
    page.spawnAsteroids(10000, shipRect, 30)

    assert.ok(page.asteroids.length <= 2)

    page.onDestroy()
  } finally {
    globalThis.setInterval = originalSetInterval
    globalThis.clearInterval = originalClearInterval
  }
})
