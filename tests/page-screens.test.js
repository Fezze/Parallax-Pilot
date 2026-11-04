import { tiltProfile } from './tilt-fixtures.js'
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
  assert.ok(texts.includes('DRAG UP / DOWN TO MOVE'))
  assert.ok(texts.includes('TIME 2x  SPAWN 1.25x'))
  assert.ok(texts.includes('1 RUNS SAVED'))
  assert.equal(texts.some((text) => text.includes('CROWN AVAILABLE')), false)
  assert.equal(texts.some((text) => text.startsWith('SHIP ')), false)
  assert.equal(texts.some((text) => text.startsWith('CONTROL ')), false)

  findButton('START RUN').props.click_func()
  findButton('SCOREBOARD').props.click_func()

  assert.deepEqual(__getRouterCalls(), [
    { type: 'push', payload: { url: 'page/game/index' } },
    { type: 'push', payload: { url: 'page/results/index', params: JSON.stringify({ mode: 'scoreboard' }) } },
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
  assert.ok(texts.includes('PRZESUWAJ W GÓRĘ / DÓŁ'))
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
    tilt_calibration_v1: JSON.stringify(tiltProfile()),
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
      Array.from({ length: 15 }, (_, index) => ({
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
  page.onInit(JSON.stringify({ pageIndex: 0, mode: 'summary' }))
  page.build()

  const nextButton = findButton('NEXT')
  const backButton = findButton('BACK')
  const playButton = findButton('PLAY')
  const pageLabel = findText('1 / 3')

  assert.ok(getTexts().includes('RUN OVER'))
  assert.ok(getTexts().includes('RECENT RUNS'))
  assert.ok(pageLabel)
  assert.equal(hasExactButtonText('PREVIOUS'), false)
  assert.equal(pageLabel.props.y, 328)
  assert.equal(nextButton.props.y, 360)
  assert.equal(backButton.props.y, 422)
  assert.equal(playButton.props.y, 422)
  assert.equal(nextButton.props.x, 87)
  assert.equal(nextButton.props.w, 306)
  assert.equal(backButton.props.x, 87)
  assert.equal(backButton.props.w, 153)
  assert.equal(playButton.props.x, 240)
  assert.equal(playButton.props.w, 153)

  nextButton.props.click_func()

  assert.deepEqual(__getRouterCalls(), [
    {
      type: 'replace',
      payload: {
        url: 'page/results/index',
        params: JSON.stringify({ pageIndex: 1, mode: 'summary', session: {
          score: 1234, survivedMs: 4321, timeScale: 2, spawnMultiplier: 1.3,
        } }),
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
  assert.equal(pageLabel.props.y, 328)
  assert.equal(prevButton.props.y, 360)
  assert.equal(backButton.props.y, 422)
  assert.equal(playButton.props.y, 422)
  assert.equal(prevButton.props.x, 87)
  assert.equal(prevButton.props.w, 306)
  assert.equal(backButton.props.x, 87)
  assert.equal(backButton.props.w, 153)
  assert.equal(playButton.props.x, 240)
  assert.equal(playButton.props.w, 153)
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
  assert.equal(pageLabel.props.y, 328)
  assert.equal(nextButton.props.y, 360)
  assert.equal(nextButton.props.x, 87)
  assert.equal(nextButton.props.w, 306)
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
  assert.equal(pageLabel.props.y, 312)
  assert.equal(nextButton.props.y, 336)
  assert.equal(backButton.props.y, 388)
  assert.equal(playButton.props.y, 388)
  assert.equal(nextButton.props.x, 62)
  assert.equal(nextButton.props.w, 266)
  assert.equal(backButton.props.x, 62)
  assert.equal(backButton.props.w, 128)
  assert.equal(playButton.props.x, 200)
  assert.equal(playButton.props.w, 128)
  assert.equal(backButton.props.y + backButton.props.h <= 438, true)
  assert.equal(playButton.props.y + playButton.props.h <= 438, true)
})

test('results square middle pagination matches footer button widths', async () => {
  resetEnv()
  __setDeviceInfo({
    width: 390,
    height: 450,
    screenShape: 'square',
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

  assert.ok(pageLabel)
  assert.equal(pageLabel.props.y, 312)
  assert.equal(prevButton.props.y, 336)
  assert.equal(nextButton.props.y, 336)
  assert.equal(backButton.props.y, 388)
  assert.equal(playButton.props.y, 388)
  assert.equal(prevButton.props.x, 62)
  assert.equal(prevButton.props.w, 128)
  assert.equal(nextButton.props.x, 200)
  assert.equal(nextButton.props.w, 128)
  assert.equal(backButton.props.x, 62)
  assert.equal(backButton.props.w, 128)
  assert.equal(playButton.props.x, 200)
  assert.equal(playButton.props.w, 128)
})

test('results round middle pagination matches footer button sizes', async () => {
  resetEnv()
  __setDeviceInfo({
    width: 466,
    height: 466,
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

  assert.ok(pageLabel)
  assert.equal(pageLabel.props.y, 314)
  assert.equal(prevButton.props.y, 338)
  assert.equal(nextButton.props.y, 338)
  assert.equal(backButton.props.y, 408)
  assert.equal(playButton.props.y, 408)
  assert.equal(prevButton.props.x, 84)
  assert.equal(prevButton.props.w, 149)
  assert.equal(prevButton.props.h, 58)
  assert.equal(nextButton.props.x, 233)
  assert.equal(nextButton.props.w, 149)
  assert.equal(nextButton.props.h, 58)
  assert.equal(backButton.props.x, 84)
  assert.equal(backButton.props.w, 149)
  assert.equal(backButton.props.h, 58)
  assert.equal(playButton.props.x, 233)
  assert.equal(playButton.props.w, 149)
  assert.equal(playButton.props.h, 58)
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
  const nextButton = findButton('NEXT')
  const backButton = findButton('BACK')
  const playButton = findButton('PLAY')
  const pageLabel = findText('2 / 3')

  assert.ok(prevButton)
  assert.ok(nextButton)
  assert.ok(pageLabel)
  assert.equal(pageLabel.props.y, 266)
  assert.equal(prevButton.props.y, 290)
  assert.equal(backButton.props.y, 352)
  assert.equal(playButton.props.y, 352)
  assert.equal(prevButton.props.x, 75)
  assert.equal(prevButton.props.w, 133)
  assert.equal(backButton.props.x, 75)
  assert.equal(backButton.props.w, 133)
  assert.equal(playButton.props.x, 208)
  assert.equal(playButton.props.w, 133)
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
  assert.equal(pageLabel.props.y, 266)
  assert.equal(prevButton.props.y, 290)
  assert.equal(nextButton.props.y, 290)
  assert.equal(backButton.props.y, 352)
  assert.equal(playButton.props.y, 352)
  assert.equal(prevButton.props.x, 75)
  assert.equal(prevButton.props.w, 133)
  assert.equal(prevButton.props.h, 52)
  assert.equal(nextButton.props.x, 208)
  assert.equal(nextButton.props.w, 133)
  assert.equal(nextButton.props.h, 52)
  assert.equal(backButton.props.x, 75)
  assert.equal(backButton.props.w, 133)
  assert.equal(backButton.props.h, 52)
  assert.equal(playButton.props.x, 208)
  assert.equal(playButton.props.w, 133)
  assert.equal(playButton.props.h, 52)
})

test('results session pagination keeps every saved row, page indicator, and action readable on supported screens', async () => {
  const devices = [
    { width: 480, height: 480, screenShape: SCREEN_SHAPE_ROUND },
    { width: 466, height: 466, screenShape: SCREEN_SHAPE_ROUND },
    { width: 454, height: 454, screenShape: SCREEN_SHAPE_ROUND },
    { width: 416, height: 416, screenShape: SCREEN_SHAPE_ROUND },
    { width: 390, height: 450, screenShape: 'square' },
  ]

  for (const language of [2, 9]) {
    for (const device of devices) {
      const visibleRows = []
      const pageLabels = []
      let totalPages = 0

      for (let pageIndex = 0; pageIndex < 10; pageIndex += 1) {
        resetEnv()
        __setLanguage(language)
        __setDeviceInfo(device)
        __seedLocalStorage({
          scores_v1: JSON.stringify(Array.from({ length: 15 }, (_, index) => ({
            id: `run-${index}`,
            timestamp: 100 - index,
            score: 7000 - index * 123,
            survivedMs: 6000 + index * 210,
          }))),
        })
        __seedSessionStorage({
          last_session_v1: JSON.stringify({
            score: 12345,
            survivedMs: 4321,
            timeScale: 2,
            spawnMultiplier: 1.3,
          }),
        })

        const page = await loadPageDefinition('../zepp-app/page/results/index.js')
        page.onInit(JSON.stringify({ pageIndex, mode: 'summary' }))
        page.build()

        const rows = __getTextWidgets().filter((widget) => /^\d{2}  /.test(widget.props.text))
        const pageLabel = __getTextWidgets().find((widget) => /^\d+ \/ \d+$/.test(widget.props.text))
        assert.ok(rows.length > 0, `rows missing on ${device.width} ${language} page ${pageIndex}`)
        assert.ok(pageLabel, `page indicator missing on ${device.width} ${language} page ${pageIndex}`)
        const currentPageCount = Number(pageLabel.props.text.split(' / ')[1])
        totalPages = currentPageCount
        pageLabels.push(pageLabel)
        rows.forEach((row) => {
          visibleRows.push(row.props.text)
          assert.ok(row.props.y + row.props.h <= pageLabel.props.y - 18,
            `row overlaps page indicator on ${device.width} ${language}`)
        })

        const previous = findButton(language === 9 ? 'POPRZEDNIA' : 'PREVIOUS')
        const next = findButton(language === 9 ? 'NASTĘPNA' : 'NEXT')
        const back = findButton(language === 9 ? 'MENU' : 'BACK')
        const play = findButton(language === 9 ? 'GRAJ' : 'PLAY')
        assert.ok(back)
        assert.ok(play)
        assert.ok(pageLabel.props.y + pageLabel.props.h <= Math.min(
          ...[previous, next].filter(Boolean).map((button) => button.props.y)
        ))
        assert.ok([previous, next].filter(Boolean).every((button) =>
          button.props.y + button.props.h <= back.props.y))

        if (pageIndex === currentPageCount - 1) {
          break
        }
        assert.ok(next, `next action missing on ${device.width} ${language} page ${pageIndex}`)
      }

      assert.equal(totalPages > 1, true)
      assert.equal(new Set(pageLabels.map((label) => label.props.text)).size, totalPages)
      assert.equal(visibleRows.length, 15)
      assert.deepEqual(visibleRows.map((row) => Number(row.slice(0, 2))).sort((a, b) => a - b),
        Array.from({ length: 15 }, (_, index) => index + 1))
    }
  }
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
    tilt_calibration_v1: JSON.stringify(tiltProfile()),
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

test('game square HUD uses rounded corner arc segments', async () => {
  resetEnv()
  __setDeviceInfo({
    width: 390,
    height: 450,
    screenShape: 'square',
    keyType: 'normal_21',
    keyNumber: 2,
  })
  __seedLocalStorage({
    tilt_calibration_v1: JSON.stringify(tiltProfile()),
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
    const drawCalls = canvas.__getDrawCalls()
    const hudArcCalls = drawCalls.filter((call) => call.method === 'strokeArc')
    const fullWidthHudRects = drawCalls.filter((call) =>
      call.method === 'drawRect' &&
      call.args.y1 === 0 &&
      call.args.y2 === 8 &&
      call.args.x1 === 0 &&
      call.args.x2 === 390
    )

    assert.ok(hudArcCalls.length >= 8)
    assert.equal(fullWidthHudRects.length, 0)

    page.onDestroy()
  } finally {
    globalThis.setInterval = originalSetInterval
    globalThis.clearInterval = originalClearInterval
  }
})

test('game swipe input moves relatively and does not teleport on touch down', async () => {
  resetEnv()
  __seedLocalStorage({
    tilt_calibration_v1: JSON.stringify(tiltProfile()),
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
    page.simulationClock.lastFrameAt = Date.now() - 16
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
    tilt_calibration_v1: JSON.stringify(tiltProfile()),
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

test('run, menu, scoreboard, pagination, replay and native Back keep one home root', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  resetEnv()
  __seedLocalStorage({
    settings_v1: JSON.stringify({ controlMode: 'touch', wristSide: 'left', timeScale: 1, spawnMultiplier: 1, tiltSensitivity: 1 }),
    scores_v1: JSON.stringify(Array.from({ length: 15 }, (_, index) => ({
      id: `older-${index}`, timestamp: index, score: index * 100, survivedMs: index * 100,
    }))),
  })
  const definitions = {
    'page/home/index': await loadPageDefinition('../zepp-app/page/home/index.js'),
    'page/game/index': await loadPageDefinition('../zepp-app/page/game/index.js'),
    'page/results/index': await loadPageDefinition('../zepp-app/page/results/index.js'),
  }
  const stack = [{ url: 'page/home/index' }]
  let active
  function render() {
    __resetUI()
    const route = stack.at(-1)
    active = { ...definitions[route.url] }
    active.onInit?.(route.params)
    // Game completion is exercised through the actual onInit/finishRun path;
    // existing game simulation tests cover timer-driven death and teardown.
    if (route.url !== 'page/game/index') active.build()
  }
  function follow() {
    const calls = __getRouterCalls()
    assert.equal(calls.length, 1)
    const { type, payload } = calls[0]
    __resetRouter()
    if (type === 'push') stack.push(payload)
    else if (type === 'replace') stack[stack.length - 1] = payload
    else if (type === 'back') stack.pop()
    else assert.fail(`Unexpected router operation: ${type}`)
    assert.ok(stack.length >= 1 && stack.length <= 2)
    assert.equal(stack[0].url, 'page/home/index')
    render()
  }
  function click(label) {
    const button = findButton(label)
    assert.ok(button, `Missing ${label}`)
    button.props.click_func()
    context.mock.timers.tick(100)
    follow()
  }
  function finish() {
    active.simulationClock.elapsedMs = 4567
    active.finishRun(1700000000000)
    // Duplicate completion must not trigger a second route or save.
    active.finishRun(1700000000001)
    follow()
    assert.ok(getTexts().includes('RUN OVER'))
    assert.ok(getTexts().includes('4567'))
    assert.equal(stack.length, 2)
  }
  render()
  for (let loop = 0; loop < 12; loop += 1) {
    click('START RUN')
    finish()
    click('NEXT')
    assert.ok(getTexts().includes('RUN OVER'))
    click('PREVIOUS')
    assert.ok(getTexts().includes('RUN OVER'))
    click('BACK')
    assert.equal(stack.length, 1)
    click('SCOREBOARD')
    assert.ok(getTexts().includes('SCOREBOARD'))
    assert.equal(getTexts().includes('RUN OVER'), false)
    assert.equal(getTexts().includes('RECENT RUNS'), false)
    click('NEXT')
    assert.ok(getTexts().includes('SCOREBOARD'))
    click('PLAY')
    finish()
    click('PLAY')
    finish()
    // Model the documented native Back operation independently of the menu button.
    stack.pop()
    render()
    assert.equal(stack.length, 1)
    assert.ok(getTexts().includes('PARALLAX PILOT'))
  }
  assert.equal(JSON.parse(__readLocalStorage('scores_v1')).length > 0, true)
})

test('results defaults to scoreboard regardless of retained session and safely handles a missing summary', async () => {
  const definition = await loadPageDefinition('../zepp-app/page/results/index.js')
  for (const params of [undefined, 'null', 'invalid-json', '{}', '{"mode":"old"}', '{"mode":"scoreboard"}']) {
    resetEnv()
    __seedSessionStorage({ last_session_v1: JSON.stringify({ score: 999, survivedMs: 999, timeScale: 1, spawnMultiplier: 1 }) })
    const page = { ...definition }
    page.onInit(params)
    page.build()
    assert.ok(getTexts().includes('SCOREBOARD'))
    assert.equal(getTexts().includes('RUN OVER'), false)
  }
  resetEnv()
  const page = { ...definition }
  page.onInit('{"mode":"summary"}')
  page.build()
  assert.ok(getTexts().includes('SCOREBOARD'))
  assert.ok(getTexts().includes('NO RUNS SAVED YET'))
})


test('summary route carries the completed run across isolated page session stores and pagination', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  resetEnv()
  __seedLocalStorage({ scores_v1: JSON.stringify(Array.from({ length: 15 }, (_, index) => ({
    id: `run-${index}`, timestamp: index, score: index * 100, survivedMs: index * 100,
  }))) })
  const session = { score: 8765, survivedMs: 8765, timeScale: 1, spawnMultiplier: 1 }
  const definition = await loadPageDefinition('../zepp-app/page/results/index.js')
  let params = JSON.stringify({ mode: 'summary', session })
  for (let index = 0; index < 2; index += 1) {
    __resetUI()
    const page = { ...definition }
    page.onInit(params)
    page.build()
    assert.ok(getTexts().includes('RUN OVER'))
    assert.ok(getTexts().includes('8765'))
    findButton('NEXT').props.click_func()
    context.mock.timers.tick(100)
    const route = __getRouterCalls().at(-1)
    assert.equal(route.type, 'replace')
    const requested = JSON.parse(route.payload.params)
    assert.equal(requested.mode, 'summary')
    assert.deepEqual(requested.session, session)
    params = route.payload.params
  }
})
