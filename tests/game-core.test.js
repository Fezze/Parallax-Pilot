import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateCollisionResult,
  calculateDifficulty,
  calculateFinalScore,
  chooseSpawnY,
  createAsteroid,
  createScoreEntry,
  createShipRect,
  getSpawnIntervalMs,
} from '../zepp-app/shared/game-core.js'
import { trimScores } from '../zepp-app/shared/persistence.js'

function sequenceRandom(values) {
  let index = 0
  return () => {
    const value = values[index % values.length]
    index += 1
    return value
  }
}

test('difficulty and final score follow the planned formula', () => {
  assert.equal(calculateDifficulty(5000, 1.5), 5.125)
  assert.equal(
    calculateFinalScore(4321, {
      timeScale: 2,
      spawnMultiplier: 1.3,
    }),
    Math.round(4321 * 2 * 1.3)
  )
})

test('trimScores sorts newest-first and limits history to 100', () => {
  const scores = Array.from({ length: 130 }, (_, index) => ({
    id: String(index),
    timestamp: index,
  }))

  const trimmed = trimScores(scores)
  assert.equal(trimmed.length, 100)
  assert.equal(trimmed[0].timestamp, 129)
  assert.equal(trimmed.at(-1).timestamp, 30)
})

test('spawn y stays near the ship path when the lane is open', () => {
  const viewport = { width: 480, height: 480 }
  const shipRect = createShipRect(viewport, 240, 'left')
  const y = chooseSpawnY({
    viewport,
    shipRect,
    asteroids: [],
    radius: 20,
    wristSide: 'left',
    random: sequenceRandom([0.12, 0.18, 0.84, 0.86, 0.52, 0.9, 0.72, 0.4]),
  })

  assert.ok(Math.abs(y - shipRect.centerY) < 70)
})

test('spawn y moves off the exact ship lane when nearby asteroids already block it', () => {
  const viewport = { width: 480, height: 480 }
  const shipRect = createShipRect(viewport, 240, 'left')
  const y = chooseSpawnY({
    viewport,
    shipRect,
    asteroids: [{ x: 420, y: shipRect.centerY, radius: 24 }],
    radius: 20,
    wristSide: 'left',
    random: sequenceRandom([0.5, 0.2, 0.48, 0.4, 0.52, 0.6, 0.15, 0.8]),
  })

  assert.ok(Math.abs(y - shipRect.centerY) > 20)
})

test('collision damage depends on asteroid size and respects cooldown', () => {
  const shipRect = { x: 100, y: 100, w: 40, h: 30 }
  const smallAsteroid = { x: 120, y: 114, radius: 7, lastHitAt: 0 }
  const largeAsteroid = { x: 120, y: 114, radius: 18, lastHitAt: 0 }

  const smallResult = calculateCollisionResult({
    shipRect,
    asteroid: smallAsteroid,
    difficulty: 9,
    now: 1000,
  })
  const largeResult = calculateCollisionResult({
    shipRect,
    asteroid: largeAsteroid,
    difficulty: 9,
    now: 1000,
  })
  const cooldownBlocked = calculateCollisionResult({
    shipRect,
    asteroid: { ...largeAsteroid, lastHitAt: 900 },
    difficulty: 9,
    now: 1000,
  })

  assert.equal(smallResult.hit, true)
  assert.equal(largeResult.hit, true)
  assert.equal(smallResult.damage, 7)
  assert.equal(largeResult.damage, 13)
  assert.ok(largeResult.damage > smallResult.damage)
  assert.ok(largeResult.overlapRatio > 0)
  assert.equal(cooldownBlocked.hit, false)
})

test('circle-vs-rect collision ignores bounding-box corner false positives', () => {
  const result = calculateCollisionResult({
    shipRect: { x: 100, y: 100, w: 40, h: 30 },
    asteroid: { x: 148, y: 138, radius: 10, lastHitAt: 0 },
    difficulty: 1,
    now: 1000,
  })

  assert.deepEqual(result, {
    hit: false,
    damage: 0,
    overlapRatio: 0,
  })
})

test('spawn interval still accelerates but much more gently over time', () => {
  const early = getSpawnIntervalMs(1, 1)
  const mid = getSpawnIntervalMs(10, 1)
  const late = getSpawnIntervalMs(20, 1)

  assert.ok(early > mid)
  assert.ok(mid > late)
  assert.ok(mid > 430)
  assert.ok(late > 300)
})

test('asteroid creation respects travel direction and score entries snapshot settings', () => {
  const viewport = { width: 390, height: 450 }
  const shipRect = createShipRect(viewport, 225, 'right')
  const asteroid = createAsteroid({
    id: 'a1',
    viewport,
    difficulty: 7,
    shipRect,
    asteroids: [],
    wristSide: 'right',
    random: sequenceRandom([0.3, 0.4, 0.5, 0.6, 0.7, 0.8]),
  })
  const scoreEntry = createScoreEntry(
    3123,
    {
      controlMode: 'touch',
      wristSide: 'right',
      timeScale: 2,
      spawnMultiplier: 1.6,
    },
    5000
  )

  assert.ok(asteroid.x < 0)
  assert.ok(asteroid.vx > 0)
  assert.equal(scoreEntry.score, Math.round(3123 * 2 * 1.6))
  assert.equal(scoreEntry.controlMode, 'touch')
})
