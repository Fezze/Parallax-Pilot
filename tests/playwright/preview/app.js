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
  globalThis.__previewSettingsDefinition = null
  globalThis.Page = (definition) => {
    globalThis.__previewPageDefinition = definition
    return definition
  }
  globalThis.AppSettingsPage = (definition) => {
    globalThis.__previewSettingsDefinition = definition
    return definition
  }
  globalThis.Section = (props = {}, children = []) => ({
    type: 'section',
    props,
    children: Array.isArray(children) ? children : [children],
  })
  globalThis.Text = (props = {}) => ({
    type: 'text',
    props,
    children: [],
  })
  globalThis.Button = (props = {}) => ({
    type: 'button',
    props,
    children: [],
  })

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

function createSettingsStorage(seed = {}) {
  const map = new Map(Object.entries(seed))

  return {
    getItem(key) {
      return map.get(key) ?? null
    },
    setItem(key, value) {
      map.set(key, value)
    },
    removeItem(key) {
      map.delete(key)
    },
  }
}

function applyStyle(element, style = {}) {
  Object.assign(element.style, style)
}

function renderSettingsNode(node, parent) {
  if (!node) {
    return
  }

  if (Array.isArray(node)) {
    node.forEach((child) => renderSettingsNode(child, parent))
    return
  }

  if (node.type === 'section') {
    const section = document.createElement('div')
    applyStyle(section, node.props?.style)
    parent.append(section)
    ;(node.children || []).forEach((child) => renderSettingsNode(child, section))
    return
  }

  if (node.type === 'text') {
    const text = document.createElement(node.props?.paragraph ? 'p' : 'div')
    text.textContent = node.props?.text || ''
    applyStyle(text, node.props?.style)
    parent.append(text)
    return
  }

  if (node.type === 'button') {
    const button = document.createElement('button')
    button.textContent = node.props?.label || ''
    applyStyle(button, node.props?.style)
    parent.append(button)
  }
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

  globalThis.__PREVIEW_LOCALE = scenario.locale
  configureRuntime(scenario)
  await import(`${scenario.pageModule}?preview=${scenarioId}`)

  const page = globalThis.__previewPageDefinition
  const settingsPage = globalThis.__previewSettingsDefinition
  let payload

  if (page) {
    if (typeof page.onInit === 'function') {
      page.onInit(scenario.initParams)
    }
    if (typeof page.build !== 'function') {
      throw new Error(`Missing build() for ${scenario.pageModule}`)
    }

    page.build()
    if (typeof scenario.afterBuild === 'function') {
      await scenario.afterBuild(page)
    }

    const snapshot = getRuntimeSnapshot()
    payload = {
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
  } else if (settingsPage) {
    watchEl.innerHTML = ''
    const settingsStorage = createSettingsStorage(scenario.settingsStorage || {})
    const renderTree = settingsPage.build({ settingsStorage })
    renderSettingsNode(renderTree, watchEl)

    const texts = [...watchEl.querySelectorAll('div,p,button')].map((element) => element.textContent || '')
    const buttons = [...watchEl.querySelectorAll('button')].map((element) => element.textContent || '')
    payload = {
      scenarioId,
      pageModule: scenario.pageModule,
      widgetCount: texts.length,
      textCount: texts.length,
      buttonCount: buttons.length,
      canvasCount: 0,
      texts,
      buttons,
      routerCalls: [],
    }
  } else {
    throw new Error(`No Zepp module registered for ${scenario.pageModule}`)
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
