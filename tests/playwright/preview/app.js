import { previewScenarios } from './scenarios.js'
import {
  configureRuntime,
  getRuntimeSnapshot,
  resetRuntime,
  setRootElement,
} from './mocks/zos/state.js'

const statusEl = document.querySelector('#status')
const metaEl = document.querySelector('#meta')
const watchEl = document.querySelector('#watch')

function installGlobals() {
  globalThis.__previewPageDefinition = null
  globalThis.Page = (definition) => {
    globalThis.__previewPageDefinition = definition
    return definition
  }

  let nextTimerId = 1
  const timers = new Map()
  globalThis.setInterval = (callback) => {
    const id = nextTimerId
    nextTimerId += 1
    timers.set(id, callback)
    return id
  }
  globalThis.clearInterval = (id) => {
    timers.delete(id)
  }

  globalThis.hmApp = {
    registerSpinEvent(callback) {
      globalThis.__legacySpinCallback = callback
    },
    unregisterSpinEvent() {
      globalThis.__legacySpinCallback = null
    },
    registerKeyEvent(callback) {
      globalThis.__legacyKeyCallback = callback
    },
    unregisterKeyEvent() {
      globalThis.__legacyKeyCallback = null
    },
  }
}

function getScenarioId() {
  const params = new URLSearchParams(window.location.search)
  return params.get('scenario') || 'home-round'
}

async function mountScenario() {
  installGlobals()
  setRootElement(watchEl)
  resetRuntime()

  const scenarioId = getScenarioId()
  const scenario = previewScenarios[scenarioId]
  if (!scenario) {
    throw new Error(`Unknown scenario: ${scenarioId}`)
  }

  configureRuntime(scenario)
  await import(`${scenario.pageModule}?preview=${scenarioId}`)

  const page = globalThis.__previewPageDefinition
  if (!page) {
    throw new Error(`Page() was not registered for ${scenario.pageModule}`)
  }

  if (typeof page.onInit === 'function') {
    page.onInit(scenario.initParams)
  }
  if (typeof page.build !== 'function') {
    throw new Error(`Missing build() for ${scenario.pageModule}`)
  }

  page.build()

  const snapshot = getRuntimeSnapshot()
  const payload = {
    scenarioId,
    pageModule: scenario.pageModule,
    widgetCount: snapshot.widgets.length,
    textCount: snapshot.texts.length,
    buttonCount: snapshot.buttons.length,
    canvasCount: snapshot.canvasCount,
    texts: snapshot.texts,
    buttons: snapshot.buttons,
    routerCalls: snapshot.routerCalls,
  }

  window.__PREVIEW__ = payload
  document.title = `Preview: ${scenarioId}`
  statusEl.textContent = 'ready'
  metaEl.textContent = JSON.stringify(payload, null, 2)
}

mountScenario().catch((error) => {
  console.error(error)
  statusEl.textContent = 'error'
  metaEl.textContent = String(error?.stack || error)
})
