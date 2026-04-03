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
}

async function loadPageDefinition(relativePath) {
  globalThis.__zeppPageDefinition = null
  await import(new URL(`${relativePath}?test=${Date.now()}-${Math.random()}`, import.meta.url))
  return globalThis.__zeppPageDefinition
}

function findButton(textPrefix) {
  return __getButtonWidgets().find((widget) => widget.props.text.startsWith(textPrefix))
}

function getTexts() {
  return __getTextWidgets().map((widget) => widget.props.text)
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
  const buttonTexts = __getButtonWidgets().map((widget) => widget.props.text)

  assert.ok(getTexts().includes('RUN OVER'))
  assert.ok(getTexts().includes('RECENT RUNS'))
  assert.equal(buttonTexts.includes('PREV'), false)
  assert.equal(nextButton.props.y, 364)
  assert.equal(backButton.props.y, 414)
  assert.equal(playButton.props.y, 414)

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
