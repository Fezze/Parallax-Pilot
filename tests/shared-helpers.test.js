import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addAsteroidToCollisionGrid,
  advanceAsteroidsInCollisionGrid,
  advanceAsteroidsAndCollectCollisionCandidates,
  clamp,
  chooseSpawnY,
  collectCollisionCandidatesFromGrid,
  createCollisionGrid,
  createAsteroid,
  createScoreEntry,
  getCollisionBucketIndex,
  getCollisionSliceIndex,
  getSpawnIntervalMs,
  isAsteroidInCollisionBand,
  moveAsteroids,
  pruneAsteroids,
  removeAsteroidFromCollisionGrid,
  advanceAsteroidsInPlace,
  calculateCollisionResult,
} from '../zepp-app/shared/game-core.js'
import {
  appendScore,
  readJson,
  readScores,
  sanitizeSettings,
  writeJson,
  writeScores,
} from '../zepp-app/shared/persistence.js'
import { parseRouteParams } from '../zepp-app/shared/params.js'
import {
  buildScoreRow,
  cycleOption,
  formatDurationMs,
  formatSettingValue,
  paginateScores,
} from '../zepp-app/shared/view-models.js'
import {
  sanitizeControlMode,
  supportsDigitalCrown,
} from '../zepp-app/shared/device.js'
import {
  __resetLanguage,
  __setLanguage,
} from './mocks/zos/settings.mjs'

function createMemoryStorage(initialValues = {}) {
  const map = new Map(Object.entries(initialValues))
  return {
    getItem(key, fallback = null) {
      return map.has(key) ? map.get(key) : fallback
    },
    setItem(key, value) {
      map.set(key, value)
    },
  }
}

test('route params and json storage fall back safely on invalid input', () => {
  const storage = createMemoryStorage({
    broken: '{bad json',
    scalar: JSON.stringify(42),
    objectValue: { ok: true },
  })
  const throwingStorage = {
    getItem() {
      throw new Error('boom')
    },
  }

  assert.deepEqual(parseRouteParams('{"page":2}'), { page: 2 })
  assert.deepEqual(parseRouteParams(null, { page: 0 }), { page: 0 })
  assert.deepEqual(parseRouteParams('{broken', { page: 1 }), { page: 1 })
  assert.deepEqual(readJson(storage, 'broken', { ok: false }), { ok: false })
  assert.equal(readJson(storage, 'scalar', 0), 42)
  assert.deepEqual(readJson(storage, 'objectValue', null), { ok: true })
  assert.deepEqual(readJson(throwingStorage, 'x', { safe: true }), { safe: true })

  writeJson(storage, 'saved', { ok: true })
  assert.deepEqual(readJson(storage, 'saved', null), { ok: true })
})

test('settings and scores sanitize invalid values before persistence', () => {
  const storage = createMemoryStorage()
  const sanitized = sanitizeSettings({
    controlMode: 'bad',
    wristSide: 'up',
    timeScale: '3',
    spawnMultiplier: 'x',
    tiltSensitivity: 999,
  })
  const nullSanitized = sanitizeSettings(null)

  assert.deepEqual(sanitized, {
    controlMode: 'tilt',
    wristSide: 'left',
    timeScale: 3,
    spawnMultiplier: 1,
    tiltSensitivity: 1,
  })
  assert.deepEqual(nullSanitized, {
    controlMode: 'tilt',
    wristSide: 'left',
    timeScale: 1,
    spawnMultiplier: 1,
    tiltSensitivity: 1,
  })

  writeScores(storage, { not: 'an array' })
  assert.deepEqual(readScores(storage), [])
  storage.setItem('scores_v1', JSON.stringify({ invalid: true }))
  assert.deepEqual(readScores(storage), [])

  const scores = appendScore(storage, {
    id: 'run-1',
    timestamp: 10,
    score: 10,
    survivedMs: 10,
  })
  assert.equal(scores.length, 1)
})

test('view models format and clamp pagination predictably', () => {
  __resetLanguage()
  const scores = [{ score: 9, survivedMs: 125000 }]
  const page = paginateScores(null, 99, 5)

  assert.deepEqual(page, {
    pageCount: 1,
    pageIndex: 0,
    items: [],
  })
  assert.equal(cycleOption(['a', 'b', 'c'], 'b'), 'c')
  assert.equal(cycleOption(['a', 'b', 'c'], 'missing'), 'b')
  assert.equal(formatDurationMs(125000), '125s')
  assert.equal(formatDurationMs(12500), '12.5s')
  assert.equal(formatDurationMs(980), '0.98s')
  assert.equal(formatSettingValue('controlMode', 'crown'), 'ROTARY')
  assert.equal(formatSettingValue('wristSide', 'left'), 'LEFT')
  assert.equal(formatSettingValue('timeScale', 2), '2x')
  assert.equal(formatSettingValue('unknown', 7), '7')
  assert.equal(buildScoreRow(scores[0], 1), '02  9  125s')
})

test('view models switch setting labels to Polish when the locale is pl-PL', () => {
  __setLanguage(9)

  assert.equal(formatSettingValue('controlMode', 'crown'), 'OBR\u00d3T')
  assert.equal(formatSettingValue('wristSide', 'left'), 'LEWA')

  __resetLanguage()
})

test('device helpers and score entry cover invalid and negative branches', () => {
  const entry = createScoreEntry(-25, {
    controlMode: 'touch',
    wristSide: 'right',
    timeScale: 2,
    spawnMultiplier: 1.6,
  }, 500)

  assert.equal(supportsDigitalCrown(), false)
  assert.equal(supportsDigitalCrown({ keyType: 'normal_20' }), false)
  assert.equal(sanitizeControlMode('bad', false), 'tilt')
  assert.equal(sanitizeControlMode('crown', false), 'crown')
  assert.equal(entry.survivedMs, 0)
  assert.equal(entry.score, 0)
})

test('asteroid helpers keep movement logic consistent across immutable and in-place paths', () => {
  const viewport = { width: 100, height: 100 }
  const source = [
    { id: 'keep', x: 10, y: 20, radius: 8, vx: 10 },
    { id: 'drop', x: -40, y: 20, radius: 8, vx: -10 },
  ]
  const moved = moveAsteroids(source, 1)
  const pruned = pruneAsteroids(moved, viewport)
  const inPlace = source.map((asteroid) => ({ ...asteroid }))

  assert.equal(clamp(-5, 0, 10), 0)
  assert.equal(clamp(15, 0, 10), 10)
  assert.ok(getSpawnIntervalMs(0.1, 0.1) > 900)
  assert.ok(getSpawnIntervalMs(99, 99) < 1)
  assert.deepEqual(pruned.map((asteroid) => asteroid.id), ['keep'])
  assert.equal(advanceAsteroidsInPlace(inPlace, 1, viewport), inPlace)
  assert.deepEqual(inPlace.map((asteroid) => asteroid.id), ['keep'])
  assert.equal(inPlace[0].x, 20)
})

test('broad-phase collision candidates skip asteroids outside the forward ship corridor', () => {
  const viewport = { width: 200, height: 200 }
  const shipRect = { x: 60, y: 70, w: 30, h: 20 }
  const asteroids = [
    { id: 'behind', x: 30, y: 80, radius: 8, vx: -10 },
    { id: 'candidate', x: 92, y: 80, radius: 8, vx: -10 },
    { id: 'far-y', x: 92, y: 150, radius: 8, vx: -10 },
  ]
  const candidates = []
  const grid = createCollisionGrid(viewport)

  for (let index = 0; index < asteroids.length; index += 1) {
    addAsteroidToCollisionGrid(asteroids[index], grid)
  }

  assert.equal(
    isAsteroidInCollisionBand(asteroids[0], shipRect, 'left'),
    false
  )
  assert.equal(
    isAsteroidInCollisionBand(asteroids[1], shipRect, 'left'),
    true
  )
  assert.equal(
    isAsteroidInCollisionBand(asteroids[2], shipRect, 'left'),
    false
  )

  assert.ok(getCollisionSliceIndex(asteroids[1].x, grid) >= 0)
  assert.ok(getCollisionBucketIndex(asteroids[1].y, grid) >= 0)

  advanceAsteroidsInCollisionGrid(
    asteroids,
    0.016,
    viewport,
    grid
  )
  collectCollisionCandidatesFromGrid(
    grid,
    shipRect,
    'left',
    candidates
  )

  assert.deepEqual(candidates.map((asteroid) => asteroid.id), ['candidate'])
  assert.ok(grid.slices.some((slice) => slice.some((bucket) => bucket.length > 0)))
})

test('collision grid handles removal, slice migration and offscreen pruning', () => {
  const viewport = { width: 200, height: 200 }
  const grid = createCollisionGrid(viewport, 40, 40, 24)
  const first = { id: 'first', x: 50, y: 50, radius: 8, vx: 0, lastHitAt: 0 }
  const second = { id: 'second', x: 52, y: 50, radius: 8, vx: 0, lastHitAt: 0 }

  addAsteroidToCollisionGrid(first, grid)
  addAsteroidToCollisionGrid(second, grid)
  removeAsteroidFromCollisionGrid(first, grid)

  assert.equal(grid.slices[second.gridSliceIndex][second.gridBucketIndex][0], second)
  assert.equal(second.gridSlotIndex, 0)

  const moving = { id: 'moving', x: 39, y: 50, radius: 8, vx: 200, lastHitAt: 0 }
  addAsteroidToCollisionGrid(moving, grid)
  const previousSliceIndex = moving.gridSliceIndex
  advanceAsteroidsInCollisionGrid([moving], 0.2, viewport, grid)
  assert.notEqual(moving.gridSliceIndex, previousSliceIndex)

  const offscreen = { id: 'offscreen', x: -10, y: 50, radius: 8, vx: -300, lastHitAt: 0 }
  addAsteroidToCollisionGrid(offscreen, grid)
  const asteroids = [offscreen]
  advanceAsteroidsInCollisionGrid(asteroids, 0.2, viewport, grid)

  assert.equal(asteroids.length, 0)
  assert.equal(offscreen.gridSliceIndex, -1)
  assert.equal(offscreen.gridBucketIndex, -1)
})

test('collision band handles asteroids above ship and left-travel branch', () => {
  const shipRect = { x: 120, y: 70, w: 30, h: 20 }

  assert.equal(
    isAsteroidInCollisionBand({ x: 130, y: 40, radius: 8 }, shipRect, 'left'),
    false
  )
  assert.equal(
    isAsteroidInCollisionBand({ x: 170, y: 80, radius: 8 }, shipRect, 'right'),
    false
  )
  assert.equal(
    isAsteroidInCollisionBand({ x: 112, y: 80, radius: 8 }, shipRect, 'right'),
    true
  )
})

test('collision grid removal safely ignores asteroids outside known buckets', () => {
  const grid = createCollisionGrid({ width: 200, height: 200 })
  const orphan = {
    id: 'orphan',
    x: 0,
    y: 0,
    radius: 8,
    gridSliceIndex: 999,
    gridBucketIndex: 999,
    gridSlotIndex: 0,
  }

  assert.doesNotThrow(() => removeAsteroidFromCollisionGrid(orphan, grid))
})

test('compat broad-phase wrapper still returns candidates from a transient grid', () => {
  const viewport = { width: 200, height: 200 }
  const shipRect = { x: 60, y: 70, w: 30, h: 20 }
  const asteroids = [
    { id: 'candidate', x: 92, y: 80, radius: 8, vx: -10, lastHitAt: 0 },
  ]
  const candidates = []

  advanceAsteroidsAndCollectCollisionCandidates(
    asteroids,
    0.016,
    viewport,
    shipRect,
    'left',
    candidates
  )

  assert.deepEqual(candidates.map((asteroid) => asteroid.id), ['candidate'])
})

test('compat broad-phase wrapper reuses existing grid membership when present', () => {
  const viewport = { width: 200, height: 200 }
  const shipRect = { x: 60, y: 70, w: 30, h: 20 }
  const grid = createCollisionGrid(viewport)
  const asteroid = {
    id: 'candidate',
    x: 92,
    y: 80,
    radius: 8,
    vx: -10,
    lastHitAt: 0,
  }
  const candidates = []

  addAsteroidToCollisionGrid(asteroid, grid)
  advanceAsteroidsAndCollectCollisionCandidates(
    [asteroid],
    0.016,
    viewport,
    shipRect,
    'left',
    candidates,
    grid
  )

  assert.deepEqual(candidates.map((entry) => entry.id), ['candidate'])
})

test('collision helper reports clean misses without damage', () => {
  const result = calculateCollisionResult({
    shipRect: { x: 0, y: 0, w: 20, h: 20 },
    asteroid: { x: 100, y: 100, radius: 10, lastHitAt: 0 },
    difficulty: 1,
    now: 500,
  })

  assert.deepEqual(result, {
    hit: false,
    damage: 0,
    overlapRatio: 0,
  })
})

test('spawn selection and asteroid creation cover both travel directions', () => {
  const viewport = { width: 200, height: 200 }
  const shipRect = {
    x: 70,
    y: 70,
    w: 30,
    h: 20,
    centerX: 85,
    centerY: 80,
  }
  const asteroidField = [{ x: 40, y: 40, radius: 12 }]
  const random = (() => {
    const values = [0.1, 0.8, 0.2, 0.7, 0.3, 0.6, 0.4, 0.5]
    let index = 0
    return () => {
      const value = values[index % values.length]
      index += 1
      return value
    }
  })()

  const spawnY = chooseSpawnY({
    viewport,
    shipRect,
    asteroids: asteroidField,
    radius: 10,
    wristSide: 'right',
    random,
  })
  const asteroid = createAsteroid({
    id: 'left-spawn',
    viewport,
    difficulty: 8,
    shipRect,
    asteroids: asteroidField,
    wristSide: 'left',
    random: () => 0.5,
  })
  const fastAsteroid = createAsteroid({
    id: 'fast-spawn',
    viewport,
    difficulty: 40,
    shipRect,
    asteroids: asteroidField,
    wristSide: 'left',
    random: () => 0.5,
  })

  assert.ok(spawnY >= -5)
  assert.ok(spawnY <= 205)
  assert.ok(asteroid.x > viewport.width)
  assert.ok(asteroid.vx < 0)
  assert.ok(Math.abs(fastAsteroid.vx) > 440)
})
