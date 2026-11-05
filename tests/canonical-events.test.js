import test from 'node:test'
import assert from 'node:assert/strict'
import {
  advanceControlScalar,
  anchorAsteroidMotion,
  calculateCollisionResult,
  calculateDifficulty,
  clamp,
  createShipGeometry,
  createShipRect,
  getCollisionQuantumWindow,
  getNextSpawnQuantum,
  getSpawnIntervalMs,
  isAsteroidInCollisionBand,
} from '../zepp-app/shared/game-core.js'

const viewport = { width: 480, height: 480, isRound: true }

function spawnDue(now, lastSpawnAt, timeScale, multiplier, isRound) {
  // Independent copy of the page's current ordering and arithmetic grouping.
  const difficulty = 1 + (now / 1000) * timeScale * 0.55
  const interval = (1180 / (0.92 + difficulty * multiplier * 0.11)) * (isRound ? 1 : 0.84)
  return now - lastSpawnAt >= interval
}

function firstSpawnByScanning(lastSpawnAt, timeScale, multiplier, isRound, stepMs) {
  let now = Math.max(0, Math.floor(lastSpawnAt / stepMs) * stepMs)
  while (!spawnDue(now, lastSpawnAt, timeScale, multiplier, isRound)) now += stepMs
  return now
}

test('next spawn scheduling matches the original predicate across settings, fractional debt and quantum sizes', () => {
  for (const timeScale of [0, 0.5, 1, 1.5, 2, 3]) {
    for (const multiplier of [0, 0.75, 0.9, 1, 1.1, 1.25]) {
      for (const isRound of [true, false]) {
        for (const stepMs of [5, 10, 20]) {
          for (const lastSpawnAt of [0, 0.25, 17.125, 590.3333333333334, 10020, 125000.875]) {
            const expected = firstSpawnByScanning(lastSpawnAt, timeScale, multiplier, isRound, stepMs)
            const actual = getNextSpawnQuantum(lastSpawnAt, timeScale, multiplier, isRound, stepMs)
            assert.equal(actual, expected,
              `last=${lastSpawnAt}, time=${timeScale}, multiplier=${multiplier}, round=${isRound}, step=${stepMs}`)
            assert.equal(spawnDue(actual, lastSpawnAt, timeScale, multiplier, isRound), true)
            assert.equal(spawnDue(actual - stepMs, lastSpawnAt, timeScale, multiplier, isRound), false)
          }
        }
      }
    }
  }
})

test('event spawn scheduling preserves capped burst debt and all later spawn instants', () => {
  for (const isRound of [true, false]) {
    const timeScale = 3
    const multiplier = 1.25
    const traces = []
    for (const useEvents of [false, true]) {
      let lastSpawnAt = 0
      let now = 10000 // Deliberate retained debt at the first observed quantum.
      const events = []
      while (now <= 90000) {
        const difficulty = calculateDifficulty(now, timeScale)
        const interval = getSpawnIntervalMs(difficulty, multiplier) * (isRound ? 1 : 0.84)
        if (now - lastSpawnAt >= interval) {
          const elapsed = now - lastSpawnAt
          const count = Math.min(4, Math.max(1, Math.floor(elapsed / interval)))
          const remainingDebt = Math.max(0, elapsed - interval * count)
          lastSpawnAt = now - Math.min(interval, remainingDebt)
          events.push([now, count, lastSpawnAt])
        }
        now = useEvents
          ? Math.max(now + 10, getNextSpawnQuantum(lastSpawnAt, timeScale, multiplier, isRound))
          : now + 10
      }
      traces.push(events)
    }
    assert.equal(traces[0][0][1], 4, 'the retained-debt case must actually hit the cap')
    assert.deepEqual(traces[1], traces[0])
  }
})

test('spawn root verification covers exact predicate boundaries and rejects invalid settings', () => {
  // At timeScale zero the predicate has a constant interval, allowing exact
  // debt values on a quantum boundary and either adjacent floating-point side.
  for (const isRound of [true, false]) {
    const interval = (1180 / (0.92 + 0.11)) * (isRound ? 1 : 0.84)
    for (const adjustment of [-1e-10, 0, 1e-10]) {
      const lastSpawnAt = 10000 - interval + adjustment
      assert.equal(getNextSpawnQuantum(lastSpawnAt, 0, 1, isRound),
        firstSpawnByScanning(lastSpawnAt, 0, 1, isRound, 10))
    }
  }
  assert.equal(getNextSpawnQuantum(NaN, 1, 1, true), Infinity)
  assert.equal(getNextSpawnQuantum(0, -1, 1, true), Infinity)
  assert.equal(getNextSpawnQuantum(0, 1, 1, true, 0), Infinity)
})

test('scalar control batching preserves repeated floating addition and clamping exactly', () => {
  for (const start of [-1, 52, 100.5, 239.99999999999997, 428, 500]) {
    for (const velocity of [-700, -176.64, -0.00000000000000000001, 0, 176.64, 700]) {
      for (const count of [0, 1, 2, 25, 1000]) {
        for (const stepMs of [5, 10, 20]) {
          let expected = start
          for (let index = 0; index < count; index += 1) {
            expected += velocity * (stepMs / 1000)
            expected = Math.min(Math.max(expected, 52), 428)
          }
          assert.equal(advanceControlScalar(start, velocity, count, 52, 428, stepMs), expected)
        }
      }
    }
  }
})

function assertWindowContains(window, atMs, context) {
  assert.ok(window, `${context}: no contact window at ${atMs}`)
  assert.ok(atMs >= window.firstMs && atMs <= window.lastMs,
    `${context}: ${atMs} outside ${window.firstMs}..${window.lastMs}`)
}

test('collision windows never omit canonical swept bounds or precise hits across clamping and rounding', () => {
  let state = 217
  const random = () => {
    state = (state * 16807) % 2147483647
    return (state - 1) / 2147483646
  }
  let actualHits = 0
  let boundedSteps = 0
  const scratch = {}
  for (const wristSide of ['left', 'right']) {
    const geometry = createShipGeometry(viewport, wristSide)
    for (let scenario = 0; scenario < 240; scenario += 1) {
      const start = scenario % 3 === 0 ? geometry.limits.min :
        scenario % 3 === 1 ? geometry.limits.max : geometry.limits.min + random() * (geometry.limits.max - geometry.limits.min)
      const velocity = [-700, -176.64, 0, 176.64, 700][scenario % 5]
      const radius = [7, 13, 18][scenario % 3]
      const asteroid = { x: geometry.x - 180 + random() * 400,
        y: scenario % 4 === 0 ? start : random() * 480,
        radius, vx: [-6000, -300, 0, 300, 6000][scenario % 5], lastHitAt: -Infinity }
      anchorAsteroidMotion(asteroid, 1000)
      const window = getCollisionQuantumWindow(asteroid, geometry, 1000, 1250, start, velocity, scratch)
      if (window) assert.equal(window, scratch)
      let centerY = start
      let previous = createShipRect(viewport, centerY, wristSide, {}, geometry)
      let oldX = asteroid.x
      for (let atMs = 1010; atMs <= 1250; atMs += 10) {
        centerY += velocity * 0.01
        centerY = Math.min(Math.max(centerY, geometry.limits.min), geometry.limits.max)
        const current = createShipRect(viewport, centerY, wristSide, {}, geometry)
        const moved = { ...asteroid, previousX: oldX, x: oldX + asteroid.vx * 0.01 }
        if (isAsteroidInCollisionBand(moved, current, wristSide, previous)) {
          boundedSteps += 1
          assertWindowContains(window, atMs, `${wristSide} scenario ${scenario}`)
        }
        const collision = calculateCollisionResult({ shipRect: current, previousShipRect: previous, asteroid: moved, now: atMs })
        if (collision.hit) {
          actualHits += 1
          assertWindowContains(window, atMs, `${wristSide} precise scenario ${scenario}`)
        }
        oldX = moved.x
        previous = current
      }
    }
  }
  assert.ok(boundedSteps > 100, 'the oracle must exercise real swept bounds')
  assert.ok(actualHits > 50, 'the oracle must exercise precise contacts')
})

test('stationary and distant scenes skip all contact work while a fast crossing keeps a bounded event window', () => {
  const geometry = createShipGeometry(viewport, 'left')
  const far = { x: 450, y: 240, radius: 7, vx: 0 }
  assert.equal(getCollisionQuantumWindow(far, geometry, 0, 250, 240, 0), null)
  const above = { x: geometry.x + 20, y: -100, radius: 7, vx: 0 }
  assert.equal(getCollisionQuantumWindow(above, geometry, 0, 250, 240, 0), null)
  const crossing = { x: geometry.x + 200, y: 240, radius: 7, vx: -2000 }
  anchorAsteroidMotion(crossing, 0)
  const window = getCollisionQuantumWindow(crossing, geometry, 0, 250, 240, 0)
  assert.ok(window.firstMs > 10)
  assert.ok(window.lastMs < 250)
  assertWindowContains(window, 100, 'fast crossing')
  crossing.motionRemoved = true
  assert.equal(getCollisionQuantumWindow(crossing, geometry, 0, 250, 240, 0), null)
})

test('swipe windows preserve the instantaneous first swept step and then the stationary target', () => {
  for (const wristSide of ['left', 'right']) {
    const geometry = createShipGeometry(viewport, wristSide)
    const from = geometry.limits.min
    const target = geometry.limits.max
    const asteroid = { x: geometry.x + geometry.w / 2, y: 240, radius: 7, vx: 0, lastHitAt: -Infinity }
    anchorAsteroidMotion(asteroid, 0)
    const window = getCollisionQuantumWindow(asteroid, geometry, 0, 250, from, 9999, {}, 10, target)
    assert.deepEqual(window, { firstMs: 10, lastMs: 10 })
    const previous = createShipRect(viewport, from, wristSide, {}, geometry)
    const current = createShipRect(viewport, target, wristSide, {}, geometry)
    assert.equal(calculateCollisionResult({ shipRect: current, previousShipRect: previous, asteroid, now: 10 }).hit, true)
    assert.equal(calculateCollisionResult({ shipRect: current, asteroid, now: 20 }).hit, false)
    const atTarget = { ...asteroid, y: target }
    const targetWindow = getCollisionQuantumWindow(atTarget, geometry, 0, 250, from, 0, {}, 10, target)
    assert.deepEqual(targetWindow, { firstMs: 10, lastMs: 250 })
  }
})

test('input reversal windows restart from the exact scalar state and preserve both swept paths', () => {
  const geometry = createShipGeometry(viewport, 'left')
  const asteroid = { x: geometry.x + 20, y: 260, radius: 13, vx: 0, lastHitAt: -Infinity }
  anchorAsteroidMotion(asteroid, 0)
  const segments = [[0, 100, 240, 700]]
  const atTurn = advanceControlScalar(240, 700, 10, geometry.limits.min, geometry.limits.max)
  segments.push([100, 200, atTurn, -700])
  let hitCount = 0
  for (const [fromMs, throughMs, start, velocity] of segments) {
    const window = getCollisionQuantumWindow(asteroid, geometry, fromMs, throughMs, start, velocity)
    let center = start
    let previous = createShipRect(viewport, center, 'left', {}, geometry)
    for (let atMs = fromMs + 10; atMs <= throughMs; atMs += 10) {
      center = clamp(center + velocity * 0.01, geometry.limits.min, geometry.limits.max)
      const current = createShipRect(viewport, center, 'left', {}, geometry)
      if (calculateCollisionResult({ shipRect: current, previousShipRect: previous, asteroid, now: atMs }).hit) {
        hitCount += 1
        assertWindowContains(window, atMs, 'reversal')
      }
      previous = current
    }
  }
  assert.ok(hitCount > 2)
})
