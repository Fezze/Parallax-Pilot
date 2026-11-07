import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addAsteroidToCollisionGrid,
  anchorAsteroidMotion,
  chooseSpawnY,
  collectSpawnNeighborhood,
  createAsteroid,
  createCollisionGrid,
  createShipRect,
  createSpawnNeighborhood,
  getCollisionSliceIndex,
  materializeAsteroidsAt,
} from '../zepp-app/shared/game-core.js'

const viewports = [416, 454, 466, 480].map(width => ({ width, height: width }))
viewports.push({ width: 390, height: 450 })

function seededRandom(seed) {
  let state = seed
  let calls = 0
  const random = () => {
    calls += 1
    state = (state * 16807) % 2147483647
    return (state - 1) / 2147483646
  }
  random.calls = () => calls
  return random
}

function gridNeighbors(grid, viewport, fromRight) {
  const first = fromRight ? getCollisionSliceIndex(viewport.width * 0.55, grid) : 0
  const last = fromRight ? grid.sliceCount - 1 : getCollisionSliceIndex(viewport.width * 0.45, grid)
  const result = []
  for (let slice = first; slice <= last; slice += 1) {
    for (const bucket of grid.slices[slice]) result.push(...bucket)
  }
  return result
}

function edgeAsteroids(viewport, layout) {
  const xs = [-10000, 10000, -24, viewport.width + 24, viewport.width * 0.45, viewport.width * 0.55]
  for (let cell = 0; cell <= layout.sliceCount; cell += 1) {
    const edge = cell * layout.sliceWidth - layout.padding
    xs.push(edge - 1e-7, edge, edge + 1e-7)
  }
  return xs.map((x, index) => ({ id: `edge-${index}`, x,
    y: [-40, 0, 40, viewport.height / 2, viewport.height, viewport.height + 40][index % 6],
    radius: 7 + index % 17, vx: index % 2 ? 180 : -180, lastHitAt: 0 }))
}

function identities(asteroids) {
  return asteroids.map(asteroid => asteroid.id).sort()
}

test('flat spawn neighborhoods match real grid slice membership at exact boundaries and clamped extremes', () => {
  for (const viewport of viewports) {
    for (const sliceWidth of [undefined, 37, viewport.width * 2]) {
      const grid = createCollisionGrid(viewport, sliceWidth)
      const layout = createSpawnNeighborhood(viewport, sliceWidth)
      assert.deepEqual(Object.keys(layout).sort(), ['padding', 'sliceCount', 'sliceWidth'])
      assert.equal(layout.sliceCount, grid.sliceCount)
      const asteroids = edgeAsteroids(viewport, layout)
      for (const asteroid of asteroids) addAsteroidToCollisionGrid(asteroid, grid)
      for (const fromRight of [false, true]) {
        const actual = collectSpawnNeighborhood(asteroids, layout, fromRight, viewport)
        assert.deepEqual(identities(actual), identities(gridNeighbors(grid, viewport, fromRight)))
        assert.ok(actual.every(asteroid => asteroids.includes(asteroid)), 'selection preserves object identity')
      }
    }
  }
})

test('flat spawn selection preserves seeded clearance choices and RNG consumption for both wrists and every viewport', () => {
  for (const viewport of viewports) for (const wristSide of ['left', 'right']) {
    const grid = createCollisionGrid(viewport)
    const layout = createSpawnNeighborhood(viewport)
    const asteroids = edgeAsteroids(viewport, layout)
    for (const asteroid of asteroids) addAsteroidToCollisionGrid(asteroid, grid)
    // Grid traversal and reversed flat traversal intentionally differ in order.
    const reversed = asteroids.slice().reverse()
    for (const centerY of [0, viewport.height / 2, viewport.height]) {
      const shipRect = createShipRect(viewport, centerY, wristSide)
      for (const seed of [1, 42, 84733]) for (const radius of [7, 16, 24]) {
        const legacyRandom = seededRandom(seed)
        const flatRandom = seededRandom(seed)
        const input = { viewport, shipRect, radius, wristSide }
        const expected = chooseSpawnY({ ...input, asteroids, grid, random: legacyRandom })
        const actual = chooseSpawnY({ ...input, asteroids: reversed, grid: layout, random: flatRandom })
        assert.equal(actual, expected)
        assert.equal(flatRandom.calls(), 15)
        assert.equal(flatRandom.calls(), legacyRandom.calls())
      }
    }
  }
})

test('descriptor keeps near-spawn births and later pruning equivalent without any grid maintenance', () => {
  for (const viewport of viewports) for (const wristSide of ['left', 'right']) {
    const grid = createCollisionGrid(viewport)
    const layout = createSpawnNeighborhood(viewport)
    const legacy = edgeAsteroids(viewport, layout)
    const flat = legacy.map(asteroid => ({ ...asteroid }))
    for (const asteroid of legacy) {
      anchorAsteroidMotion(asteroid, 0)
      addAsteroidToCollisionGrid(asteroid, grid)
    }
    for (const asteroid of flat) anchorAsteroidMotion(asteroid, 0)
    const initialCount = flat.length
    for (const atMs of [10, 100, 1000, 4000]) {
      materializeAsteroidsAt(legacy, atMs, viewport, grid)
      materializeAsteroidsAt(flat, atMs, viewport, undefined)
      assert.deepEqual(identities(flat), identities(legacy))
      const fromRight = wristSide === 'left'
      assert.deepEqual(identities(collectSpawnNeighborhood(flat, layout, fromRight, viewport)),
        identities(gridNeighbors(grid, viewport, fromRight)))
      // A burst of births must immediately see the preceding birth's clearance.
      for (let birth = 0; birth < 3; birth += 1) {
        const legacyRandom = seededRandom(atMs + birth + 1)
        const flatRandom = seededRandom(atMs + birth + 1)
        const input = { id: `${atMs}-${birth}`, viewport, difficulty: 8,
          shipRect: createShipRect(viewport, viewport.height / 2, wristSide), wristSide }
        const expected = createAsteroid({ ...input, asteroids: legacy, grid, random: legacyRandom })
        const actual = createAsteroid({ ...input, asteroids: flat, grid: layout, random: flatRandom })
        assert.deepEqual(actual, expected)
        assert.equal(flatRandom.calls(), 17)
        assert.equal(flatRandom.calls(), legacyRandom.calls())
        anchorAsteroidMotion(expected, atMs)
        anchorAsteroidMotion(actual, atMs)
        legacy.push(expected)
        flat.push(actual)
        addAsteroidToCollisionGrid(expected, grid)
      }
    }
    assert.ok(flat.length < initialCount + 12, 'the scenario includes actual pruning')
    assert.ok(flat.every(asteroid => asteroid.gridSliceIndex === undefined), 'flat births never require grid registration')
  }
})
