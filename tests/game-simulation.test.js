import { tiltProfile } from './tilt-fixtures.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { addAsteroidToCollisionGrid, calculateDifficulty, createShipGeometry, createShipRect } from '../zepp-app/shared/game-core.js'
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

test('pointer handlers never run the world; a short held input is preserved until presentation', async () => {
  await withGame({}, ({page,canvas,at,tick})=>{
    const initial=page.shipCenterY
    let updates=0
    const originalUpdate=page.stepSimulation
    page.stepSimulation=function(...args){updates++;return originalUpdate.apply(this,args)}
    at(135);canvas.__emit('CLICK_DOWN',{y:100})
    for(let ms=136;ms<155;ms++){at(ms);canvas.__emit('MOVE',{y:101})}
    at(155);canvas.__emit('CLICK_UP')
    assert.equal(updates,0)
    assert.equal(page.simulationClock.elapsedMs,0)
    assert.equal(page.shipCenterY,initial)
    tick(200)
    assert.equal(updates,20)
    assert.ok(Math.abs(page.shipCenterY-(initial-page.baseControlSpeed*.02))<1e-9)
    assert.equal(page.pointerDown,false)
    assert.equal(page.pointerInput.events.length,0)
  })
})

test('dense input cannot admit time during a stalled presentation or change the pause policy', async () => {
  for(const mode of ['touch','swipe']) await withGame({settings:{controlMode:mode}},({page,canvas,at,tick})=>{
    const initial=world(page)
    at(1);canvas.__emit('CLICK_DOWN',{y:100})
    for(let ms=2;ms<=999;ms++){at(ms);canvas.__emit('MOVE',{y:100+ms%100})}
    assert.equal(page.simulationClock.elapsedMs,0)
    assert.ok(page.pointerInput.events.length<=2)
    tick(1000)
    assert.equal(page.simulationClock.pausedMs,1000)
    assert.deepEqual(world(page),initial)
    tick(1010)
    assert.equal(page.simulationClock.elapsedMs,10)
    assert.notEqual(page.shipCenterY,initial.shipY)
  })
})

test('cached ship geometry matches all viewport and wrist bounds without per-step square roots or allocation helpers', () => {
  for(const [width,height]of [[416,416],[454,454],[466,466],[480,480],[390,450]])for(const wrist of ['left','right']){
    const viewport={width,height}
    const geometry=createShipGeometry(viewport,wrist)
    const rect=createShipRect(viewport,0,wrist,{},geometry)
    const points=rect.points
    for(const y of [-100,20,height/2,height-20,height+100]){
      const expected=createShipRect(viewport,y,wrist)
      const originalSqrt=Math.sqrt,originalAssign=Object.assign,originalFrom=Array.from
      Math.sqrt=()=>{throw new Error('static geometry recomputed')}
      Object.assign=()=>{throw new Error('temporary rectangle object copied')}
      Array.from=()=>{throw new Error('point array reallocated')}
      try{createShipRect(viewport,y,wrist,rect,geometry)}finally{Math.sqrt=originalSqrt;Object.assign=originalAssign;Array.from=originalFrom}
      assert.deepEqual(rect,expected)
      assert.equal(rect.points,points)
    }
  }
})

test('the actual game hot path reuses geometry and a stable update callback', async () => {
  await withGame({},({page,canvas,at,tick})=>{
    const originalSqrt=Math.sqrt, originalAssign=Object.assign, originalFrom=Array.from
    const callback=page.simulationUpdate
    Math.sqrt=()=>{throw new Error('static circular limits in game step')}
    Object.assign=()=>{throw new Error('temporary shape in game step')}
    Array.from=()=>{throw new Error('new shape points in game step')}
    try{
      at(5);canvas.__emit('CLICK_DOWN',{y:100})
      for(let ms=16;ms<=240;ms+=16)tick(ms)
    }finally{Math.sqrt=originalSqrt;Object.assign=originalAssign;Array.from=originalFrom}
    assert.equal(page.simulationClock.elapsedMs,240)
    assert.equal(page.simulationUpdate,callback)
    assert.ok(page.shipCenterY<page.viewport.height/2)
  })
})

test('a paused/released pointer and delayed callbacks cannot restart a destroyed game', async () => {
  await withGame({},({page,canvas,at,tick})=>{
    at(100);canvas.__emit('CLICK_DOWN',{y:100})
    page.onDestroy()
    at(200);canvas.__emit('MOVE',{y:300});canvas.__emit('CLICK_UP')
    page.tick()
    assert.equal(page.simulationClock.elapsedMs,0)
    assert.equal(page.pointerInput.events.length,0)
  })
})

async function withGame(options, run) {
  __resetDeviceInfo()
  __resetRouter()
  __resetUI()
  __resetInteraction()
  __resetSensors()
  __resetDisplay()
  __resetStorage()
  if (options.square) __setDeviceInfo({ width: 390, height: 450, screenShape: 'square' })
  __seedLocalStorage({ tilt_calibration_v1: JSON.stringify(tiltProfile(options.settings?.wristSide || 'left')), settings_v1: JSON.stringify({
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

for (const wristSide of ['left', 'right']) {
  test(`actual page catches a whole-playfield crossing before pruning (${wristSide})`, async () => {
    await withGame({ settings: { wristSide } }, ({ page, tick }) => {
      const asteroid = { id: 'extreme-crossing', x: wristSide === 'left' ? 470 : 10,
        y: page.shipRect.centerY, radius: 7, vx: wristSide === 'left' ? -100000 : 100000, lastHitAt: -Infinity }
      page.asteroids.push(asteroid)
      addAsteroidToCollisionGrid(asteroid, page.collisionGrid)
      tick(10)
      assert.equal(page.hp, 93)
      assert.equal(asteroid.lastHitAt, 10)
      tick(20)
      assert.equal(page.hp, 93, 'one crossing produces one damage charge')
      assert.equal(page.asteroids.length, 0, 'exited object removed on following step')
    })
  })
  test(`actual swipe motion crosses a stationary asteroid and clamps to the visible envelope (${wristSide})`, async () => {
    await withGame({ settings: { controlMode: 'swipe', wristSide } }, ({ page, canvas, tick }) => {
      const asteroid = { id: 'swipe-crossing', x: page.shipRect.centerX, y: 140, radius: 7, vx: 0, lastHitAt: -Infinity }
      page.asteroids.push(asteroid)
      addAsteroidToCollisionGrid(asteroid, page.collisionGrid)
      canvas.__emit('CLICK_DOWN', { y: 240 })
      canvas.__emit('MOVE', { y: -1000 })
      tick(10)
      assert.equal(page.hp, 93)
      assert.equal(page.shipCenterY, page.shipYLimits.min)
      assert.equal(page.shipRect.centerY, page.shipCenterY)
      canvas.__emit('MOVE', { y: 2000 })
      tick(20)
      assert.equal(page.hp, 93, 'cooldown blocks a second sweep through the same contact')
      assert.equal(page.shipCenterY, page.shipYLimits.max)
      assert.equal(page.shipRect.centerY, page.shipCenterY)
    })
  })
}

for (const difficulty of [166, 500, 1000]) {
  test(`actual page detects reachable late-run speeds at difficulty ${difficulty}`, async () => {
    await withGame({}, ({ page, tick }) => {
      const asteroid = { id: 'late-speed', x: page.shipRect.x + page.shipRect.w + 10,
        y: page.shipRect.centerY, radius: 18, vx: -(96 + difficulty * 9 + 28), lastHitAt: -Infinity }
      page.asteroids.push(asteroid)
      addAsteroidToCollisionGrid(asteroid, page.collisionGrid)
      tick(200)
      assert.equal(page.hp, 87)
      assert.ok(asteroid.lastHitAt > 0)
    })
  })
}
