import { COLLISION_COOLDOWN_MS, HP_MAX } from './constants.js'
import { resolveTravelDirection } from './device.js'

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

export function calculateDifficulty(elapsedMs, timeScale) {
  return 1 + (elapsedMs / 1000) * timeScale
}

export function calculateFinalScore(survivedMs, settings) {
  return Math.round(survivedMs * settings.timeScale * settings.spawnMultiplier)
}

export function createScoreEntry(survivedMs, settings, timestamp = Date.now()) {
  const roundedDuration = Math.max(0, Math.round(survivedMs))

  return {
    id: `${timestamp}-${calculateFinalScore(roundedDuration, settings)}`,
    timestamp,
    survivedMs: roundedDuration,
    score: calculateFinalScore(roundedDuration, settings),
    controlMode: settings.controlMode,
    wristSide: settings.wristSide,
    timeScale: settings.timeScale,
    spawnMultiplier: settings.spawnMultiplier,
  }
}

export function createShipRect(viewport, shipCenterY, wristSide) {
  const minDimension = Math.min(viewport.width, viewport.height)
  const shipHeight = Math.round(Math.max(18, minDimension * 0.055))
  const shipWidth = Math.round(shipHeight * 1.45)
  const travelDirection = resolveTravelDirection(wristSide)
  const centerX = Math.round(
    viewport.width * (travelDirection === 'right' ? 0.36 : 0.64)
  )
  const top = Math.round(
    clamp(shipCenterY - shipHeight / 2, 14, viewport.height - shipHeight - 14)
  )
  const left = Math.round(centerX - shipWidth / 2)

  return {
    x: left,
    y: top,
    w: shipWidth,
    h: shipHeight,
    centerX: left + shipWidth / 2,
    centerY: top + shipHeight / 2,
  }
}

export function getSpawnIntervalMs(difficulty, spawnMultiplier) {
  return clamp(940 / (0.75 + difficulty * spawnMultiplier * 0.34), 150, 900)
}

function getAsteroidSpeed(difficulty, randomUnit = Math.random()) {
  return clamp(115 + difficulty * 15 + randomUnit * 40, 115, 440)
}

function getVerticalClearance(candidateY, radius, shipRect, asteroids, spawnFromRight, viewport) {
  let minClearance =
    Math.abs(candidateY - shipRect.centerY) - (radius + shipRect.h * 0.9)
  const nearbyAsteroids = asteroids.filter((asteroid) =>
    spawnFromRight ? asteroid.x > viewport.width * 0.55 : asteroid.x < viewport.width * 0.45
  )

  for (const asteroid of nearbyAsteroids) {
    const asteroidClearance =
      Math.abs(candidateY - asteroid.y) - (radius + asteroid.radius + 12)
    minClearance = Math.min(minClearance, asteroidClearance)
  }

  return minClearance
}

export function chooseSpawnY({
  viewport,
  shipRect,
  asteroids,
  radius,
  wristSide,
  random = Math.random,
}) {
  const spawnFromRight = resolveTravelDirection(wristSide) === 'right'
  const minY = radius + 18
  const maxY = viewport.height - radius - 18
  let bestY = shipRect.centerY
  let bestScore = Number.NEGATIVE_INFINITY

  for (let index = 0; index < 8; index += 1) {
    const candidateY = minY + random() * (maxY - minY)
    const score =
      getVerticalClearance(
        candidateY,
        radius,
        shipRect,
        asteroids,
        spawnFromRight,
        viewport
      ) + random() * 4

    if (score > bestScore) {
      bestScore = score
      bestY = candidateY
    }
  }

  return Math.round(clamp(bestY, minY, maxY))
}

export function createAsteroid({
  id,
  viewport,
  difficulty,
  shipRect,
  asteroids,
  wristSide,
  random = Math.random,
}) {
  const minDimension = Math.min(viewport.width, viewport.height)
  const radius = Math.round(
    clamp(minDimension * (0.02 + random() * 0.02) + difficulty * 0.06, 7, 18)
  )
  const spawnFromRight = resolveTravelDirection(wristSide) === 'right'
  const x = spawnFromRight ? viewport.width + radius + 8 : -radius - 8
  const speed = getAsteroidSpeed(difficulty, random())
  const y = chooseSpawnY({
    viewport,
    shipRect,
    asteroids,
    radius,
    wristSide,
    random,
  })

  return {
    id,
    x,
    y,
    radius,
    vx: spawnFromRight ? -speed : speed,
    lastHitAt: 0,
  }
}

export function moveAsteroids(asteroids, deltaSeconds) {
  return asteroids.map((asteroid) => ({
    ...asteroid,
    x: asteroid.x + asteroid.vx * deltaSeconds,
  }))
}

export function pruneAsteroids(asteroids, viewport) {
  return asteroids.filter(
    (asteroid) =>
      asteroid.x + asteroid.radius > -24 &&
      asteroid.x - asteroid.radius < viewport.width + 24
  )
}

export function advanceAsteroidsInPlace(asteroids, deltaSeconds, viewport) {
  let writeIndex = 0

  for (let index = 0; index < asteroids.length; index += 1) {
    const asteroid = asteroids[index]
    asteroid.x += asteroid.vx * deltaSeconds

    if (
      asteroid.x + asteroid.radius > -24 &&
      asteroid.x - asteroid.radius < viewport.width + 24
    ) {
      asteroids[writeIndex] = asteroid
      writeIndex += 1
    }
  }

  asteroids.length = writeIndex
  return asteroids
}

function intersectionArea(leftRect, rightRect) {
  const left = Math.max(leftRect.x, rightRect.x)
  const top = Math.max(leftRect.y, rightRect.y)
  const right = Math.min(leftRect.x + leftRect.w, rightRect.x + rightRect.w)
  const bottom = Math.min(leftRect.y + leftRect.h, rightRect.y + rightRect.h)

  if (right <= left || bottom <= top) {
    return 0
  }

  return (right - left) * (bottom - top)
}

export function calculateCollisionResult({
  shipRect,
  asteroid,
  difficulty,
  now,
  cooldownMs = COLLISION_COOLDOWN_MS,
}) {
  if (now - asteroid.lastHitAt < cooldownMs) {
    return { hit: false, damage: 0, overlapRatio: 0 }
  }

  const asteroidRect = {
    x: asteroid.x - asteroid.radius,
    y: asteroid.y - asteroid.radius,
    w: asteroid.radius * 2,
    h: asteroid.radius * 2,
  }
  const overlapArea = intersectionArea(shipRect, asteroidRect)

  if (overlapArea <= 0) {
    return { hit: false, damage: 0, overlapRatio: 0 }
  }

  const shipArea = shipRect.w * shipRect.h
  const asteroidArea = asteroidRect.w * asteroidRect.h
  const overlapRatio = clamp(
    overlapArea / Math.min(shipArea, asteroidArea),
    0,
    1.35
  )
  const sizeFactor = clamp(asteroid.radius / (shipRect.h * 0.55), 0.75, 2.4)
  const difficultyFactor = 1 + Math.min((difficulty - 1) * 0.012, 0.9)
  const damage = Math.round(
    clamp(7 + overlapRatio * 28 * sizeFactor * difficultyFactor, 7, HP_MAX)
  )

  return {
    hit: true,
    damage,
    overlapRatio,
  }
}
