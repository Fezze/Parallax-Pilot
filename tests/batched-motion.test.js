import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addAsteroidToCollisionGrid,
  advanceAsteroidsInCollisionGrid,
  advanceFrameCollisionCandidates,
  anchorAsteroidMotion,
  calculateCollisionResult,
  collectCollisionCandidatesFromGrid,
  collectCollisionCandidatesFromList,
  collectFrameCollisionCandidates,
  createAsteroid,
  createCollisionGrid,
  createShipGeometry,
  createShipRect,
  getAsteroidXAt,
  getRenderAsteroidXAt,
  interpolateShipRect,
  materializeAsteroidsAt,
} from '../zepp-app/shared/game-core.js'

const viewport = { width: 480, height: 480, isRound: true }
const positionTolerance = 1e-9

function close(actual, expected, context = '') {
  assert.ok(Math.abs(actual - expected) <= positionTolerance,
    `${context}: ${actual} differs from ${expected}`)
}

function randomSequence() {
  let state = 437
  return () => {
    state = (state * 16807) % 2147483647
    return (state - 1) / 2147483646
  }
}

function scene(fixtures, anchorAt) {
  const grid = createCollisionGrid(viewport)
  const asteroids = fixtures.map(fixture => ({ lastHitAt: -Infinity, ...fixture }))
  for (const asteroid of asteroids) {
    if (anchorAt !== undefined) anchorAsteroidMotion(asteroid, anchorAt)
    addAsteroidToCollisionGrid(asteroid, grid)
  }
  return { grid, asteroids }
}

function gridIds(grid) {
  return grid.slices.map(slice => slice.map(bucket => bucket.map(asteroid => asteroid.id).sort()))
}

function assertMatchingScene(actual, expected) {
  assert.deepEqual(actual.asteroids.map(asteroid => asteroid.id), expected.asteroids.map(asteroid => asteroid.id))
  for (let index = 0; index < actual.asteroids.length; index += 1) {
    const left = actual.asteroids[index]
    const right = expected.asteroids[index]
    close(left.x, right.x, `${left.id} x`)
    close(left.previousX, right.previousX, `${left.id} previousX`)
    assert.equal(left.gridSliceIndex, right.gridSliceIndex)
    assert.equal(left.gridBucketIndex, right.gridBucketIndex)
    const bucket = actual.grid.slices[left.gridSliceIndex][left.gridBucketIndex]
    assert.equal(bucket[left.gridSlotIndex], left)
  }
  assert.deepEqual(gridIds(actual.grid), gridIds(expected.grid))
  close(actual.grid.maxDisplacement, expected.grid.maxDisplacement, 'grid displacement')
}

test('motion anchors remain immutable and static previews retain their current position', () => {
  const asteroid = { x: 420, y: 100, radius: 12, vx: -123.75 }
  assert.equal(getAsteroidXAt(asteroid, 10000), 420)
  assert.equal(getRenderAsteroidXAt(asteroid, -1000), 420)
  assert.equal(asteroid.motionBaseAt, undefined)
  assert.equal(anchorAsteroidMotion(asteroid, 250), asteroid)
  close(getAsteroidXAt(asteroid, 1250), 296.25)
  asteroid.x = 390
  anchorAsteroidMotion(asteroid, 900)
  assert.equal(asteroid.motionBaseX, 420)
  assert.equal(asteroid.motionBaseAt, 250)
  close(getRenderAsteroidXAt(asteroid, 1250), 296.25)
})

test('sparse materialization matches stepped motion, spawn neighborhoods and grid membership', () => {
  for (const wristSide of ['left', 'right']) {
    const direction = wristSide === 'left' ? -1 : 1
    const fixtures = [
      { id: 'ordinary', x: 230, y: 180, radius: 13, vx: direction * 137.375 },
      { id: 'fast', x: wristSide === 'left' ? 470 : 10, y: 310, radius: 18, vx: direction * 7800 },
      { id: 'edge', x: wristSide === 'left' ? -28 : 508, y: 90, radius: 7, vx: direction * 100 },
    ]
    const old = scene(fixtures)
    const batched = scene(fixtures, 0)
    const removed = batched.asteroids.find(asteroid => asteroid.id === 'fast')
    const oldRandom = randomSequence()
    const batchedRandom = randomSequence()
    const shipRect = createShipRect(viewport, 240, wristSide)
    for (let now = 10; now <= 400; now += 10) {
      if ([40, 170, 290].includes(now)) {
        // A spawn observes the preceding quantum before its own first move.
        materializeAsteroidsAt(batched.asteroids, now - 10, viewport, batched.grid)
        for (const [world, random] of [[old, oldRandom], [batched, batchedRandom]]) {
          const asteroid = createAsteroid({ id: `spawn-${now}`, viewport,
            difficulty: 1 + now / 1000, shipRect, asteroids: world.asteroids,
            grid: world.grid, wristSide, random })
          if (world === batched) anchorAsteroidMotion(asteroid, now - 10)
          world.asteroids.push(asteroid)
          addAsteroidToCollisionGrid(asteroid, world.grid)
        }
        const actualSpawn = batched.asteroids.at(-1)
        const expectedSpawn = old.asteroids.at(-1)
        for (const field of ['x', 'y', 'radius', 'vx']) {
          assert.equal(actualSpawn[field], expectedSpawn[field], `${wristSide} spawn ${now} ${field}`)
        }
      }
      advanceAsteroidsInCollisionGrid(old.asteroids, 0.01, viewport, old.grid, true)
      if ([30, 90, 160, 250, 400].includes(now)) {
        assert.equal(materializeAsteroidsAt(batched.asteroids, now, viewport, batched.grid), batched.asteroids)
        assertMatchingScene(batched, old)
      }
    }
    assert.equal(removed.motionRemoved, true)
    assert.equal(removed.gridSliceIndex, -1)
  }
})

test('the final canonical sweep survives pruning in either direction and stale references are ignored', () => {
  for (const [startX, vx] of [[-20, -2000], [500, 2000]]) {
    const world = scene([{ id: 'edge', x: startX, y: 240, radius: 7, vx }], 0)
    const asteroid = world.asteroids[0]
    const references = [asteroid]
    materializeAsteroidsAt(world.asteroids, 10, viewport, world.grid)
    assert.equal(world.asteroids.length, 1, 'retain the sweep crossing the prune boundary')
    materializeAsteroidsAt(world.asteroids, 20, viewport, world.grid)
    assert.equal(world.asteroids.length, 0)
    assert.equal(asteroid.motionRemoved, true)
    const x = asteroid.x
    assert.equal(advanceFrameCollisionCandidates(references, 100), references)
    assert.equal(asteroid.x, x, 'a removed candidate must not be animated again')
    const out = [asteroid]
    assert.equal(collectCollisionCandidatesFromList(references, { x: -1000, y: 0, w: 2000, h: 480 }, 'left', out), out)
    assert.deepEqual(out, [])
  }
})

test('materialization relocates stale grid membership across multiple slices and vertical buckets', () => {
  const world = scene([{ id: 'mover', x: 450, y: 20, radius: 11, vx: -1500 }], 0)
  const asteroid = world.asteroids[0]
  asteroid.y = 400
  const oldSlice = asteroid.gridSliceIndex
  const oldBucket = asteroid.gridBucketIndex
  materializeAsteroidsAt(world.asteroids, 200, viewport, world.grid)
  assert.notEqual(asteroid.gridSliceIndex, oldSlice)
  assert.notEqual(asteroid.gridBucketIndex, oldBucket)
  assert.deepEqual(world.grid.slices[oldSlice][oldBucket], [])
  assert.deepEqual(world.grid.slices[asteroid.gridSliceIndex][asteroid.gridBucketIndex], [asteroid])
  assert.equal(asteroid.gridSlotIndex, 0)
  close(world.grid.maxDisplacement, 15)
})

test('noncandidate motion stays lazy until materialization and repeated materialization never duplicates grid entries', () => {
  const ship = createShipRect(viewport, 240, 'left')
  const world = scene([
    { id: 'near', x: ship.centerX, y: ship.centerY, radius: 12, vx: -1 },
    { id: 'far', x: 450, y: 20, radius: 12, vx: -100 },
  ])
  const far = world.asteroids[1]
  const candidates = collectFrameCollisionCandidates(world.asteroids, ship, 0, 100)
  assert.deepEqual(candidates.map(asteroid => asteroid.id), ['near'])
  for (let now = 10; now <= 100; now += 10) advanceFrameCollisionCandidates(candidates, now)
  assert.equal(far.x, 450)
  assert.equal(far.previousX, undefined)
  close(getAsteroidXAt(far, 100), 440)
  materializeAsteroidsAt(world.asteroids, 100, viewport, world.grid)
  close(far.x, 440)
  const before = gridIds(world.grid)
  materializeAsteroidsAt(world.asteroids, 100, viewport, world.grid)
  assert.deepEqual(gridIds(world.grid), before)
  const count = world.grid.slices.reduce((sum, slice) => sum + slice.reduce((subtotal, bucket) => subtotal + bucket.length, 0), 0)
  assert.equal(count, 2)
  assert.equal(far.motionBaseX, 450)
  assert.equal(far.motionBaseAt, 0)
})

test('whole-frame candidate selection covers both wrists, fast crossings and arbitrary vertical reversals', () => {
  for (const wristSide of ['left', 'right']) {
    const geometry = createShipGeometry(viewport, wristSide)
    const ship = createShipRect(viewport, 240, wristSide, {}, geometry)
    const world = scene([
      { id: 'fast-left', x: ship.x + 250, y: geometry.limits.min, radius: 7, vx: -6000 },
      { id: 'fast-right', x: ship.x - 250, y: geometry.limits.max, radius: 18, vx: 6000 },
      { id: 'stationary', x: ship.centerX, y: 240, radius: 13, vx: 0 },
      { id: 'away', x: 460, y: 240, radius: 18, vx: 100 },
    ])
    const candidates = []
    assert.equal(collectFrameCollisionCandidates(world.asteroids, ship, 0, 100, candidates), candidates)
    assert.equal(candidates.some(asteroid => asteroid.id === 'away'), false)
    const included = new Set(candidates)
    const out = []
    let previous = ship
    for (let now = 10; now <= 100; now += 10) {
      const centerY = now <= 30 ? geometry.limits.min : now <= 60 ? geometry.limits.max : 240
      const current = createShipRect(viewport, centerY, wristSide, {}, geometry)
      advanceAsteroidsInCollisionGrid(world.asteroids, 0.01, viewport, world.grid, true)
      const reference = collectCollisionCandidatesFromGrid(world.grid, current, wristSide, [], previous)
      for (const asteroid of reference) assert.ok(included.has(asteroid), `${wristSide} missed ${asteroid.id} at ${now}`)
      assert.equal(advanceFrameCollisionCandidates(candidates, now), candidates)
      assert.equal(collectCollisionCandidatesFromList(candidates, current, wristSide, out, previous), out)
      assert.deepEqual(out.map(asteroid => asteroid.id).sort(), reference.map(asteroid => asteroid.id).sort())
      previous = current
    }
  }
})

test('inclusive frame bounds retain tangency while precise collision preserves strict near-tangent results', () => {
  const ship = createShipRect(viewport, 240, 'left')
  const touching = { x: ship.x - 7, y: -1000, radius: 7, vx: 0 }
  assert.deepEqual(collectFrameCollisionCandidates([touching], ship, 0, 100), [touching], 'vertical position must not restrict frame candidates')
  for (const [offset, expectedHit] of [[-0.000001, true], [0, false], [0.000001, false]]) {
    const start = { id: 'tangent', x: ship.x - 12, y: ship.y - 7 - offset, radius: 7, vx: 2400, lastHitAt: -Infinity }
    const old = scene([start])
    const batched = scene([start], 0)
    const candidates = collectFrameCollisionCandidates(batched.asteroids, ship, 0, 10)
    advanceAsteroidsInCollisionGrid(old.asteroids, 0.01, viewport, old.grid, true)
    advanceFrameCollisionCandidates(candidates, 10)
    const oldResult = calculateCollisionResult({ shipRect: ship, asteroid: old.asteroids[0], now: 10 })
    const result = calculateCollisionResult({ shipRect: ship, asteroid: candidates[0], now: 10 })
    assert.equal(oldResult.hit, expectedHit, `independent vertex-tangency oracle at ${offset}`)
    assert.equal(result.hit, expectedHit)
    assert.equal(result.damage, oldResult.damage)
    close(result.overlapRatio, oldResult.overlapRatio)
  }
})

test('a newly spawned object gets its first canonical sweep without waiting for the next frame scan', () => {
  for (const wristSide of ['left', 'right']) {
    const ship = createShipRect(viewport, 240, wristSide)
    const candidates = collectFrameCollisionCandidates([], ship, 0, 100)
    const asteroid = { id: 'new', x: ship.x + ship.w + 30, y: ship.centerY,
      radius: 13, vx: -10000, lastHitAt: -Infinity }
    const old = scene([asteroid])
    anchorAsteroidMotion(asteroid, 90)
    candidates.push(asteroid)
    advanceFrameCollisionCandidates(candidates, 100)
    advanceAsteroidsInCollisionGrid(old.asteroids, 0.01, viewport, old.grid, true)
    assert.equal(asteroid.previousX, ship.x + ship.w + 30)
    close(asteroid.x, old.asteroids[0].x)
    const actual = calculateCollisionResult({ shipRect: ship, asteroid, now: 100 })
    const expected = calculateCollisionResult({ shipRect: ship, asteroid: old.asteroids[0], now: 100 })
    assert.equal(actual.hit, true, 'the first sweep crosses the ship completely')
    assert.deepEqual(actual, expected)
  }
})

test('candidate-only stepping preserves cooldown damage times and fatal quantum against full updates', () => {
  const geometry = createShipGeometry(viewport, 'left')
  const fixtures = [
    { id: 'contact', x: 181, y: 240, radius: 18, vx: -2 },
    { id: 'irrelevant', x: 440, y: 80, radius: 7, vx: -12 },
  ]
  const old = scene(fixtures)
  const batched = scene(fixtures, 0)
  const candidates = collectFrameCollisionCandidates(batched.asteroids, createShipRect(viewport, 240, 'left'), 0, 800)
  assert.equal(candidates.length, 1)
  const traces = [[], []]
  const health = [30, 30]
  let previous = createShipRect(viewport, 240, 'left', {}, geometry)
  for (let now = 10; now <= 800; now += 10) {
    // Rounded positions, reversals and a return to the same contact lane.
    const centerY = now < 100 ? 240 : now < 180 ? 243 : 240
    const current = createShipRect(viewport, centerY, 'left', {}, geometry)
    advanceAsteroidsInCollisionGrid(old.asteroids, 0.01, viewport, old.grid, true)
    advanceFrameCollisionCandidates(candidates, now)
    const lists = [collectCollisionCandidatesFromGrid(old.grid, current, 'left', [], previous),
      collectCollisionCandidatesFromList(candidates, current, 'left', [], previous)]
    for (let side = 0; side < 2; side += 1) {
      for (const asteroid of lists[side]) {
        const result = calculateCollisionResult({ shipRect: current, previousShipRect: previous, asteroid, now })
        if (result.hit) {
          traces[side].push([now, asteroid.id, result.damage])
          asteroid.lastHitAt = now
          health[side] -= result.damage
        }
      }
    }
    assert.equal(health[1], health[0])
    if (health[0] <= 0) break
    previous = current
  }
  assert.deepEqual(traces[1], traces[0])
  assert.deepEqual(traces[0].map(entry => entry[0]), [10, 270, 530])
  assert.ok(health[0] <= 0, 'fatal damage remains at the third canonical contact')
})

test('render interpolation preserves endpoints, legal bounds and reusable storage without world mutation', () => {
  for (const wristSide of ['left', 'right']) {
    const geometry = createShipGeometry(viewport, wristSide)
    const previous = createShipRect(viewport, geometry.limits.min, wristSide, {}, geometry)
    const current = createShipRect(viewport, geometry.limits.max, wristSide, {}, geometry)
    const beforePrevious = JSON.stringify(previous)
    const beforeCurrent = JSON.stringify(current)
    const target = interpolateShipRect(previous, current, 0)
    assert.deepEqual(target, previous)
    const points = target.points
    const vertices = points.slice()
    for (const alpha of [0.125, 0.333, 0.5, 0.875, 1]) {
      assert.equal(interpolateShipRect(previous, current, alpha, target), target)
      assert.equal(target.points, points)
      assert.ok(target.centerY >= geometry.limits.min && target.centerY <= geometry.limits.max)
      close(target.y, previous.y + (current.y - previous.y) * alpha)
      for (let index = 0; index < vertices.length; index += 1) assert.equal(points[index], vertices[index])
    }
    assert.deepEqual(target, current)
    interpolateShipRect(previous, current, 0.333, target)
    assert.notEqual(target.y, Math.round(target.y), 'rendering must retain fractional motion')
    assert.equal(JSON.stringify(previous), beforePrevious)
    assert.equal(JSON.stringify(current), beforeCurrent)
    assert.equal(interpolateShipRect(previous, current, -1, target).y, previous.y)
    assert.equal(interpolateShipRect(previous, current, 2, target).y, current.y)
  }
})
