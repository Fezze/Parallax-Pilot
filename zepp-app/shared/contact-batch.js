import { COLLISION_COOLDOWN_MS } from './constants.js'
import {
  clamp,
  createShipRect,
  getAsteroidCollisionWindow,
  getAsteroidXAt,
  getSweptCollisionDamage,
  getSweptShipBounds,
  isCollisionWindowClear,
  prepareCollisionWindowSegment,
  setCanonicalShipY,
} from './game-core.js'
import { MAX_SIMULATION_GAP_MS, SIMULATION_STEP_MS } from './simulation-clock.js'

const STEP_SECONDS = SIMULATION_STEP_MS / 1000
const POSE_COUNT = Math.ceil(MAX_SIMULATION_GAP_MS / SIMULATION_STEP_MS) + 1

export function createContactBatch(geometry) {
  return {
    geometry,
    centers: new Float64Array(POSE_COUNT),
    poses: Array.from({ length: POSE_COUNT }, () =>
      createShipRect(null, geometry.limits.min, geometry.wristSide, {}, geometry)),
    bounds: Array.from({ length: POSE_COUNT }, () => ({})),
    heads: new Int32Array(POSE_COUNT),
    tails: new Int32Array(POSE_COUNT),
    rows: [],
    windows: [],
    segment: {},
    scratch: { x: 0, previousX: 0, y: 0, radius: 0 },
    fromMs: 0,
    count: 0,
    rowCount: 0,
    windowCount: 0,
  }
}

export function reserveContactRows(batch, requiredCapacity) {
  if (requiredCapacity <= batch.rows.length) return
  const capacity = Math.max(requiredCapacity, batch.rows.length * 2)
  while (batch.rows.length < capacity) {
    batch.rows.push({ asteroid: null, damage: 0, next: -1 })
    batch.windows.push({ asteroid: null, firstMs: 0, lastMs: 0 })
  }
}

function fillPoses(batch, startRect, startCenterY, control) {
  const { centers, poses, bounds, geometry, count } = batch
  const { min, max } = geometry.limits
  const { direction, baseControlSpeed, targetY } = control
  const touchIncrement = targetY === undefined ? direction * baseControlSpeed * STEP_SECONDS : 0
  let center = startCenterY
  centers[0] = center
  setCanonicalShipY(poses[0], startRect.y)
  for (let quantum = 1; quantum <= count; quantum += 1) {
    let next = center + touchIncrement
    if (targetY !== undefined) {
      next = clamp(center + Math.sign(targetY - center) * baseControlSpeed * STEP_SECONDS,
        Math.min(center, targetY), Math.max(center, targetY))
    }
    center = clamp(next, min, max)
    centers[quantum] = center
    setCanonicalShipY(poses[quantum], Math.round(center - geometry.h / 2))
    getSweptShipBounds(poses[quantum], poses[quantum - 1], bounds[quantum])
  }
}

// The game anchors bodies before collection. Keep the batch read-only for
// unanchored inputs as well, using the same origin the window helper would set.
function getMotionSource(asteroid, fromMs, scratch) {
  if (asteroid.motionBaseAt !== undefined) return asteroid
  scratch.motionBaseAt = fromMs
  scratch.motionBaseX = asteroid.x
  scratch.vx = asteroid.vx
  scratch.y = asteroid.y
  scratch.radius = asteroid.radius
  return scratch
}

export function prepareContactBatch(batch, candidates, startRect, startCenterY, control, fromMs, throughMs) {
  const { geometry, heads, tails, rows, windows, scratch } = batch
  const count = (throughMs - fromMs) / SIMULATION_STEP_MS
  batch.fromMs = fromMs
  batch.count = count
  for (let i = 0; i < batch.rowCount; i += 1) rows[i].asteroid = null
  for (let i = 0; i < batch.windowCount; i += 1) windows[i].asteroid = null
  batch.rowCount = 0
  batch.windowCount = 0
  heads.fill(-1, 0, count + 1)
  tails.fill(-1, 0, count + 1)
  if (count === 0 || candidates.length === 0) return batch

  const { direction, baseControlSpeed, targetY } = control
  const velocity = (targetY === undefined ? direction : Math.sign(targetY - startCenterY)) * baseControlSpeed
  const segment = prepareCollisionWindowSegment(geometry, fromMs, throughMs, startCenterY,
    velocity, SIMULATION_STEP_MS, targetY, batch.segment)
  // The admitted frame is shorter than cooldown. A committed hit keeps the
  // same asteroid ineligible in every later segment of this callback.
  for (let i = 0; i < candidates.length; i += 1) {
    const asteroid = candidates[i]
    const readyAt = asteroid.lastHitAt + COLLISION_COOLDOWN_MS
    if (asteroid.motionRemoved || !(readyAt <= throughMs)) continue
    const motion = getMotionSource(asteroid, fromMs, scratch)
    const window = windows[batch.windowCount]
    if (!getAsteroidCollisionWindow(motion, segment, window)) continue
    if (Number.isFinite(readyAt)) {
      window.firstMs = Math.max(window.firstMs, Math.ceil(readyAt / SIMULATION_STEP_MS) * SIMULATION_STEP_MS)
    }
    if (window.firstMs > window.lastMs) continue
    if (window.lastMs > window.firstMs && isCollisionWindowClear(motion, segment, window, startRect)) continue
    window.asteroid = asteroid
    batch.windowCount += 1
  }
  if (batch.windowCount === 0) return batch

  fillPoses(batch, startRect, startCenterY, control)
  const { poses, bounds } = batch
  for (let i = 0; i < batch.windowCount; i += 1) {
    const { asteroid, firstMs, lastMs } = windows[i]
    const motion = getMotionSource(asteroid, fromMs, scratch)
    const { y, radius } = asteroid
    scratch.y = y
    scratch.radius = radius
    for (let atMs = firstMs; atMs <= lastMs; atMs += SIMULATION_STEP_MS) {
      const quantum = (atMs - fromMs) / SIMULATION_STEP_MS
      const { top, bottom, left, right } = bounds[quantum]
      if (y + radius < top || y - radius > bottom) continue
      const previousX = getAsteroidXAt(motion, atMs - SIMULATION_STEP_MS)
      const x = getAsteroidXAt(motion, atMs)
      if (Math.max(previousX, x) + radius < left || Math.min(previousX, x) - radius > right) continue
      scratch.previousX = previousX
      scratch.x = x
      const damage = getSweptCollisionDamage(poses[quantum], poses[quantum - 1], scratch)
      if (damage === 0) continue

      const index = batch.rowCount++
      const row = rows[index]
      row.asteroid = asteroid
      row.damage = damage
      row.next = -1
      const tail = tails[quantum]
      if (tail === -1) heads[quantum] = index
      else rows[tail].next = index
      tails[quantum] = index
      break
    }
  }
  return batch
}

export function copyBatchPose(batch, quantum, currentRect, previousRect) {
  setCanonicalShipY(currentRect, batch.poses[quantum].y)
  setCanonicalShipY(previousRect, batch.poses[quantum - 1].y)
}
