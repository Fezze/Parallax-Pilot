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
      spawnMultiplier: 1.6,
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
  assert.ok(texts.includes('TIME 2x  SPAWN 1.6x'))
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
      spawnMultiplier: 1.6,
      tiltSensitivity: 1,
    }),
    scores_v1: JSON.stringify([{ id: 'run-1', timestamp: 1 }]),
  })

  const page = await loadPageDefinition('../zepp-app/page/home/index.js')
  page.build()

  const texts = getTexts()
  assert.ok(texts.includes('OMIJAJ ASTEROIDY'))
  assert.ok(texts.includes('CZAS 2x  ILO\u015a\u0106 1.6x'))
  assert.ok(texts.includes('WYNIKI: 1'))
  assert.ok(findButton('START'))
  assert.ok(findButton('USTAWIENIA'))
  assert.ok(findButton('WYNIKI'))
})

test('home square layout keeps metadata below the action stack', async () => {
  resetEnv()
  __setDeviceInfo({
    width: 390,
    height: 390,
    screenShape: 'square',
  })
  __seedLocalStorage({
    settings_v1: JSON.stringify({
      controlMode: 'touch',
      wristSide: 'left',
      timeScale: 3,
      spawnMultiplier: 2,
      tiltSensitivity: 1,
    }),
    scores_v1: JSON.stringify(Array.from({ length: 12 }, (_, index) => ({ id: `${index}` }))),
  })

  const page = await loadPageDefinition('../zepp-app/page/home/index.js')
  page.build()

  const scoreButton = findButton('SCOREBOARD')
  const timeLabel = findText('TIME 3x  SPAWN 2x')

  assert.ok(scoreButton)
  assert.ok(timeLabel)
  assert.equal(scoreButton.props.y, 232)
  assert.equal(timeLabel.props.y, 318)
})

test('settings screen disables tilt row when control mode is not tilt', async () => {
  resetEnv()
  __seedLocalStorage({
    settings_v1: JSON.stringify({
      controlMode: 'swipe',
      wristSide: 'left',
      timeScale: 1,
      spawnMultiplier: 1,
      tiltSensitivity: 1.4,
    }),
  })

  const page = await loadPageDefinition('../zepp-app/page/settings/index.js')
  page.build()

  const tiltButton = findButton('TILT')
  assert.equal(tiltButton.props.normal_color, 0x303030)
  assert.equal(tiltButton.props.press_color, 0x303030)
  assert.equal(tiltButton.props.color, 0x9f9f9f)

  tiltButton.props.click_func()

  assert.deepEqual(__getRouterCalls(), [])
  assert.equal(
    JSON.parse(__readLocalStorage('settings_v1')).tiltSensitivity,
    1.4
  )
})

test('settings screen cycles tilt sensitivity when tilt mode is active', async () => {
  resetEnv()
  __seedLocalStorage({
    settings_v1: JSON.stringify({
      controlMode: 'tilt',
      wristSide: 'left',
      timeScale: 1,
      spawnMultiplier: 1,
      tiltSensitivity: 1.4,
    }),
  })

  const page = await loadPageDefinition('../zepp-app/page/settings/index.js')
  page.build()

  const tiltButton = findButton('TILT')
  tiltButton.props.click_func()

  assert.equal(
    JSON.parse(__readLocalStorage('settings_v1')).tiltSensitivity,
    1.8
  )
  assert.deepEqual(__getRouterCalls(), [
    { type: 'replace', payload: { url: 'page/settings/index' } },
  ])
})

test('settings square layout leaves clear space above footer actions', async () => {
  resetEnv()
  __setDeviceInfo({
    width: 390,
    height: 390,
    screenShape: 'square',
  })
  __seedLocalStorage({
    settings_v1: JSON.stringify({
      controlMode: 'touch',
      wristSide: 'left',
      timeScale: 1,
      spawnMultiplier: 1.3,
      tiltSensitivity: 1.4,
    }),
  })

  const page = await loadPageDefinition('../zepp-app/page/settings/index.js')
  page.build()

  const tiltButton = findButton('TILT')
  const backButton = findButton('BACK')
  const playButton = findButton('PLAY')

  assert.ok(tiltButton)
  assert.equal(tiltButton.props.y, 250)
  assert.equal(backButton.props.y, 338)
  assert.equal(playButton.props.y, 338)
})

test('settings screen renders Polish labels and values when the watch language is pl-PL', async () => {
  resetEnv()
  __setLanguage(9)
  __seedLocalStorage({
    settings_v1: JSON.stringify({
      controlMode: 'crown',
      wristSide: 'right',
      timeScale: 3,
      spawnMultiplier: 1.3,
      tiltSensitivity: 1.4,
    }),
  })

  const page = await loadPageDefinition('../zepp-app/page/settings/index.js')
  page.build()

  const texts = getTexts()
  assert.ok(texts.includes('USTAWIENIA'))
  assert.ok(texts.includes('DOTKNIJ, BY ZMIENI\u0106'))
  assert.ok(findButton('STEROWANIE  OBR\u00d3T'))
  assert.ok(findButton('R\u0118KA  PRAWA'))
  assert.ok(findButton('CZAS  3x'))
  assert.ok(findButton('ILO\u015a\u0106  1.3x'))
  assert.ok(findButton('MENU'))
  assert.ok(findButton('GRAJ'))
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
  backButton.props.click_func()

  assert.deepEqual(__getRouterCalls(), [
    {
      type: 'replace',
      payload: {
        url: 'page/results/index',
        params: JSON.stringify({ pageIndex: 1 }),
      },
    },
    {
      type: 'push',
      payload: { url: 'page/home/index' },
    },
  ])
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
    height: 390,
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
  assert.equal(lastVisibleRow.props.y, 230)
  assert.equal(pageLabel.props.y, 264)
  assert.equal(nextButton.props.y, 284)
  assert.equal(backButton.props.y, 336)
  assert.equal(playButton.props.y, 336)
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
    page.onDestroy()
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
