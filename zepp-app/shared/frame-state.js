import { anchorAsteroidMotion, getAsteroidXAt, getCollisionSliceIndex } from './game-core.js'
import { SIMULATION_STEP_MS } from './simulation-clock.js'

function isRetained(asteroid, x, atMs, retainRight) {
  const { radius } = asteroid
  if (x + radius > -24 && x - radius < retainRight) return true
  const previousX = getAsteroidXAt(asteroid, atMs - SIMULATION_STEP_MS)
  return Math.max(x, previousX) + radius > -24 && Math.min(x, previousX) - radius < retainRight
}

function commitBody(asteroid, atMs, retainRight, retired) {
  if (asteroid.motionRemoved) return false
  anchorAsteroidMotion(asteroid, atMs)
  const x = getAsteroidXAt(asteroid, atMs)
  asteroid.x = x
  if (isRetained(asteroid, x, atMs, retainRight)) return true
  asteroid.motionRemoved = true
  if (asteroid.presentation) retired.push(asteroid.presentation)
  return false
}

function writeImage(frame, index, asteroid, renderMs) {
  const image = frame.asteroids[index] || (frame.asteroids[index] = {})
  image.id = asteroid.id
  image.x = getAsteroidXAt(asteroid, renderMs)
  image.y = asteroid.y
  image.radius = asteroid.radius
  image.presentation = asteroid.presentation
}

function finishFrame(frame, count) {
  // Keep reusable image entries while releasing references to departed bodies.
  for (let i = count; i < frame.asteroidCount; i += 1) frame.asteroids[i].presentation = null
  frame.asteroidCount = count
}

export function commitSceneFrame(asteroids, canonicalMs, renderMs, viewport, targetFrame, retired) {
  let write = 0
  const retainRight = viewport.width + 24
  for (let i = 0; i < asteroids.length; i += 1) {
    const asteroid = asteroids[i]
    if (!commitBody(asteroid, canonicalMs, retainRight, retired)) continue
    asteroids[write] = asteroid
    if (targetFrame) writeImage(targetFrame, write, asteroid, renderMs)
    write += 1
  }
  asteroids.length = write
  if (targetFrame) finishFrame(targetFrame, write)
}

export function collectSpawnScene(asteroids, atMs, viewport, neighborhood, spawnFromRight, nearby, retired) {
  const minSlice = spawnFromRight ? getCollisionSliceIndex(viewport.width * 0.55, neighborhood) : 0
  const maxSlice = spawnFromRight ? neighborhood.sliceCount - 1 : getCollisionSliceIndex(viewport.width * 0.45, neighborhood)
  const retainRight = viewport.width + 24
  let write = 0
  nearby.length = 0
  for (let i = 0; i < asteroids.length; i += 1) {
    const asteroid = asteroids[i]
    if (!commitBody(asteroid, atMs, retainRight, retired)) continue
    asteroids[write++] = asteroid
    const slice = getCollisionSliceIndex(asteroid.x, neighborhood)
    if (slice >= minSlice && slice <= maxSlice) nearby.push(asteroid)
  }
  asteroids.length = write
}

export function prepareFractionalFrame(asteroids, renderMs, targetFrame) {
  for (let i = 0; i < asteroids.length; i += 1) writeImage(targetFrame, i, asteroids[i], renderMs)
  finishFrame(targetFrame, asteroids.length)
}
