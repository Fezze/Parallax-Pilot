import test from 'node:test'
import assert from 'node:assert/strict'
import { ASTEROID_RADIUS_MIN, ASTEROID_RADIUS_MAX, COLLISION_COOLDOWN_MS } from '../zepp-app/shared/constants.js'
import {
  copyBatchPose, createContactBatch, prepareContactBatch, reserveContactRows,
} from '../zepp-app/shared/contact-batch.js'
import {
  anchorAsteroidMotion, clamp, createShipGeometry, createShipRect, getAsteroidXAt, getSweptCollisionDamage,
} from '../zepp-app/shared/game-core.js'
import { MAX_SIMULATION_GAP_MS, SIMULATION_STEP_MS } from '../zepp-app/shared/simulation-clock.js'

const touch = (direction, baseControlSpeed = 230) => ({ direction, baseControlSpeed })
const swipe = (targetY, baseControlSpeed = 230) => ({ targetY, baseControlSpeed })

function fixture(width = 480, height = width, wristSide = 'left', center = height / 2) {
  const viewport = { width, height, isRound: width === height }
  const geometry = createShipGeometry(viewport, wristSide)
  const rect = y => createShipRect(viewport, y, wristSide, {}, geometry)
  return { geometry, rect, start: rect(center), center }
}

function canonical(f, asteroids, control, from, through, center = f.center) {
  const hits = []
  const last = asteroids.map(asteroid => asteroid.lastHitAt)
  let ship = f.rect(center)
  let previous = ship
  for (let now = from + SIMULATION_STEP_MS; now <= through; now += SIMULATION_STEP_MS) {
    if (control.targetY === undefined) {
      center += control.direction * control.baseControlSpeed * 0.01
    } else {
      const target = control.targetY
      center = clamp(center + Math.sign(target - center) * control.baseControlSpeed * 0.01,
        Math.min(center, target), Math.max(center, target))
    }
    center = clamp(center, f.geometry.limits.min, f.geometry.limits.max)
    previous = ship
    ship = f.rect(center)
    for (const [index, asteroid] of asteroids.entries()) {
      if (asteroid.motionRemoved || now - last[index] < COLLISION_COOLDOWN_MS) continue
      const motion = { ...asteroid }
      anchorAsteroidMotion(motion, from)
      motion.x = getAsteroidXAt(motion, now)
      motion.previousX = getAsteroidXAt(motion, now - SIMULATION_STEP_MS)
      const damage = getSweptCollisionDamage(ship, previous, motion)
      if (!damage) continue
      hits.push({ now, asteroid, damage })
      last[index] = now
    }
  }
  return { hits, center, ship, previous }
}

function events(batch) {
  const hits = []
  for (let q = 1; q <= batch.count; q += 1) {
    for (let i = batch.heads[q]; i !== -1; i = batch.rows[i].next) {
      const { asteroid, damage } = batch.rows[i]
      hits.push({ now: batch.fromMs + q * SIMULATION_STEP_MS, asteroid, damage })
    }
  }
  return hits
}

function prepare(f, candidates, control, from = 0, through = 250) {
  const batch = createContactBatch(f.geometry)
  reserveContactRows(batch, candidates.length)
  return prepareContactBatch(batch, candidates, f.start, f.center, control, from, through)
}

function compare(f, candidates, control, from = 0, through = 250) {
  const expected = canonical(f, candidates, control, from, through)
  const batch = prepare(f, candidates, control, from, through)
  assert.deepEqual(events(batch), expected.hits)
  if (batch.windowCount) {
    const previous = f.rect(f.center)
    const current = f.rect(f.center)
    copyBatchPose(batch, batch.count, current, previous)
    assert.deepEqual(current, expected.ship)
    assert.deepEqual(previous, expected.previous)
    assert.equal(batch.centers[batch.count], expected.center)
    assert.notEqual(batch.poses[0].points, f.start.points)
    assert.notEqual(current.points, batch.poses[batch.count].points)
  }
  return batch
}

function body(x, y, radius = 8, vx = 0, lastHitAt = -Infinity) {
  return { x, y, radius, vx, lastHitAt }
}

test('exact batch poses match stationary, held, capped, arrival, clamped and reversed control', () => {
  const f = fixture()
  const asteroids = [-42, -15, 0, 17, 45].map((dy, i) =>
    anchorAsteroidMotion(body(f.start.centerX + (i - 2) * 8, f.center + dy, 12, (i - 2) * 65), 0))
  for (const control of [touch(0), touch(-1), touch(1), swipe(f.center + 18.25), swipe(f.center - 18.25),
    touch(1, 4000), swipe(f.geometry.limits.min, 4000), swipe(f.geometry.limits.max, 4000)]) {
    compare(f, asteroids, control)
  }
  for (const [first, second] of [[touch(1), touch(-1)], [swipe(f.center + 90), swipe(f.center - 19)]]) {
    const boundary = 80
    const firstBatch = compare(f, asteroids, first, 0, boundary)
    const after = canonical(f, asteroids, first, 0, boundary)
    const remaining = asteroids.map(asteroid => ({ ...asteroid,
      lastHitAt: events(firstBatch).find(hit => hit.asteroid === asteroid)?.now ?? asteroid.lastHitAt }))
    compare({ ...f, center: after.center, start: after.ship }, remaining, second, boundary, 250)
  }
})

test('all radii, wrists and viewports preserve strict tangency, corners, notch and fast sweeps', () => {
  for (const [width, height] of [[416, 416], [454, 454], [466, 466], [480, 480], [390, 450]]) {
    for (const wrist of ['left', 'right']) {
      const f = fixture(width, height, wrist)
      const travel = wrist === 'left' ? -1 : 1
      const nose = wrist === 'left' ? f.start.x + f.start.w : f.start.x
      const tail = wrist === 'left' ? f.start.x : f.start.x + f.start.w
      for (let radius = ASTEROID_RADIUS_MIN; radius <= ASTEROID_RADIUS_MAX; radius += 1) {
        const tangent = body(nose - travel * radius, f.start.centerY, radius)
        const corner = body(tail + travel * (radius - 1), f.start.y - radius + 1, radius)
        const notch = body(tail + travel * radius, f.start.centerY, radius)
        const crossing = body(f.start.centerX - travel * width, f.start.centerY, radius, travel * width * 190)
        const batch = compare(f, [tangent, corner, notch, crossing], touch(0))
        assert.deepEqual(events(batch).map(hit => hit.asteroid), [crossing])
      }
    }
  }
})

test('interior hits survive clear endpoints and share a bucket in candidate order', () => {
  const f = fixture()
  const first = anchorAsteroidMotion(body(f.start.centerX + 100, f.center, 7, -1000), 0)
  const second = anchorAsteroidMotion(body(first.x, first.y, 7, first.vx), 0)
  for (const at of [0, 250]) {
    const x = getAsteroidXAt(first, at)
    assert.equal(getSweptCollisionDamage(f.start, f.start, { ...first, x, previousX: x }), 0)
  }
  const hits = events(compare(f, [second, first], touch(0)))
  assert.deepEqual(hits.map(hit => hit.asteroid), [second, first])
  assert.ok(hits[0].now > 10 && hits[0].now < 250)
  assert.equal(hits[0].now, hits[1].now)
})

test('259/260/261 ms readiness clips to the lattice and frame admission bounds repeat hits', () => {
  const f = fixture()
  const bodies = [259, 260, 261].map(age => body(f.start.centerX, f.center, 8, 0, 300 - age))
  const hits = events(compare(f, bodies, touch(0), 290, 310))
  assert.deepEqual(hits.map(({ now, asteroid }) => [bodies.indexOf(asteroid), now]), [[1, 300], [2, 300], [0, 310]])
  assert.ok(MAX_SIMULATION_GAP_MS < COLLISION_COOLDOWN_MS)
  const continuouslyOverlapping = body(f.start.centerX, f.center)
  assert.equal(events(compare(f, [continuouslyOverlapping], touch(0))).length, 1)
})

test('candidate evaluation is read-only and reuses slots, including the empty-window path', () => {
  const f = fixture()
  const candidate = Object.freeze(body(f.start.centerX, f.center))
  const start = structuredClone(f.start)
  for (const point of f.start.points) Object.freeze(point)
  Object.freeze(f.start)
  const batch = createContactBatch(f.geometry)
  reserveContactRows(batch, 1)
  const row = batch.rows[0]
  const window = batch.windows[0]
  const pose = batch.poses[1]
  let leaves = 0
  let previousX = 0
  Object.defineProperty(batch.scratch, 'previousX', {
    get: () => previousX,
    set: x => { previousX = x; leaves += 1 },
  })
  prepareContactBatch(batch, [candidate], f.start, f.center, touch(1), 0, 250)
  assert.equal(leaves, 1)
  assert.equal(batch.rowCount, 1)
  assert.deepEqual(f.start, start)
  assert.equal(candidate.lastHitAt, -Infinity)
  const current = f.rect(f.center)
  const previous = f.rect(f.center)
  copyBatchPose(batch, 1, current, previous)
  assert.equal(leaves, 1)
  const savedPose = structuredClone(pose)
  prepareContactBatch(batch, [body(-1000, 0)], f.start, f.center, touch(-1), 0, 250)
  assert.equal(leaves, 1)
  assert.equal(batch.windowCount, 0)
  assert.equal(batch.rowCount, 0)
  assert.deepEqual(batch.poses[1], savedPose)
  assert.equal(batch.poses[1], pose)
  assert.equal(batch.rows[0], row)
  assert.equal(batch.windows[0], window)
})
