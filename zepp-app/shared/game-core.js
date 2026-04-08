import {
  COLLISION_BUCKET_HEIGHT,
  COLLISION_GRID_PADDING,
  COLLISION_SLICE_WIDTH,
  ASTEROID_DAMAGE_MAX,
  ASTEROID_DAMAGE_MIN,
  ASTEROID_RADIUS_MAX,
  ASTEROID_RADIUS_MIN,
  COLLISION_COOLDOWN_MS,
} from './constants.js'
import { resolveTravelDirection } from './device.js'

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

export function calculateDifficulty(elapsedMs, timeScale) {
  return 1 + (elapsedMs / 1000) * timeScale * 0.55
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
  return 1180 / (0.92 + difficulty * spawnMultiplier * 0.11)
}

function getAsteroidSpeed(difficulty, randomUnit = Math.random()) {
  return 96 + difficulty * 9 + randomUnit * 28
}

function getAsteroidDamage(radius) {
  const normalizedRadius = clamp(
    (radius - ASTEROID_RADIUS_MIN) / (ASTEROID_RADIUS_MAX - ASTEROID_RADIUS_MIN),
    0,
    1
  )

  return Math.round(
    ASTEROID_DAMAGE_MIN +
      normalizedRadius * (ASTEROID_DAMAGE_MAX - ASTEROID_DAMAGE_MIN)
  )
}

function getSpawnNearbyAsteroids(asteroids, grid, spawnFromRight, viewport) {
  if (!grid) {
    const nearby = []
    for (let index = 0; index < asteroids.length; index += 1) {
      const asteroid = asteroids[index]
      const isNearby = spawnFromRight
        ? asteroid.x > viewport.width * 0.55
        : asteroid.x < viewport.width * 0.45
      if (isNearby) {
        nearby.push(asteroid)
      }
    }
    return nearby
  }

  const nearby = []
  const minSlice = spawnFromRight
    ? getCollisionSliceIndex(viewport.width * 0.55, grid)
    : 0
  const maxSlice = spawnFromRight
    ? grid.sliceCount - 1
    : getCollisionSliceIndex(viewport.width * 0.45, grid)

  for (let sliceIndex = minSlice; sliceIndex <= maxSlice; sliceIndex += 1) {
    const slice = grid.slices[sliceIndex]
    for (let bucketIndex = 0; bucketIndex < grid.bucketCount; bucketIndex += 1) {
      const bucket = slice[bucketIndex]
      for (let index = 0; index < bucket.length; index += 1) {
        nearby.push(bucket[index])
      }
    }
  }

  return nearby
}

function getVerticalClearance(candidateY, radius, shipRect, asteroids) {
  let minClearance = Number.POSITIVE_INFINITY
  for (let index = 0; index < asteroids.length; index += 1) {
    const asteroid = asteroids[index]
    const asteroidClearance =
      Math.abs(candidateY - asteroid.y) - (radius + asteroid.radius + 12)
    minClearance = Math.min(minClearance, asteroidClearance)
  }

  return minClearance === Number.POSITIVE_INFINITY ? 24 : minClearance
}

export function chooseSpawnY({
  viewport,
  shipRect,
  asteroids,
  grid,
  radius,
  wristSide,
  random = Math.random,
}) {
  const spawnFromRight = resolveTravelDirection(wristSide) === 'right'
  const nearbyAsteroids = getSpawnNearbyAsteroids(
    asteroids,
    grid,
    spawnFromRight,
    viewport
  )
  const minY = -radius / 2
  const maxY = viewport.height + radius / 2
  const challengeBandHalfHeight = Math.max(
    radius + shipRect.h * 0.85,
    viewport.height * 0.12
  )
  let bestY = shipRect.centerY
  let bestScore = Number.NEGATIVE_INFINITY

  for (let index = 0; index < 8; index += 1) {
    const candidateY =
      index === 0
        ? shipRect.centerY
        : index < 5
        ? clamp(
            shipRect.centerY +
              (random() * 2 - 1) * challengeBandHalfHeight,
            minY,
            maxY
          )
        : minY + random() * (maxY - minY)
    const clearance = getVerticalClearance(
      candidateY,
      radius,
      shipRect,
      nearbyAsteroids
    )
    const distanceFromShip = Math.abs(candidateY - shipRect.centerY)
    const laneBias = Math.max(0, challengeBandHalfHeight - distanceFromShip) * 0.9
    const clearanceScore =
      clearance < 0 ? clearance * 3.5 : Math.min(clearance, 18)
    const score = laneBias + clearanceScore + random() * 2

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
  grid,
  wristSide,
  random = Math.random,
}) {
  const minDimension = Math.min(viewport.width, viewport.height)
  const radius = Math.round(
    clamp(
      minDimension * (0.02 + random() * 0.02) + difficulty * 0.06,
      ASTEROID_RADIUS_MIN,
      ASTEROID_RADIUS_MAX
    )
  )
  const spawnFromRight = resolveTravelDirection(wristSide) === 'right'
  const x = spawnFromRight ? viewport.width + radius + 8 : -radius - 8
  const speed = getAsteroidSpeed(difficulty, random())
  const y = chooseSpawnY({
    viewport,
    shipRect,
    asteroids,
    grid,
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

export function isAsteroidInCollisionBand(asteroid, shipRect, wristSide) {
  if (asteroid.y + asteroid.radius < shipRect.y) {
    return false
  }

  if (asteroid.y - asteroid.radius > shipRect.y + shipRect.h) {
    return false
  }

  const travelDirection = resolveTravelDirection(wristSide)
  if (travelDirection === 'right') {
    if (asteroid.x + asteroid.radius < shipRect.x) {
      return false
    }

    return asteroid.x - asteroid.radius <= shipRect.x + shipRect.w + ASTEROID_RADIUS_MAX
  }

  if (asteroid.x - asteroid.radius > shipRect.x + shipRect.w) {
    return false
  }

  return asteroid.x + asteroid.radius >= shipRect.x - ASTEROID_RADIUS_MAX
}

export function createCollisionGrid(
  viewport,
  sliceWidth = COLLISION_SLICE_WIDTH,
  bucketHeight = COLLISION_BUCKET_HEIGHT,
  padding = COLLISION_GRID_PADDING
) {
  const sliceCount = Math.max(
    1,
    Math.ceil((viewport.width + padding * 2) / sliceWidth)
  )
  const bucketCount = Math.max(
    1,
    Math.ceil((viewport.height + padding * 2) / bucketHeight)
  )

  return {
    sliceWidth,
    bucketHeight,
    padding,
    sliceCount,
    bucketCount,
    slices: Array.from({ length: sliceCount }, () =>
      Array.from({ length: bucketCount }, () => [])
    ),
  }
}

export function getCollisionSliceIndex(x, grid) {
  return clamp(
    Math.floor((x + grid.padding) / grid.sliceWidth),
    0,
    grid.sliceCount - 1
  )
}

export function getCollisionBucketIndex(y, grid) {
  return clamp(
    Math.floor((y + grid.padding) / grid.bucketHeight),
    0,
    grid.bucketCount - 1
  )
}

export function addAsteroidToCollisionGrid(asteroid, grid) {
  const sliceIndex = getCollisionSliceIndex(asteroid.x, grid)
  const bucketIndex = getCollisionBucketIndex(asteroid.y, grid)
  const bucket = grid.slices[sliceIndex][bucketIndex]

  asteroid.gridSliceIndex = sliceIndex
  asteroid.gridBucketIndex = bucketIndex
  asteroid.gridSlotIndex = bucket.length
  bucket.push(asteroid)
  return asteroid
}

export function removeAsteroidFromCollisionGrid(asteroid, grid) {
  const slice = grid.slices[asteroid.gridSliceIndex]
  const bucket = slice?.[asteroid.gridBucketIndex]
  if (!bucket) {
    return
  }

  const lastAsteroid = bucket.pop()
  if (lastAsteroid && lastAsteroid !== asteroid) {
    bucket[asteroid.gridSlotIndex] = lastAsteroid
    lastAsteroid.gridSlotIndex = asteroid.gridSlotIndex
  }

  asteroid.gridSliceIndex = -1
  asteroid.gridBucketIndex = -1
  asteroid.gridSlotIndex = -1
}

export function advanceAsteroidsInCollisionGrid(
  asteroids,
  deltaSeconds,
  viewport,
  grid
) {
  let writeIndex = 0

  for (let index = 0; index < asteroids.length; index += 1) {
    const asteroid = asteroids[index]
    asteroid.x += asteroid.vx * deltaSeconds

    if (
      asteroid.x + asteroid.radius <= -24 ||
      asteroid.x - asteroid.radius >= viewport.width + 24
    ) {
      removeAsteroidFromCollisionGrid(asteroid, grid)
      continue
    }

    const nextSliceIndex = getCollisionSliceIndex(asteroid.x, grid)
    if (nextSliceIndex !== asteroid.gridSliceIndex) {
      removeAsteroidFromCollisionGrid(asteroid, grid)
      addAsteroidToCollisionGrid(asteroid, grid)
    }

    asteroids[writeIndex] = asteroid
    writeIndex += 1
  }

  asteroids.length = writeIndex
  return asteroids
}

export function collectCollisionCandidatesFromGrid(
  grid,
  shipRect,
  wristSide,
  candidates = []
) {
  candidates.length = 0

  const travelDirection = resolveTravelDirection(wristSide)
  const minSlice = getCollisionSliceIndex(
    travelDirection === 'right'
      ? shipRect.x
      : shipRect.x - ASTEROID_RADIUS_MAX,
    grid
  )
  const maxSlice = getCollisionSliceIndex(
    travelDirection === 'right'
      ? shipRect.x + shipRect.w + ASTEROID_RADIUS_MAX
      : shipRect.x + shipRect.w,
    grid
  )
  const minBucket = getCollisionBucketIndex(shipRect.y - ASTEROID_RADIUS_MAX, grid)
  const maxBucket = getCollisionBucketIndex(
    shipRect.y + shipRect.h + ASTEROID_RADIUS_MAX,
    grid
  )

  for (let sliceIndex = minSlice; sliceIndex <= maxSlice; sliceIndex += 1) {
    const slice = grid.slices[sliceIndex]
    for (let bucketIndex = minBucket; bucketIndex <= maxBucket; bucketIndex += 1) {
      const bucket = slice[bucketIndex]
      for (let index = 0; index < bucket.length; index += 1) {
        const asteroid = bucket[index]
        if (isAsteroidInCollisionBand(asteroid, shipRect, wristSide)) {
          candidates.push(asteroid)
        }
      }
    }
  }

  return candidates
}

export function advanceAsteroidsAndCollectCollisionCandidates(
  asteroids,
  deltaSeconds,
  viewport,
  shipRect,
  wristSide,
  candidates = [],
  grid = createCollisionGrid(viewport)
) {
  for (let index = 0; index < asteroids.length; index += 1) {
    const asteroid = asteroids[index]
    if (typeof asteroid.gridSliceIndex !== 'number' || asteroid.gridSliceIndex < 0) {
      addAsteroidToCollisionGrid(asteroid, grid)
    }
  }

  advanceAsteroidsInCollisionGrid(asteroids, deltaSeconds, viewport, grid)
  return collectCollisionCandidatesFromGrid(grid, shipRect, wristSide, candidates)
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

function getCircleRectOverlapRatio(shipRect, asteroid) {
  const nearestX = clamp(
    asteroid.x,
    shipRect.x,
    shipRect.x + shipRect.w
  )
  const nearestY = clamp(
    asteroid.y,
    shipRect.y,
    shipRect.y + shipRect.h
  )
  const dx = asteroid.x - nearestX
  const dy = asteroid.y - nearestY
  const distanceSquared = dx * dx + dy * dy
  const radiusSquared = asteroid.radius * asteroid.radius

  if (distanceSquared > radiusSquared) {
    return 0
  }

  return clamp(1 - distanceSquared / radiusSquared, 0, 1)
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
  if (intersectionArea(shipRect, asteroidRect) <= 0) {
    return { hit: false, damage: 0, overlapRatio: 0 }
  }
  const overlapRatio = getCircleRectOverlapRatio(shipRect, asteroid)
  if (overlapRatio <= 0) {
    return { hit: false, damage: 0, overlapRatio: 0 }
  }

  return {
    hit: true,
    damage: getAsteroidDamage(asteroid.radius),
    overlapRatio,
  }
}
