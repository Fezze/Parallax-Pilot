import test from 'node:test'
import assert from 'node:assert/strict'
import { addAsteroidToCollisionGrid, calculateDifficulty } from '../zepp-app/shared/game-core.js'
import { __resetDeviceInfo, __setDeviceInfo } from './mocks/zos/device.mjs'
import { __getRouterCalls, __resetRouter } from './mocks/zos/router.mjs'
import { __getCanvasWidgets, __resetUI } from './mocks/zos/ui.mjs'
import { __resetInteraction } from './mocks/zos/interaction.mjs'
import { __resetSensors } from './mocks/zos/sensor.mjs'
import { __resetDisplay } from './mocks/zos/display.mjs'
import { __readLocalStorage, __readSessionStorage, __resetStorage, __seedLocalStorage } from './mocks/zos/storage.mjs'

const EPOCH = 1700000000000
let importId = 0
const schedules = [[16], [33], [50], [100], [200], [7, 211, 38, 149, 3, 249, 52]]

async function withGame(options, run) {
  __resetDeviceInfo()
  __resetRouter()
  __resetUI()
  __resetInteraction()
  __resetSensors()
  __resetDisplay()
  __resetStorage()
  if (options.square) __setDeviceInfo({ width: 390, height: 450, screenShape: 'square' })
  __seedLocalStorage({ settings_v1: JSON.stringify({
    controlMode: 'touch', wristSide: 'left', timeScale: 1,
    spawnMultiplier: 1, tiltSensitivity: 1, ...options.settings,
  }) })
  await import(`../zepp-app/page/game/index.js?simulation=${++importId}`)
  const page = globalThis.__zeppPageDefinition
  const original = { now: Date.now, random: Math.random, set: globalThis.setInterval, clear: globalThis.clearInterval }
  let now = EPOCH
  let timer
  let seed = 137
  Date.now = () => now
  Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 }
  globalThis.setInterval = (callback) => { timer = callback; return 1 }
  globalThis.clearInterval = () => {}
  try {
    page.onInit()
    page.build()
    await run({ page, canvas: __getCanvasWidgets()[0], at: (ms) => { now = EPOCH + ms }, tick: (ms) => { now = EPOCH + ms; timer() } })
  } finally {
    page.onDestroy()
    Date.now = original.now
    Math.random = original.random
    globalThis.setInterval = original.set
    globalThis.clearInterval = original.clear
  }
}

function savedEntry() {
  const entry = JSON.parse(__readSessionStorage('last_session_v1'))
  assert.deepEqual(JSON.parse(__readLocalStorage('scores_v1'))[0], entry)
  return entry
}

function world(page) {
  return structuredClone({ age: page.simulationClock.elapsedMs, shipY: page.shipCenterY,
    difficulty: calculateDifficulty(page.simulationClock.elapsedMs, page.settings.timeScale),
    hp: page.hp, displayedHp: page.displayedHp, spawned: page.asteroidSeed,
    lastSpawnAt: page.lastSpawnAt, lastDamageAt: page.lastDamageAt,
    asteroids: page.asteroids, finished: page.finished })
}

async function replay(schedule, options = {}) {
  let result
  await withGame(options, ({ page, tick }) => {
    // Preserve collisions but extend survival to expose a full minute of world progression.
    page.hp = 1000000
    page.displayedHp = page.hp
    const checkpoints = []
    let wall = 0
    let index = 0
    for (let checkpoint = 1000; checkpoint <= 60000; checkpoint += 1000) {
      page.touchDirection = checkpoint % 2000 ? 1 : -1
      if (page.accelerometer) {
        // Supply the same per-step sensor trace, independent of callback batching.
        page.accelerometer.getCurrent = () => ({ y: page.simulationClock.elapsedMs % 2000 < 1000 ? 8 : -8 })
      }
      while (wall < checkpoint) {
        wall = Math.min(checkpoint, wall + schedule[index++ % schedule.length])
        tick(wall)
      }
      checkpoints.push(world(page))
    }
    page.finishRun()
    const entry = savedEntry()
    result = { checkpoints, entry, routes: __getRouterCalls() }
  })
  return result
}

for (const options of [{}, { square: true, settings: { wristSide: 'right', timeScale: 3, spawnMultiplier: 1.25 } }, { settings: { controlMode: 'tilt' } }]) {
  test(`actual game world, damage and score are identical across callback schedules: ${JSON.stringify(options)}`, async () => {
    const reference = await replay(schedules[0], options)
    assert.equal(reference.entry.survivedMs, 60000)
    assert.equal(reference.entry.timestamp, EPOCH + 60000)
    assert.ok(reference.checkpoints.at(-1).spawned > 100)
    assert.ok(reference.checkpoints.at(-1).hp < 1000000)
    for (const schedule of schedules.slice(1)) assert.deepEqual(await replay(schedule, options), reference, `schedule ${schedule}`)
  })
}

test('natural game over has the same fatal step and saved score across schedules', async () => {
  let reference
  for (const schedule of schedules) {
    await withGame({}, ({ page, tick }) => {
      let wall = 0
      let index = 0
      while (!page.finished && wall < 120000) tick(wall += schedule[index++ % schedule.length])
      assert.equal(page.finished, true)
      const entry = savedEntry()
      assert.equal(entry.timestamp, EPOCH + wall)
      assert.equal(entry.survivedMs, page.simulationClock.elapsedMs)
      const result = { state: world(page), score: entry.score, duration: entry.survivedMs }
      if (!reference) reference = result
      else assert.deepEqual(result, reference)
      assert.equal(__getRouterCalls().length, 1)
      tick(wall + 200)
      assert.equal(__getRouterCalls().length, 1)
      assert.deepEqual(world(page), result.state)
    })
  }
})

for (const controlMode of ['touch', 'swipe']) {
  test(`${controlMode} event boundaries preserve the same trajectory between delayed callbacks`, async () => {
    let reference
    for (const schedule of schedules) {
      await withGame({ settings: { controlMode } }, ({ page, canvas, at, tick }) => {
        const events = [[135, 'CLICK_DOWN', 100], [777, 'MOVE', 160], [1023, 'CLICK_UP'], [1247, 'CLICK_DOWN', 350], [1449, 'MOVE', 320], [1789, 'CLICK_UP']]
        let wall = 0
        let index = 0
        let eventIndex = 0
        let callbackAt = schedule[index++ % schedule.length]
        while (wall < 2000) {
          wall = Math.min(callbackAt, events[eventIndex]?.[0] ?? Infinity, 2000)
          at(wall)
          if (wall === events[eventIndex]?.[0]) {
            const [, event, y] = events[eventIndex++]
            canvas.__emit(event, { y })
          } else {
            tick(wall)
            callbackAt = wall + schedule[index++ % schedule.length]
          }
        }
        const result = world(page)
        if (!reference) reference = result
        else assert.deepEqual(result, reference)
        assert.notEqual(result.shipY, page.viewport.height / 2)
      })
    }
  })
}

test('long stalls freeze the full world, preserve cooldowns and create no spawn debt or score', async () => {
  await withGame({}, ({ page, tick, canvas }) => {
    page.hp = 1000000
    const asteroid = { id: 'contact', x: page.shipRect.centerX, y: page.shipRect.centerY, radius: 18, vx: 0, lastHitAt: -Infinity }
    page.asteroids.push(asteroid)
    addAsteroidToCollisionGrid(asteroid, page.collisionGrid)
    tick(20)
    const before = world(page)
    const drawCount = canvas.__getDrawCalls().filter((call) => call.method === 'drawRect').length
    tick(60020)
    assert.deepEqual(world(page), before)
    assert.equal(page.simulationClock.pausedMs, 60000)
    assert.equal(canvas.__getDrawCalls().filter((call) => call.method === 'drawRect').length, drawCount + 1)
    tick(60030)
    assert.equal(page.hp, before.hp)
    tick(60270)
    assert.ok(page.hp < before.hp, 'damage resumes when simulation cooldown expires')
    assert.equal(page.asteroidSeed, 0)
    page.finishRun()
    const entry = savedEntry()
    assert.equal(entry.survivedMs, 270)
    assert.equal(entry.score, 270)
    assert.equal(entry.timestamp, EPOCH + 60270)
  })
})

test('a 200 ms callback checks intermediate collisions and renders once', async () => {
  await withGame({}, ({ page, tick, canvas }) => {
    // The asteroid crosses the complete ship between callback endpoints.
    const asteroid = { id: 'crossing', x: page.shipRect.x + page.shipRect.w + 40,
      y: page.shipRect.centerY, radius: 8, vx: -800, lastHitAt: -Infinity }
    page.asteroids.push(asteroid)
    addAsteroidToCollisionGrid(asteroid, page.collisionGrid)
    const draws = canvas.__getDrawCalls().filter((call) => call.method === 'drawRect').length
    tick(200)
    assert.ok(page.hp < 100)
    assert.equal(page.simulationClock.elapsedMs, 200)
    assert.equal(canvas.__getDrawCalls().filter((call) => call.method === 'drawRect').length, draws + 1)
  })
})

test('fatal catch-up stops immediately without drawing after results navigation', async () => {
  await withGame({}, ({ page, tick, canvas }) => {
    page.hp = 1
    const asteroid = { id: 'fatal', x: page.shipRect.centerX, y: page.shipRect.centerY, radius: 18, vx: 0, lastHitAt: -Infinity }
    page.asteroids.push(asteroid)
    addAsteroidToCollisionGrid(asteroid, page.collisionGrid)
    const draws = canvas.__getDrawCalls().length
    tick(200)
    assert.equal(page.finished, true)
    assert.equal(page.simulationClock.elapsedMs, 10)
    assert.equal(savedEntry().survivedMs, 10)
    assert.equal(canvas.__getDrawCalls().length, draws)
    assert.equal(__getRouterCalls().length, 1)
  })
})

test('a paused interval can be inserted into a live run without changing subsequent world or score', async () => {
  const results = []
  for (const pause of [0, 60000]) {
    await withGame({}, ({ page, tick }) => {
      page.hp = 1000000
      page.displayedHp = page.hp
      for (let age = 200; age <= 1200; age += 200) tick(age)
      tick(1377)
      if (pause) tick(1377 + pause)
      for (let age = 1577; age < 20000; age += 200) tick(age + pause)
      tick(20000 + pause)
      assert.equal(page.simulationClock.pendingMs, 0)
      page.finishRun()
      const entry = savedEntry()
      assert.equal(entry.timestamp, EPOCH + 20000 + pause)
      results.push({ world: world(page), score: entry.score, survivedMs: entry.survivedMs })
    })
  }
  assert.deepEqual(results[1], results[0])
})
