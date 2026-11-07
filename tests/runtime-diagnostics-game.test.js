import test from 'node:test'
import assert from 'node:assert/strict'
import { __getCanvasWidgets, __resetUI } from './mocks/zos/ui.mjs'
import { LocalStorage, __resetStorage, __seedLocalStorage, __readLocalStorage, __readSessionStorage } from './mocks/zos/storage.mjs'
import { __resetDeviceInfo } from './mocks/zos/device.mjs'
import { __getRouterCalls, __resetRouter } from './mocks/zos/router.mjs'
import { __resetInteraction } from './mocks/zos/interaction.mjs'
import { __resetSensors } from './mocks/zos/sensor.mjs'
import { __resetDisplay } from './mocks/zos/display.mjs'

let sequence = 0
const EPOCH = 1700000000000
async function game(run, runIndex = 0) {
  __resetUI(); __resetStorage(); __resetDeviceInfo(); __resetRouter()
  __resetInteraction(); __resetSensors(); __resetDisplay()
  const settings = { controlMode: 'touch', wristSide: 'left', timeScale: 1, spawnMultiplier: 1, tiltSensitivity: 1 }
  __seedLocalStorage({ settings_v1: JSON.stringify(settings), runtime_diagnostic_run_v1: String(runIndex) })
  const original = { now: Date.now, set: globalThis.setInterval, clear: globalThis.clearInterval,
    timeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, log: console.log }
  let now = EPOCH
  let resultTask
  const logs = []
  Date.now = () => now
  globalThis.setInterval = () => 1
  globalThis.clearInterval = () => {}
  globalThis.setTimeout = callback => { resultTask = callback; return 2 }
  globalThis.clearTimeout = () => { resultTask = null }
  console.log = line => logs.push(line)
  let page
  try {
    await import(`../zepp-app/page/game/index.js?runtime-integration=${++sequence}`)
    page = globalThis.__zeppPageDefinition
    page.onInit(); page.build()
    await run({ page, canvas: __getCanvasWidgets()[0], logs, runResult: () => {
      const complete = resultTask
      resultTask = null
      complete?.()
    },
      at: ms => { now = EPOCH + ms }, advanceWall: ms => { now += ms }, settings })
  } finally {
    if (page) page.onDestroy()
    Date.now = original.now; globalThis.setInterval = original.set
    globalThis.clearInterval = original.clear; console.log = original.log
    globalThis.setTimeout = original.timeout
    globalThis.clearTimeout = original.clearTimeout
  }
}

function observer(overrides = {}) {
  return { enabled: true, pointer() {}, beginFrame() {}, markUpdate() {}, endFrame() {}, recordHaptic() {},
    beginStep() { return false }, markStepPhase() {}, endStep() {}, recordSkippedSteps() {}, requestFinish() {}, ...overrides }
}

function possibleContact(page) {
  page.asteroids.push({ id: 'diagnostic-contact', x: page.shipRect.centerX, y: page.shipRect.centerY,
    radius: 6, vx: 0, lastHitAt: -Infinity })
}

test('diagnostic overhead does not change the timestamp admitted by the actual game', async () => {
  await game(({ page, at, advanceWall }) => {
    const original = page.runtimeDiagnostics
    page.runtimeDiagnostics = observer({ beginFrame() { advanceWall(80) } })
    at(200); page.tick()
    assert.equal(page.simulationClock.elapsedMs, 200)
    assert.equal(page.simulationClock.pausedMs, 0)
    page.runtimeDiagnostics = original
  })
})

test('all actual world-step phases are connected in order and final frame timing follows drawing', async () => {
  await game(({ page, at }) => {
    possibleContact(page)
    const events = []
    const original = page.runtimeDiagnostics
    page.runtimeDiagnostics = observer({
      beginFrame() { events.push('frame') }, beginStep() { events.push('step'); return true },
      markStepPhase(index) { events.push(index) }, endStep() { events.push('step-end') },
      recordSkippedSteps(count) { events.push(`skip:${count}`) },
      markUpdate() { events.push('update-end') }, endFrame() { events.push('frame-end') },
    })
    const draw = page.drawFrame
    page.drawFrame = function (...args) { events.push('draw'); return draw.apply(this, args) }
    at(20); page.tick()
    assert.deepEqual(events, ['frame', 'step', 0, 1, 2, 3, 4, 5, 'step-end',
      'skip:1', 'update-end', 'draw', 'frame-end'])
    page.runtimeDiagnostics = original
  })
})

test('raw pointer counters include MOVE callbacks rejected by the game filters', async () => {
  await game(({ page, canvas, at }) => {
    const original = page.runtimeDiagnostics
    const kinds = []
    page.runtimeDiagnostics = observer({ pointer(kind, count) { kinds.push([kind, count]) } })
    canvas.__emit('MOVE', { y: 100 })
    canvas.__emit('CLICK_DOWN', { y: 100 })
    canvas.__emit('MOVE', { y: 110 })
    canvas.__emit('MOVE', { y: 110 })
    canvas.__emit('CLICK_UP')
    assert.deepEqual(kinds, [])
    assert.equal(page.simulationClock.elapsedMs, 0)
    at(20); page.tick()
    assert.deepEqual(kinds, [['down', 1], ['move', 3], ['up', 1]])
    page.runtimeDiagnostics = original
  })
})

test('natural finish and synchronous destruction defer reporting until the terminal callback ends', async () => {
  await game(({ page, logs, at }) => {
    possibleContact(page)
    const reports = () => logs.filter(line => line.startsWith('PP_DIAG ') || line.startsWith('PP_METRIC '))
    page.stepSimulation = function () {
      this.finishRun()
      this.onDestroy()
      assert.equal(reports().length, 0)
    }
    at(16); page.tick()
    assert.ok(reports().length > 0)
    const count = reports().length
    page.onDestroy(); page.tick()
    assert.equal(reports().length, count)
  })
})

test('fatal gameplay defers the single durable save until the timer returns or the page is destroyed', async () => {
  for (const destroyFirst of [false, true]) {
    await game(({ page, logs, at, runResult }) => {
      page.hp = 1
      possibleContact(page)
      at(16); page.tick()
      assert.equal(page.finished, true)
      assert.equal(page.loop, null)
      assert.equal(__readLocalStorage('scores_v1'), undefined)
      assert.equal(__getRouterCalls().length, 0)
      assert.ok(!logs.some(line => line.startsWith('PP_METRIC ')))

      if (destroyFirst) page.onDestroy()
      at(90); runResult(); runResult()
      const [entry] = JSON.parse(__readLocalStorage('scores_v1'))
      assert.equal(entry.timestamp, EPOCH + 16)
      assert.equal(entry.survivedMs, 10)
      assert.equal(__readSessionStorage('last_session_v1'), undefined)
      assert.equal(__getRouterCalls().length, destroyFirst ? 0 : 1)
      if (!destroyFirst) assert.deepEqual(JSON.parse(__getRouterCalls()[0].payload.params).session, entry)
      page.onDestroy()
      assert.equal(JSON.parse(__readLocalStorage('scores_v1')).length, 1)
      assert.ok(logs.some(line => line.startsWith('PP_METRIC ')))
    })
  }
})

test('the stall build uses the same observation mode on successive sessions', async () => {
  for (const previous of [0, 1]) {
    await game(({ page, settings }) => {
      assert.equal(page.diagnosticMetadata.phaseSampleEvery, 0)
      assert.equal(page.diagnosticMetadata.runIndex, previous + 1)
      assert.deepEqual(JSON.parse(__readLocalStorage('settings_v1')), settings)
    }, previous)
  }
})

test('the stall probe measures collision window work outside executed physics steps', async () => {
  await game(({ page, at, advanceWall }) => {
    possibleContact(page)
    const getPointerVelocity = page.getPointerVelocity
    page.getPointerVelocity = function () {
      advanceWall(25)
      return getPointerVelocity.call(this)
    }
    at(20); page.tick()
    const probe = page.diagnosticMetadata.stallFrame
    assert.equal(probe.windowsMs, 25)
    assert.equal(probe.stepsMs, 0)
    assert.equal(probe.blocks, 1)
    assert.equal(probe.eventSteps, 1)
    assert.equal(probe.contactChecks, 1)
    assert.equal(page.simulationClock.elapsedMs, 20)
  })
})

test('diagnostic counter and score writes share the same cached LocalStorage instance', async () => {
  const setItem = LocalStorage.prototype.setItem
  let counterStore, scoreStore
  LocalStorage.prototype.setItem = function (key, value) {
    if (key === 'runtime_diagnostic_run_v1') counterStore = this
    if (key === 'scores_v1') scoreStore = this
    return setItem.call(this, key, value)
  }
  try {
    await game(({ page }) => {
      page.finishRun()
      assert.ok(counterStore)
      assert.equal(counterStore, scoreStore)
      assert.equal(__readLocalStorage('runtime_diagnostic_run_v1'), '1')
    })
  } finally {
    LocalStorage.prototype.setItem = setItem
  }
})
