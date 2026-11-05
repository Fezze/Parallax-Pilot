import test from 'node:test'
import assert from 'node:assert/strict'
import { __getCanvasWidgets, __resetUI } from './mocks/zos/ui.mjs'
import { LocalStorage, __resetStorage, __seedLocalStorage, __readLocalStorage } from './mocks/zos/storage.mjs'
import { __resetDeviceInfo } from './mocks/zos/device.mjs'
import { __resetRouter } from './mocks/zos/router.mjs'
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
  const original = { now: Date.now, set: globalThis.setInterval, clear: globalThis.clearInterval, log: console.log }
  let now = EPOCH
  const logs = []
  Date.now = () => now
  globalThis.setInterval = () => 1
  globalThis.clearInterval = () => {}
  console.log = line => logs.push(line)
  let page
  try {
    await import(`../zepp-app/page/game/index.js?runtime-integration=${++sequence}`)
    page = globalThis.__zeppPageDefinition
    page.onInit(); page.build()
    await run({ page, canvas: __getCanvasWidgets()[0], logs,
      at: ms => { now = EPOCH + ms }, advanceWall: ms => { now += ms }, settings })
  } finally {
    if (page) page.onDestroy()
    Date.now = original.now; globalThis.setInterval = original.set
    globalThis.clearInterval = original.clear; console.log = original.log
  }
}

function observer(overrides = {}) {
  return { enabled: true, pointer() {}, beginFrame() {}, markUpdate() {}, endFrame() {},
    beginStep() { return false }, markStepPhase() {}, endStep() {}, requestFinish() {}, ...overrides }
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
    const events = []
    const original = page.runtimeDiagnostics
    page.runtimeDiagnostics = observer({
      beginFrame() { events.push('frame') }, beginStep() { events.push('step'); return true },
      markStepPhase(index) { events.push(index) }, endStep() { events.push('step-end') },
      markUpdate() { events.push('update-end') }, endFrame() { events.push('frame-end') },
    })
    const draw = page.drawFrame
    page.drawFrame = function (...args) { events.push('draw'); return draw.apply(this, args) }
    at(20); page.tick()
    assert.deepEqual(events, ['frame', 'step', 0, 1, 2, 3, 4, 5, 'step-end',
      'step', 0, 1, 2, 3, 4, 5, 'step-end', 'update-end', 'draw', 'frame-end'])
    page.runtimeDiagnostics = original
  })
})

test('raw pointer counters include MOVE callbacks rejected by the game filters', async () => {
  await game(({ page, canvas }) => {
    const original = page.runtimeDiagnostics
    const kinds = []
    page.runtimeDiagnostics = observer({ pointer(kind) { kinds.push(kind) } })
    canvas.__emit('MOVE', { y: 100 })
    canvas.__emit('CLICK_DOWN', { y: 100 })
    canvas.__emit('MOVE', { y: 110 })
    canvas.__emit('MOVE', { y: 110 })
    canvas.__emit('CLICK_UP')
    assert.deepEqual(kinds, ['move', 'down', 'move', 'move', 'up'])
    assert.equal(page.simulationClock.elapsedMs, 0)
    page.runtimeDiagnostics = original
  })
})

test('natural finish and synchronous destruction defer reporting until the terminal callback ends', async () => {
  await game(({ page, logs, at }) => {
    const reports = () => logs.filter(line => line.startsWith('PP_DIAG '))
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

test('successive sessions alternate basic and sampled modes without changing saved game settings', async () => {
  for (const [previous, expected] of [[0, 0], [1, 13]]) {
    await game(({ page, settings }) => {
      assert.equal(page.diagnosticMetadata.phaseSampleEvery, expected)
      assert.equal(page.diagnosticMetadata.runIndex, previous + 1)
      assert.deepEqual(JSON.parse(__readLocalStorage('settings_v1')), settings)
    }, previous)
  }
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
