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
  const score = calculateFinalScore(roundedDuration, settings)

  return {
    id: `${timestamp}-${score}`,
    timestamp,
    survivedMs: roundedDuration,
    score,
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

// Presentation owns this rectangle. Never round or write interpolated values
// back into the canonical collision rectangles.
export function interpolateShipRect(previous, current, alpha, target = {}) {
  const amount = clamp(alpha, 0, 1)
  target.x = previous.x + (current.x - previous.x) * amount
  target.y = previous.y + (current.y - previous.y) * amount
  target.w = previous.w + (current.w - previous.w) * amount
  target.h = previous.h + (current.h - previous.h) * amount
  target.centerX = target.x + target.w / 2
  target.centerY = target.y + target.h / 2
  target.wristSide = current.wristSide
  target.points = updateShipPoints(target.points || Array.from({ length: 5 }, () => ({ x: 0, y: 0 })), target)
  return target
}

export function getSpawnIntervalMs(difficulty, spawnMultiplier) {
  return 1180 / (0.92 + difficulty * spawnMultiplier * 0.11)
}

export const SQUARE_SPAWN_INTERVAL_FACTOR = 0.84

// Return the first canonical instant satisfying the existing spawn predicate.
// A caller retaining spawn debt must still clamp this to its next unprocessed
// quantum: the old loop can already be due again after a capped spawn burst.
export function getNextSpawnQuantum(lastSpawnAt, timeScale, spawnMultiplier, isRound, stepMs = 10) {
  if (!Number.isFinite(lastSpawnAt) || lastSpawnAt < 0 ||
      !Number.isFinite(timeScale) || timeScale < 0 ||
      !Number.isFinite(spawnMultiplier) || spawnMultiplier < 0 ||
      !Number.isFinite(stepMs) || stepMs <= 0) return Infinity
  const numerator = 1180 * (isRound ? 1 : SQUARE_SPAWN_INTERVAL_FACTOR)
  const slope = 0.0000605 * spawnMultiplier * timeScale
  const coefficient = 0.92 + 0.11 * spawnMultiplier + slope * lastSpawnAt
  // Stable positive root of slope*d*d + coefficient*d - numerator = 0.
  const delay = 2 * numerator / (coefficient + Math.sqrt(coefficient * coefficient + 4 * slope * numerator))
  let dueAt = Math.ceil((lastSpawnAt + delay) / stepMs) * stepMs
  if (!Number.isFinite(dueAt)) return Infinity
  const factor = isRound ? 1 : SQUARE_SPAWN_INTERVAL_FACTOR
  // Algebraic grouping and floating-point ties can move the root by an ulp.
  // Verify adjacent lattice points using the exact existing predicate.
  while (dueAt >= stepMs && dueAt - stepMs < dueAt && dueAt - stepMs - lastSpawnAt >=
      getSpawnIntervalMs(calculateDifficulty(dueAt - stepMs, timeScale), spawnMultiplier) * factor) {
    dueAt -= stepMs
  }
  while (dueAt - lastSpawnAt < getSpawnIntervalMs(calculateDifficulty(dueAt, timeScale), spawnMultiplier) * factor) {
    if (dueAt + stepMs === dueAt) return Infinity
    dueAt += stepMs
  }
  return dueAt
}

// Keep repeated addition bit-for-bit identical to touch control, without
// reconstructing geometry or dispatching the entire world on every quantum.
export function advanceControlScalar(centerY, velocityY, stepCount, minY, maxY, stepMs = 10) {
  const increment = velocityY * (stepMs / 1000)
  for (let index = 0; index < stepCount; index += 1) {
    const next = clamp(centerY + increment, minY, maxY)
    if (next === centerY) return next
    centerY = next
  }
  return centerY
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

  if (!grid.slices) return collectSpawnNeighborhood(asteroids, grid, spawnFromRight, viewport)

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

function getVerticalClearanceScore(candidateY, radius, asteroids) {
  // Positive clearance stops contributing at 18 px, including an empty lane.
  let minClearance = 18
  for (let index = 0; index < asteroids.length; index += 1) {
    const asteroid = asteroids[index]
    const asteroidClearance =
      Math.abs(candidateY - asteroid.y) - (radius + asteroid.radius + 12)
    minClearance = Math.min(minClearance, asteroidClearance)
  }

  return minClearance < 0 ? minClearance * 3.5 : minClearance
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
    const clearanceScore = getVerticalClearanceScore(candidateY, radius, nearbyAsteroids)
    const distanceFromShip = Math.abs(candidateY - shipRect.centerY)
    const laneBias = Math.max(0, challengeBandHalfHeight - distanceFromShip) * 0.9
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

export function getSweptShipBounds(shipRect, previousShipRect = shipRect, out = {}) {
  out.left = Math.min(shipRect.x, previousShipRect.x)
  out.right = Math.max(shipRect.x + shipRect.w, previousShipRect.x + previousShipRect.w)
  out.top = Math.min(shipRect.y, previousShipRect.y)
  out.bottom = Math.max(shipRect.y + shipRect.h, previousShipRect.y + previousShipRect.h)
  return out
}

export function isAsteroidInSweptBounds(asteroid, bounds) {
  const previousX = asteroid.previousX ?? asteroid.x
  return asteroid.y + asteroid.radius >= bounds.top && asteroid.y - asteroid.radius <= bounds.bottom &&
    Math.max(asteroid.x, previousX) + asteroid.radius >= bounds.left &&
    Math.min(asteroid.x, previousX) - asteroid.radius <= bounds.right
}

export function isAsteroidInCollisionBand(asteroid, shipRect, wristSide, previousShipRect = shipRect) {
  return isAsteroidInSweptBounds(asteroid, getSweptShipBounds(shipRect, previousShipRect))
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

// Spawn placement needs only the horizontal layout, not maintained buckets.
// Keep the same clamped slice membership as the legacy grid query: using the
// raw 45%/55% threshold would omit neighbors in the boundary slice.
export function createSpawnNeighborhood(
  viewport,
  sliceWidth = COLLISION_SLICE_WIDTH,
  padding = COLLISION_GRID_PADDING
) {
  return {
    sliceWidth,
    padding,
    sliceCount: Math.max(1, Math.ceil((viewport.width + padding * 2) / sliceWidth)),
  }
}

export function collectSpawnNeighborhood(asteroids, neighborhood, spawnFromRight, viewport) {
  const minSlice = spawnFromRight ? getCollisionSliceIndex(viewport.width * 0.55, neighborhood) : 0
  const maxSlice = spawnFromRight ? neighborhood.sliceCount - 1 : getCollisionSliceIndex(viewport.width * 0.45, neighborhood)
  const nearby = []
  for (let index = 0; index < asteroids.length; index += 1) {
    const asteroid = asteroids[index]
    const slice = getCollisionSliceIndex(asteroid.x, neighborhood)
    if (slice >= minSlice && slice <= maxSlice) nearby.push(asteroid)
  }
  return nearby
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

// Velocity never changes after birth. Keeping the original anchor avoids
// accumulating frame-dependent rounding error when materialization is sparse.
export function anchorAsteroidMotion(asteroid, atMs) {
  if (asteroid.motionBaseAt === undefined) {
    asteroid.motionBaseX = asteroid.x
    asteroid.motionBaseAt = atMs
  }
  return asteroid
}

export function getAsteroidXAt(asteroid, atMs) {
  return asteroid.motionBaseAt === undefined
    ? asteroid.x
    : asteroid.motionBaseX + asteroid.vx * ((atMs - asteroid.motionBaseAt) / 1000)
}

export function getRenderAsteroidXAt(asteroid, atMs) {
  return getAsteroidXAt(asteroid, atMs)
}

// Conservative event window for monotonic motion that can stop at a target.
// Only the caller's canonical narrow phase decides actual contact.
export function getCollisionQuantumWindow(
  asteroid,
  geometry,
  fromMs,
  throughMs,
  startCenterY,
  velocityY,
  out = {},
  stepMs = 10,
  stopCenterY
) {
  if (asteroid.motionRemoved || throughMs < fromMs + stepMs) return null
  anchorAsteroidMotion(asteroid, fromMs)
  const duration = throughMs - fromMs
  const fromX = getAsteroidXAt(asteroid, fromMs)
  const throughX = getAsteroidXAt(asteroid, throughMs)
  const left = geometry.x - asteroid.radius
  const right = geometry.x + geometry.w + asteroid.radius
  if (Math.max(fromX, throughX) < left || Math.min(fromX, throughX) > right) return null

  const limits = geometry.limits
  const start = clamp(startCenterY, limits.min, limits.max)
  const quanta = Math.ceil(duration / stepMs)
  const roundingPadding = 1 + Number.EPSILON * (quanta + 2) *
    Math.max(1, Math.abs(startCenterY), Math.abs(limits.min), Math.abs(limits.max), Math.abs(velocityY * duration / 1000)) * 4
  const halfHeight = geometry.h / 2 + roundingPadding
  const lowCenter = asteroid.y - asteroid.radius - halfHeight
  const highCenter = asteroid.y + asteroid.radius + halfHeight
  let end = clamp(startCenterY + velocityY * (duration / 1000), limits.min, limits.max)
  if (stopCenterY !== undefined) {
    end = clamp(end, Math.min(start, stopCenterY), Math.max(start, stopCenterY))
  }
  if (Math.max(start, end) < lowCenter || Math.min(start, end) > highCenter) return null

  let firstMs = fromMs + stepMs
  let lastMs = throughMs
  if (asteroid.vx !== 0) {
    const speed = asteroid.vx / 1000
    const atLeft = (left - fromX) / speed
    const atRight = (right - fromX) / speed
    const enter = Math.max(0, Math.min(duration, Math.min(atLeft, atRight)))
    const exit = Math.max(0, Math.min(duration, Math.max(atLeft, atRight)))
    // One extra quantum on either side covers division ties and endpoint
    // inclusion, including a crossing ending exactly on a lattice boundary.
    firstMs = Math.max(firstMs, fromMs + Math.floor(enter / stepMs) * stepMs)
    lastMs = Math.min(lastMs, fromMs + (Math.floor(exit / stepMs) + 2) * stepMs)
  }

  if (velocityY !== 0) {
    const speed = velocityY / 1000
    let enter = 0
    let exit = duration
    if (velocityY > 0) {
      if (start < lowCenter) enter = (lowCenter - startCenterY) / speed
      if (end > highCenter) exit = (highCenter - startCenterY) / speed
    } else {
      if (start > highCenter) enter = (highCenter - startCenterY) / speed
      if (end < lowCenter) exit = (lowCenter - startCenterY) / speed
    }
    enter = Math.max(0, Math.min(duration, enter))
    exit = Math.max(0, Math.min(duration, exit))
    firstMs = Math.max(firstMs, fromMs + Math.floor(enter / stepMs) * stepMs)
    lastMs = Math.min(lastMs, fromMs + (Math.floor(exit / stepMs) + 2) * stepMs)
  }

  if (firstMs > lastMs) return null
  out.firstMs = firstMs
  out.lastMs = lastMs
  return out
}

// Spawning and rendering only read current X. The grid and callers that read
// swept positions need the preceding quantum as well.
export function materializeAsteroidsAt(asteroids, atMs, viewport, grid, stepMs = 10, retainPreviousX = true) {
  let writeIndex = 0
  if (grid) grid.maxDisplacement = 0
  const needsPreviousX = retainPreviousX || grid
  const retainRight = viewport.width + 24

  for (let index = 0; index < asteroids.length; index += 1) {
    const asteroid = asteroids[index]
    if (asteroid.motionRemoved) continue
    anchorAsteroidMotion(asteroid, atMs)
    asteroid.x = getAsteroidXAt(asteroid, atMs)

    if (needsPreviousX || !(asteroid.x + asteroid.radius > -24 && asteroid.x - asteroid.radius < retainRight)) {
      asteroid.previousX = getAsteroidXAt(asteroid, atMs - stepMs)
      if (
        Math.max(asteroid.x, asteroid.previousX) + asteroid.radius <= -24 ||
        Math.min(asteroid.x, asteroid.previousX) - asteroid.radius >= retainRight
      ) {
        if (grid) {
          // Objects pruned in an earlier skipped quantum were not visited by
          // the old loop at this instant. Only a final-quantum exit contributes.
          const beforePreviousX = getAsteroidXAt(asteroid, atMs - stepMs * 2)
          if (Math.max(asteroid.previousX, beforePreviousX) + asteroid.radius > -24 &&
              Math.min(asteroid.previousX, beforePreviousX) - asteroid.radius < retainRight) {
            grid.maxDisplacement = Math.max(grid.maxDisplacement, Math.abs(asteroid.x - asteroid.previousX))
          }
          removeAsteroidFromCollisionGrid(asteroid, grid)
        }
        asteroid.motionRemoved = true
        continue
      }
    }

    if (grid) {
      grid.maxDisplacement = Math.max(grid.maxDisplacement, Math.abs(asteroid.x - asteroid.previousX))
      const nextSlice = getCollisionSliceIndex(asteroid.x, grid)
      const nextBucket = getCollisionBucketIndex(asteroid.y, grid)
      if (nextSlice !== asteroid.gridSliceIndex || nextBucket !== asteroid.gridBucketIndex) {
        if (asteroid.gridSliceIndex >= 0) removeAsteroidFromCollisionGrid(asteroid, grid)
        addAsteroidToCollisionGrid(asteroid, grid)
      }
    }
    asteroids[writeIndex] = asteroid
    writeIndex += 1
  }

  asteroids.length = writeIndex
  return asteroids
}

// Ship x/width and asteroid velocity are fixed during a run. A whole-frame
// horizontal sweep is therefore conservative even when input reverses ship y
// or the ship clamps at either vertical boundary within the frame.
export function collectFrameCollisionCandidates(asteroids, shipRect, fromMs, throughMs, out = []) {
  out.length = 0
  for (let index = 0; index < asteroids.length; index += 1) {
    const asteroid = asteroids[index]
    if (asteroid.motionRemoved) continue
    anchorAsteroidMotion(asteroid, fromMs)
    const fromX = getAsteroidXAt(asteroid, fromMs)
    const throughX = getAsteroidXAt(asteroid, throughMs)
    if (Math.max(fromX, throughX) + asteroid.radius >= shipRect.x &&
        Math.min(fromX, throughX) - asteroid.radius <= shipRect.x + shipRect.w) {
      out.push(asteroid)
    }
  }
  return out
}

export function advanceFrameCollisionCandidates(candidates, nowMs, stepMs = 10) {
  for (let index = 0; index < candidates.length; index += 1) {
    const asteroid = candidates[index]
    if (asteroid.motionRemoved) continue
    asteroid.previousX = getAsteroidXAt(asteroid, nowMs - stepMs)
    asteroid.x = getAsteroidXAt(asteroid, nowMs)
  }
  return candidates
}

export function collectCollisionCandidatesFromList(candidates, shipRect, wristSide, out = [], previousShipRect = shipRect) {
  out.length = 0
  const bounds = getSweptShipBounds(shipRect, previousShipRect)
  for (let index = 0; index < candidates.length; index += 1) {
    const asteroid = candidates[index]
    if (!asteroid.motionRemoved && isAsteroidInSweptBounds(asteroid, bounds)) {
      out.push(asteroid)
    }
  }
  return out
}

export function collectCollisionCandidatesFromGrid(
  grid,
  shipRect,
  wristSide,
  candidates = [],
  previousShipRect = shipRect
) {
  candidates.length = 0
  const bounds = getSweptShipBounds(shipRect, previousShipRect)

  // Centers are indexed once: both sides need radius padding, including the
  // trailing side. Swept centers can end beyond the static query rectangle.
  const padding = ASTEROID_RADIUS_MAX + (grid.maxDisplacement || 0)
  const minSlice = getCollisionSliceIndex(bounds.left - padding, grid)
  const maxSlice = getCollisionSliceIndex(bounds.right + padding, grid)
  const minBucket = getCollisionBucketIndex(bounds.top - ASTEROID_RADIUS_MAX, grid)
  const maxBucket = getCollisionBucketIndex(bounds.bottom + ASTEROID_RADIUS_MAX, grid)

  for (let sliceIndex = minSlice; sliceIndex <= maxSlice; sliceIndex += 1) {
    const slice = grid.slices[sliceIndex]
    for (let bucketIndex = minBucket; bucketIndex <= maxBucket; bucketIndex += 1) {
      const bucket = slice[bucketIndex]
      for (let index = 0; index < bucket.length; index += 1) {
        const asteroid = bucket[index]
        if (isAsteroidInSweptBounds(asteroid, bounds)) {
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
    if (t >= 0 && t <= 1) {
      const u = ((cx - ax) * aby - (cy - ay) * abx) / determinant
      if (u >= 0 && u <= 1) return 0
    }
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

function getSweptShipDistanceSquared(shipRect, previousShipRect, asteroid, stopAtOverlapRadiusSquared) {
  const points = shipRect.points || updateShipPoints(Array.from({ length: 5 }, () => ({ x: 0, y: 0 })), shipRect)
  // Translate the start of the circle path into the final ship's frame. The
  // ship only translates, so this handles touch, tilt and swipe continuously.
  const ax = (asteroid.previousX ?? asteroid.x) + shipRect.x - previousShipRect.x
  const ay = asteroid.y + shipRect.y - previousShipRect.y
  const bx = asteroid.x
  const by = asteroid.y
  if (isPointInsideShip(ax, ay, points) || isPointInsideShip(bx, by, points)) return 0

  let distanceSquared = Infinity
  for (let i = 0; i < 4; i += 1) {
    const a = points[i]
    const b = points[i + 1]
    distanceSquared = Math.min(distanceSquared, segmentDistanceSquared(ax, ay, bx, by, a.x, a.y, b.x, b.y))
    if (stopAtOverlapRadiusSquared !== undefined && distanceSquared < stopAtOverlapRadiusSquared) break
  }
  return distanceSquared
}

// The caller has already checked the collision band and cooldown.
export function getSweptCollisionDamage(shipRect, previousShipRect, asteroid) {
  const radiusSquared = asteroid.radius * asteroid.radius
  const distanceSquared = getSweptShipDistanceSquared(shipRect, previousShipRect, asteroid, radiusSquared)
  return distanceSquared < radiusSquared ? getAsteroidDamage(asteroid.radius) : 0
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
  const distanceSquared = getSweptShipDistanceSquared(shipRect, previousShipRect, asteroid)
  const overlapRatio = clamp(1 - distanceSquared / (asteroid.radius * asteroid.radius), 0, 1)
  return overlapRatio > 0
    ? { hit: true, damage: getAsteroidDamage(asteroid.radius), overlapRatio }
    : { hit: false, damage: 0, overlapRatio: 0 }
}
