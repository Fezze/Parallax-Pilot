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

export const ROUND_HUD_MARGIN = 12
export const HUD_STROKE_WIDTH = 8
export const SHIP_STROKE_WIDTH = 3
const SHIP_HUD_GAP = 3

function getShipDimensions(viewport, wristSide) {
  const h = Math.round(Math.max(18, Math.min(viewport.width, viewport.height) * 0.055))
  const w = Math.round(h * 1.45)
  const centerX = Math.round(viewport.width * (wristSide === 'right' ? 0.64 : 0.36))
  return { x: Math.round(centerX - w / 2), w, h }
}

export function getShipYLimits(viewport, wristSide) {
  return createShipGeometry(viewport, wristSide).limits
}

// Device size and wrist do not change during a run. Keep this work, including
// circular safe-area math, out of the fixed-step simulation hot path.
export function createShipGeometry(viewport, wristSide) {
  const { x, w, h } = getShipDimensions(viewport, wristSide)
  let top = 14
  if (viewport.isRound ?? viewport.width === viewport.height) {
    const safeRadius = Math.min(viewport.width, viewport.height) / 2 -
      ROUND_HUD_MARGIN - HUD_STROKE_WIDTH / 2 - SHIP_STROKE_WIDTH / 2 - SHIP_HUD_GAP
    const dx = Math.max(Math.abs(x - viewport.width / 2), Math.abs(x + w - viewport.width / 2))
    // Every arrow vertex (and its stroke) stays inside the HUD inner edge.
    top = Math.ceil(viewport.height / 2 - Math.sqrt(Math.max(0, safeRadius * safeRadius - dx * dx)))
  }
  return { x, w, h, wristSide, limits: { min: top + h / 2, max: viewport.height - top - h / 2 } }
}

export function updateShipPoints(points, rect, wristSide = rect.wristSide || 'left') {
  const cy = rect.y + rect.h / 2
  const right = wristSide !== 'right'
  const nose = right ? rect.x + rect.w : rect.x
  const tail = right ? rect.x : rect.x + rect.w
  points[0].x = nose
  points[0].y = cy
  points[1].x = tail
  points[1].y = rect.y
  points[2].x = rect.x + rect.w * (right ? 0.28 : 0.72)
  points[2].y = cy
  points[3].x = tail
  points[3].y = rect.y + rect.h
  points[4].x = nose
  points[4].y = cy
  return points
}

export function createShipRect(viewport, shipCenterY, wristSide, rect = {}, geometry = createShipGeometry(viewport, wristSide)) {
  const { x, w, h, limits } = geometry
  const y = Math.round(clamp(shipCenterY, limits.min, limits.max) - h / 2)
  rect.x = x
  rect.y = y
  rect.w = w
  rect.h = h
  rect.centerX = x + w / 2
  rect.centerY = y + h / 2
  rect.wristSide = wristSide
  rect.points = updateShipPoints(rect.points || Array.from({ length: 5 }, () => ({ x: 0, y: 0 })), rect)
  return rect
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

export function isAsteroidInCollisionBand(asteroid, shipRect, wristSide, previousShipRect = shipRect) {
  const left = Math.min(shipRect.x, previousShipRect.x)
  const right = Math.max(shipRect.x + shipRect.w, previousShipRect.x + previousShipRect.w)
  const top = Math.min(shipRect.y, previousShipRect.y)
  const bottom = Math.max(shipRect.y + shipRect.h, previousShipRect.y + previousShipRect.h)
  const previousX = asteroid.previousX ?? asteroid.x
  return asteroid.y + asteroid.radius >= top && asteroid.y - asteroid.radius <= bottom &&
    Math.max(asteroid.x, previousX) + asteroid.radius >= left &&
    Math.min(asteroid.x, previousX) - asteroid.radius <= right
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
  grid,
  retainSwept = false
) {
  let writeIndex = 0
  grid.maxDisplacement = 0

  for (let index = 0; index < asteroids.length; index += 1) {
    const asteroid = asteroids[index]
    asteroid.previousX = asteroid.x
    asteroid.x += asteroid.vx * deltaSeconds
    grid.maxDisplacement = Math.max(grid.maxDisplacement, Math.abs(asteroid.x - asteroid.previousX))

    if (
      (retainSwept ? Math.max(asteroid.x, asteroid.previousX) : asteroid.x) + asteroid.radius <= -24 ||
      (retainSwept ? Math.min(asteroid.x, asteroid.previousX) : asteroid.x) - asteroid.radius >= viewport.width + 24
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
  candidates = [],
  previousShipRect = shipRect
) {
  candidates.length = 0

  // Centers are indexed once: both sides need radius padding, including the
  // trailing side. Swept centers can end beyond the static query rectangle.
  const padding = ASTEROID_RADIUS_MAX + (grid.maxDisplacement || 0)
  const minSlice = getCollisionSliceIndex(Math.min(shipRect.x, previousShipRect.x) - padding, grid)
  const maxSlice = getCollisionSliceIndex(Math.max(shipRect.x + shipRect.w, previousShipRect.x + previousShipRect.w) + padding, grid)
  const minBucket = getCollisionBucketIndex(Math.min(shipRect.y, previousShipRect.y) - ASTEROID_RADIUS_MAX, grid)
  const maxBucket = getCollisionBucketIndex(Math.max(shipRect.y + shipRect.h, previousShipRect.y + previousShipRect.h) + ASTEROID_RADIUS_MAX, grid)

  for (let sliceIndex = minSlice; sliceIndex <= maxSlice; sliceIndex += 1) {
    const slice = grid.slices[sliceIndex]
    for (let bucketIndex = minBucket; bucketIndex <= maxBucket; bucketIndex += 1) {
      const bucket = slice[bucketIndex]
      for (let index = 0; index < bucket.length; index += 1) {
        const asteroid = bucket[index]
        if (isAsteroidInCollisionBand(asteroid, shipRect, wristSide, previousShipRect)) {
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

function pointSegmentDistanceSquared(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared ? clamp(((px - ax) * dx + (py - ay) * dy) / lengthSquared, 0, 1) : 0
  const x = px - ax - t * dx
  const y = py - ay - t * dy
  return x * x + y * y
}

function segmentDistanceSquared(ax, ay, bx, by, cx, cy, dx, dy) {
  const abx = bx - ax
  const aby = by - ay
  const cdx = dx - cx
  const cdy = dy - cy
  const determinant = abx * cdy - aby * cdx
  if (determinant !== 0) {
    const t = ((cx - ax) * cdy - (cy - ay) * cdx) / determinant
    const u = ((cx - ax) * aby - (cy - ay) * abx) / determinant
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0
  }
  return Math.min(
    pointSegmentDistanceSquared(ax, ay, cx, cy, dx, dy),
    pointSegmentDistanceSquared(bx, by, cx, cy, dx, dy),
    pointSegmentDistanceSquared(cx, cy, ax, ay, bx, by),
    pointSegmentDistanceSquared(dx, dy, ax, ay, bx, by)
  )
}

function isPointInsideShip(x, y, points) {
  let inside = false
  for (let i = 0; i < 4; i += 1) {
    const a = points[i]
    const b = points[i + 1]
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

export function calculateCollisionResult({
  shipRect,
  previousShipRect = shipRect,
  asteroid,
  difficulty,
  now,
  cooldownMs = COLLISION_COOLDOWN_MS,
}) {
  if (now - asteroid.lastHitAt < cooldownMs || !isAsteroidInCollisionBand(asteroid, shipRect, shipRect.wristSide, previousShipRect)) {
    return { hit: false, damage: 0, overlapRatio: 0 }
  }
  const points = shipRect.points || updateShipPoints(Array.from({ length: 5 }, () => ({ x: 0, y: 0 })), shipRect)
  // Translate the start of the circle path into the final ship's frame. The
  // ship only translates, so this handles touch, tilt and swipe continuously.
  const ax = (asteroid.previousX ?? asteroid.x) + shipRect.x - previousShipRect.x
  const ay = asteroid.y + shipRect.y - previousShipRect.y
  const bx = asteroid.x
  const by = asteroid.y
  let distanceSquared = 0
  if (!isPointInsideShip(ax, ay, points) && !isPointInsideShip(bx, by, points)) {
    distanceSquared = Infinity
    for (let i = 0; i < 4; i += 1) {
      const a = points[i]
      const b = points[i + 1]
      distanceSquared = Math.min(distanceSquared, segmentDistanceSquared(ax, ay, bx, by, a.x, a.y, b.x, b.y))
    }
  }
  const overlapRatio = clamp(1 - distanceSquared / (asteroid.radius * asteroid.radius), 0, 1)
  return overlapRatio > 0
    ? { hit: true, damage: getAsteroidDamage(asteroid.radius), overlapRatio }
    : { hit: false, damage: 0, overlapRatio: 0 }
}
