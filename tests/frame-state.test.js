import test from 'node:test'
import assert from 'node:assert/strict'
import {
  collectSpawnScene, commitSceneFrame, prepareFractionalFrame,
} from '../zepp-app/shared/frame-state.js'
import {
  anchorAsteroidMotion, collectSpawnNeighborhood, createAsteroid, createShipRect, createSpawnNeighborhood,
  materializeAsteroidsAt,
} from '../zepp-app/shared/game-core.js'
import { seededRandom } from './support/canonical-game-driver.js'

const viewport = { width: 480, height: 480, isRound: true }
const frame = () => ({ asteroidCount: 0, asteroids: [] })
const body = (id, x, vx = 0) => anchorAsteroidMotion(
  { id, x, vx, y: 240, radius: 8, lastHitAt: -Infinity, presentation: { view: null } }, 0)

test('scene commits stable survivors with strict edges and opposite-side sweeps', () => {
  const leftEdge = body('left-edge', -32)
  const rightEdge = body('right-edge', 512)
  const nearExit = body('near-exit', -31, -200)
  const crossing = body('crossing', -100, 70000)
  const middle = body('middle', 225)
  const alreadyRemoved = body('already-removed', 240)
  alreadyRemoved.motionRemoved = true
  const bodies = [leftEdge, nearExit, alreadyRemoved, crossing, rightEdge, middle]
  const retired = []
  const image = frame()
  commitSceneFrame(bodies, 10, 6, viewport, image, retired)
  assert.deepEqual(bodies, [nearExit, crossing, middle])
  assert.deepEqual(retired, [leftEdge.presentation, rightEdge.presentation])
  assert.ok(leftEdge.motionRemoved && rightEdge.motionRemoved)
  assert.deepEqual(image.asteroids.map(entry => entry.id), ['near-exit', 'crossing', 'middle'])
  assert.equal(image.asteroids[1].presentation, crossing.presentation)
  bodies.push(leftEdge)
  commitSceneFrame(bodies, 20, 19, viewport, image, retired)
  assert.deepEqual(bodies, [middle])
  assert.deepEqual(retired, [leftEdge.presentation, rightEdge.presentation, nearExit.presentation, crossing.presentation])
  assert.equal(image.asteroidCount, 1)
  assert.equal(image.asteroids[1].presentation, null)
})

test('fractional frames reuse entries and preserve canonical positions, membership and cooldown', () => {
  const active = body('active', 400, -100)
  const bodies = [active]
  const retired = []
  const image = frame()
  commitSceneFrame(bodies, 20, 16, viewport, image, retired)
  assert.equal(active.x, 398)
  assert.equal(image.asteroids[0].x, 398.4)
  const entry = image.asteroids[0]
  const state = structuredClone(bodies)
  prepareFractionalFrame(bodies, 18, image)
  assert.equal(image.asteroids[0], entry)
  assert.equal(entry.x, 398.2)
  assert.deepEqual(bodies, state)
  assert.deepEqual(retired, [])
})

test('fatal commit finalizes positions and retirement without publishing an image', () => {
  const survivor = body('survivor', 320, -100)
  const departing = body('departing', -30, -1000)
  const bodies = [survivor, departing]
  const image = frame()
  prepareFractionalFrame(bodies, 0, image)
  const oldImage = structuredClone(image)
  const retired = []
  commitSceneFrame(bodies, 20, 0, viewport, null, retired)
  assert.equal(survivor.x, 318)
  assert.deepEqual(bodies, [survivor])
  assert.deepEqual(retired, [departing.presentation])
  assert.deepEqual(image, oldImage)
})

test('spawn collection matches both clamped slice queries and two-birth RNG outcomes', () => {
  const grid = createSpawnNeighborhood(viewport)
  for (const wristSide of ['left', 'right']) {
    const fromRight = wristSide === 'left'
    const bodies = [-100, -30, 0, 119, 199, 216, 240, 264, 320, 450, 510, 600]
      .map((x, i) => body(String(i), x, 5 * (i - 6)))
    const legacy = structuredClone(bodies)
    materializeAsteroidsAt(legacy, 200, viewport, undefined, 10, false)
    const nearby = []
    collectSpawnScene(bodies, 200, viewport, grid, fromRight, nearby, [])
    assert.deepEqual(bodies.map(({ id, x }) => [id, x]), legacy.map(({ id, x }) => [id, x]))
    assert.deepEqual(nearby.map(({ id }) => id), collectSpawnNeighborhood(legacy, grid, fromRight, viewport).map(({ id }) => id))

    const shipRect = createShipRect(viewport, 240, wristSide)
    const random = seededRandom(101)
    const oldRandom = seededRandom(101)
    for (let i = 0; i < 2; i += 1) {
      const options = { id: `new-${i}`, viewport, difficulty: 8, shipRect, grid, wristSide }
      const newborn = createAsteroid({ ...options, nearbyAsteroids: nearby, random })
      const oldNewborn = createAsteroid({ ...options, asteroids: legacy, random: oldRandom })
      assert.deepEqual(newborn, oldNewborn)
      assert.equal(random.calls(), oldRandom.calls())
      legacy.push(oldNewborn)
      nearby.push(newborn)
    }
    const empty = createAsteroid({ id: 'empty', viewport, difficulty: 8, shipRect, wristSide, nearbyAsteroids: [],
      random: seededRandom(101) })
    assert.deepEqual(empty, createAsteroid({ id: 'empty', viewport, difficulty: 8, shipRect, wristSide, asteroids: [],
      random: seededRandom(101) }))
  }
})
