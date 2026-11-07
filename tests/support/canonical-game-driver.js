import { COLLISION_COOLDOWN_MS, HP_MAX } from '../../zepp-app/shared/constants.js'
import {
  anchorAsteroidMotion,
  calculateDifficulty,
  clamp,
  createAsteroid,
  createScoreEntry,
  createShipGeometry,
  createShipRect,
  createSpawnNeighborhood,
  getAsteroidXAt,
  getSpawnIntervalMs,
  getSweptCollisionDamage,
  materializeAsteroidsAt,
  SQUARE_SPAWN_INTERVAL_FACTOR,
} from '../../zepp-app/shared/game-core.js'
import { SIMULATION_STEP_MS } from '../../zepp-app/shared/simulation-clock.js'

export function seededRandom(seed) {
  let calls = 0
  const random = () => {
    calls += 1
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 4294967296
  }
  random.calls = () => calls
  return random
}

export function createCanonicalGame({ viewport, settings, baseControlSpeed, random, hp = HP_MAX }) {
  const { wristSide, controlMode, timeScale, spawnMultiplier } = settings
  const geometry = createShipGeometry(viewport, wristSide)
  const grid = createSpawnNeighborhood(viewport)
  const asteroids = []
  const births = []
  const hits = []
  let shipY = viewport.height / 2
  let ship = createShipRect(viewport, shipY, wristSide, {}, geometry)
  let previousShip = createShipRect(viewport, shipY, wristSide, {}, geometry)
  let lastSpawnAt = 0
  let age = 0
  let direction = 0
  let anchorTouch = null
  let anchorShip = shipY
  let target = shipY
  let displayedHp = hp
  let previousDisplayedHp = hp

  function step() {
    age += SIMULATION_STEP_MS
    if (controlMode === 'touch') {
      shipY += direction * baseControlSpeed * 0.01
    } else {
      shipY = clamp(shipY + Math.sign(target - shipY) * baseControlSpeed * 0.01,
        Math.min(shipY, target), Math.max(shipY, target))
    }
    shipY = clamp(shipY, geometry.limits.min, geometry.limits.max)
    const reusable = previousShip
    previousShip = ship
    ship = reusable
    createShipRect(viewport, shipY, wristSide, ship, geometry)

    const difficulty = calculateDifficulty(age, timeScale)
    const interval = getSpawnIntervalMs(difficulty, spawnMultiplier) *
      (viewport.isRound ? 1 : SQUARE_SPAWN_INTERVAL_FACTOR)
    const debt = age - lastSpawnAt
    if (debt >= interval) {
      const count = debt >= 2 * interval ? 2 : 1
      lastSpawnAt = age - Math.min(interval, Math.max(0, debt - interval * count))
      for (let index = 0; index < count; index += 1) {
        const id = `${age}-${births.length + 1}`
        const body = createAsteroid({ id, viewport, difficulty, shipRect: ship, asteroids, grid, wristSide, random })
        body.lastHitAt = -Infinity
        anchorAsteroidMotion(body, age - SIMULATION_STEP_MS)
        asteroids.push(body)
        births.push({ id, x: body.x, y: body.y, vx: body.vx, radius: body.radius })
      }
    }

    for (const asteroid of asteroids) {
      asteroid.previousX = getAsteroidXAt(asteroid, age - SIMULATION_STEP_MS)
      asteroid.x = getAsteroidXAt(asteroid, age)
      if (age - asteroid.lastHitAt < COLLISION_COOLDOWN_MS) continue
      const damage = getSweptCollisionDamage(ship, previousShip, asteroid)
      if (!damage) continue
      hp = Math.max(0, hp - damage)
      asteroid.lastHitAt = age
      hits.push([asteroid.id, age])
    }
    previousDisplayedHp = displayedHp
    const delta = hp - displayedHp
    const limit = 72 * 0.01
    displayedHp = Math.abs(delta) <= limit ? hp : displayedHp + Math.sign(delta) * limit
    materializeAsteroidsAt(asteroids, age, viewport)
  }

  return {
    births,
    hits,
    advanceTo(ms) {
      while (hp > 0 && age + SIMULATION_STEP_MS <= ms) step()
    },
    apply({ kind, y }) {
      if (kind === 'up') {
        direction = 0
        anchorTouch = null
      } else if (controlMode === 'touch') {
        direction = y < viewport.height / 2 ? -1 : 1
      } else if (kind === 'down') {
        anchorTouch = y
        anchorShip = shipY
        target = shipY
      } else if (anchorTouch !== null) {
        target = clamp(anchorShip + (y - anchorTouch), geometry.limits.min, geometry.limits.max)
      }
    },
    state() {
      return { age, shipY, hp, displayedHp, previousDisplayedHp, finished: hp === 0,
        asteroids: asteroids.map(({ id, x, y, vx, radius, lastHitAt }) => ({ id, x, y, vx, radius, lastHitAt })) }
    },
    score(timestamp) {
      return createScoreEntry(age, settings, timestamp)
    },
  }
}
