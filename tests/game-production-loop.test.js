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

async function game(context, run) {
  __resetUI(); __resetStorage(); __resetDeviceInfo(); __resetRouter()
  __resetInteraction(); __resetSensors(); __resetDisplay()
  const settings = { controlMode: 'touch', wristSide: 'left', timeScale: 1, spawnMultiplier: 1, tiltSensitivity: 1 }
  __seedLocalStorage({ settings_v1: JSON.stringify(settings), runtime_diagnostic_run_v1: '71' })
  const reads = []
  const writes = []
  const logs = []
  const { getItem, setItem } = LocalStorage.prototype
  const mocks = context.mock
  const now = mocks.method(Date, 'now', () => EPOCH + wall)
  mocks.method(LocalStorage.prototype, 'getItem', function (key, fallback) {
    reads.push(key)
    return getItem.call(this, key, fallback)
  })
  mocks.method(LocalStorage.prototype, 'setItem', function (key, value) {
    writes.push(key)
    return setItem.call(this, key, value)
  })
  mocks.method(console, 'log', (...args) => logs.push(args))
  mocks.method(globalThis, 'setInterval', (callback, delay) => {
    intervals.push(delay)
    frame = callback
    return 1
  })
  mocks.method(globalThis, 'clearInterval', () => {})
  mocks.method(globalThis, 'setTimeout', (callback, delay) => {
    timeouts.push(delay)
    terminal = callback
    return 2
  })
  mocks.method(globalThis, 'clearTimeout', () => {})
  const intervals = []
  const timeouts = []
  let wall = 0
  let frame
  let terminal
  await import(`../zepp-app/page/game/index.js?production-loop=${++sequence}`)
  const page = globalThis.__zeppPageDefinition
  try {
    page.onInit()
    page.build()
    await run({ page, canvas: __getCanvasWidgets()[0], now, reads, writes, logs, intervals, timeouts,
      tick: ms => { wall = ms; frame() }, complete: () => terminal?.() })
  } finally {
    page.onDestroy()
    mocks.restoreAll()
  }
}

test('shipping gameplay uses one timer and one admission clock read per frame through 30 seconds', async context => {
  await game(context, ({ page, now, reads, writes, logs, intervals, timeouts, tick, canvas }) => {
    assert.deepEqual(intervals, [16])
    assert.equal(now.mock.callCount(), 1, 'startup creates only the game clock')
    assert.deepEqual(reads, ['settings_v1'])
    assert.deepEqual(writes, [])
    assert.ok(!Object.hasOwn(page, 'runtimeDiagnostics'))
    assert.ok(!Object.hasOwn(page, 'diagnosticMetadata'))
    const called = () => { throw new Error('production callback invoked the archived observer') }
    page.runtimeDiagnostics = new Proxy({}, { get: called })
    page.diagnosticMetadata = new Proxy({}, { get: called, set: called })
    page.hp = page.displayedHp = 1000000
    canvas.__emit('CLICK_DOWN', { y: 100 })
    canvas.__emit('MOVE', { y: 110 })
    canvas.__emit('CLICK_UP')
    for (let ms = 100; ms <= 31000; ms += 100) {
      const calls = now.mock.callCount()
      tick(ms)
      assert.equal(now.mock.callCount() - calls, 1, `clock reads at ${ms} ms`)
    }
    assert.equal(page.simulationClock.elapsedMs, 31000)
    assert.ok(page.asteroidSeed > 0)
    assert.deepEqual(intervals, [16])
    assert.deepEqual(timeouts, [])
    assert.deepEqual(logs, [])
    assert.deepEqual(reads, ['settings_v1'])
    assert.deepEqual(writes, [])
    assert.equal(__readLocalStorage('runtime_diagnostic_run_v1'), '71')
  })
})

for (const destroyFirst of [false, true]) {
  test(`fatal gameplay persists one result with destroy-before-completion=${destroyFirst}`, async context => {
    await game(context, ({ page, tick, complete, logs, writes, timeouts }) => {
      page.hp = 1
      page.asteroids.push({ id: 'contact', x: page.shipRect.centerX, y: page.shipRect.centerY,
        radius: 7, vx: 0, lastHitAt: -Infinity })
      tick(16)
      assert.equal(page.finished, true)
      assert.equal(page.loop, null)
      assert.deepEqual(timeouts, [1])
      assert.equal(__readLocalStorage('scores_v1'), undefined)
      assert.equal(__getRouterCalls().length, 0)

      if (destroyFirst) page.onDestroy()
      complete()
      complete()
      const [entry] = JSON.parse(__readLocalStorage('scores_v1'))
      assert.equal(entry.timestamp, EPOCH + 16)
      assert.equal(entry.survivedMs, 10)
      assert.equal(__readSessionStorage('last_session_v1'), undefined)
      assert.equal(__getRouterCalls().length, destroyFirst ? 0 : 1)
      if (!destroyFirst) assert.deepEqual(JSON.parse(__getRouterCalls()[0].payload.params).session, entry)
      page.onDestroy()
      assert.deepEqual(writes, ['scores_v1'])
      assert.equal(JSON.parse(__readLocalStorage('scores_v1')).length, 1)
      assert.deepEqual(logs, [])
    })
  })
}
