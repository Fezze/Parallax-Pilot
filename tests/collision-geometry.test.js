import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addAsteroidToCollisionGrid, advanceAsteroidsInCollisionGrid,
  anchorAsteroidMotion, calculateCollisionResult, collectCollisionCandidatesFromGrid,
  createCollisionGrid, createShipGeometry, createShipRect, getAsteroidCollisionWindow, getAsteroidXAt,
  getCollisionQuantumWindow, getShipYLimits, getSweptCollisionDamage,
  isAsteroidInCollisionBand, isCollisionWindowClear, prepareCollisionWindowSegment,
} from '../zepp-app/shared/game-core.js'

const viewports = [416, 454, 466, 480].map(width => ({ width, height: width }))
viewports.push({ width: 390, height: 450 })
const wrists = ['left', 'right']

// Independent oracle: split the intended filled arrow into two triangles.
// Deliberately do not read production points or squared-distance helpers.
function triangles(rect) {
  const right = rect.wristSide !== 'right'
  const nose = [right ? rect.x + rect.w : rect.x, rect.y + rect.h / 2]
  const notch = [rect.x + rect.w * (right ? 0.28 : 0.72), rect.y + rect.h / 2]
  const tail = right ? rect.x : rect.x + rect.w
  return [[nose, [tail, rect.y], notch], [nose, notch, [tail, rect.y + rect.h]]]
}
function edgeDistance(p, a, b) {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1])
  const ux = (b[0] - a[0]) / length
  const uy = (b[1] - a[1]) / length
  const projection = Math.max(0, Math.min(length, (p[0] - a[0]) * ux + (p[1] - a[1]) * uy))
  return Math.hypot(p[0] - a[0] - projection * ux, p[1] - a[1] - projection * uy)
}
function triangleDistance(p, triangle) {
  const signs = triangle.map((a, i) => {
    const b = triangle[(i + 1) % 3]
    return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
  })
  if (signs.every(value => value >= 0) || signs.every(value => value <= 0)) return 0
  return Math.min(...triangle.map((a, i) => edgeDistance(p, a, triangle[(i + 1) % 3])))
}
function oracleDistance(rect, asteroid) {
  return Math.min(...triangles(rect).map(triangle => triangleDistance([asteroid.x, asteroid.y], triangle)))
}
function oracleSweptDistance(rect, previousRect, asteroid) {
  const ax = asteroid.previousX + rect.x - previousRect.x
  const ay = asteroid.y + rect.y - previousRect.y
  // Distance to each convex triangle is convex along the moving point's path.
  return Math.min(...triangles(rect).map(triangle => {
    const distanceAt = t => triangleDistance([ax + t * (asteroid.x - ax), ay + t * (asteroid.y - ay)], triangle)
    let low = 0
    let high = 1
    for (let i = 0; i < 70; i++) {
      const a = (2 * low + high) / 3
      const b = (low + 2 * high) / 3
      if (distanceAt(a) < distanceAt(b)) high = b
      else low = a
    }
    return Math.min(distanceAt(0), distanceAt(1), distanceAt((low + high) / 2))
  }))
}
function hit(rect, asteroid, previousShipRect = rect, now = 1000) {
  return calculateCollisionResult({ shipRect: rect, previousShipRect, asteroid, now }).hit
}

test('prepared segments reuse scratch across asteroids and respect a swipe stop', () => {
  const geometry = { x: 100, w: 20, h: 20, limits: { min: 20, max: 200 } }
  const segment = {}
  const window = {}
  assert.equal(prepareCollisionWindowSegment(geometry, 0, 100, 100, 0, 10, undefined, segment), segment)

  const fromLeft = { x: 80, y: 100, radius: 10, vx: 1000 }
  const fromRight = { x: 150, y: 100, radius: 10, vx: -1000 }
  assert.equal(getAsteroidCollisionWindow(fromLeft, segment, window), window)
  assert.deepEqual(window, { firstMs: 10, lastMs: 70 })
  assert.equal(getAsteroidCollisionWindow(fromRight, segment, window), window)
  assert.deepEqual(window, { firstMs: 20, lastMs: 80 })
  assert.deepEqual(getCollisionQuantumWindow(fromRight, geometry, 0, 100, 100, 0), window)

  const stationary = { x: 100, y: 110, radius: 10, vx: 0 }
  prepareCollisionWindowSegment(geometry, 0, 100, 80, 1000, 10, 88, segment)
  assert.equal(getAsteroidCollisionWindow(stationary, segment, window), null)
  prepareCollisionWindowSegment(geometry, 0, 100, 80, 1000, 10, undefined, segment)
  assert.deepEqual(getAsteroidCollisionWindow(stationary, segment, window), { firstMs: 10, lastMs: 70 })
})

test('whole-window rejection agrees with canonical sweeps and the silhouette oracle', t => {
  const viewport = viewports[2]
  const fromMs = 1770
  const throughMs = fromMs + 160
  let seed = 7596
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
  let compared = 0
  for (const wrist of wrists) {
    const geometry = createShipGeometry(viewport, wrist)
    const { min, max } = geometry.limits
    const scenarios = [
      ['stationary', 200.49999999999997, 0],
      ['moving down', 204.3, 310],
      ['moving up', 254.49999999999997, -170],
      ['swipe stop', 190.4, 370, 210.5],
      ['top clamp', min + 14.2, -340],
      ['bottom clamp', max - 10.1, 270],
      ['pinned at limit', max, 270],
    ]
    for (const [name, startY, velocityY, stopY] of scenarios) {
      const segment = prepareCollisionWindowSegment(geometry, fromMs, throughMs, startY, velocityY, 10, stopY)
      const rects = [createShipRect(viewport, startY, wrist)]
      let centerY = startY
      for (let now = fromMs + 10; now <= throughMs; now += 10) {
        // Simulate scalar control with its repeated floating-point additions.
        const target = stopY ?? (velocityY < 0 ? min : max)
        const next = centerY + velocityY * 0.01
        centerY = velocityY < 0 ? Math.max(next, target) : Math.min(next, target)
        rects.push(createShipRect(viewport, centerY, wrist))
      }
      let clearWindows = 0
      let hitWindows = 0
      for (let index = 0; index < 130; index += 1) {
        const radius = 7 + random() * 11
        const yLow = Math.min(startY, centerY) - geometry.h / 2 - radius
        const yHigh = Math.max(startY, centerY) + geometry.h / 2 + radius
        const asteroid = { x: geometry.x - 35 + random() * (geometry.w + 70), y: yLow + random() * (yHigh - yLow),
          radius, vx: index % 3 === 0 ? 0 : (random() - 0.5) * 1900 }
        anchorAsteroidMotion(asteroid, fromMs - 130)
        const window = getAsteroidCollisionWindow(asteroid, segment)
        if (!window) continue
        if (index % 3 === 1) window.firstMs = Math.min(window.lastMs, window.firstMs + 20)
        const clear = isCollisionWindowClear(asteroid, segment, window, rects[0])
        let hit = false
        for (let now = window.firstMs; now <= window.lastMs; now += 10) {
          const step = (now - fromMs) / 10
          const circle = { ...asteroid, x: getAsteroidXAt(asteroid, now), previousX: getAsteroidXAt(asteroid, now - 10) }
          if (getSweptCollisionDamage(rects[step], rects[step - 1], circle)) hit = true
          if (clear) {
            const distance = oracleSweptDistance(rects[step], rects[step - 1], circle)
            assert.ok(distance >= radius - 1e-8, JSON.stringify({ wrist, name, window, now, circle, distance }))
            compared++
          }
        }
        if (hit) assert.equal(clear, false, JSON.stringify({ wrist, name, window, asteroid }))
        if (clear) clearWindows++
        if (hit) hitWindows++
      }
      assert.ok(clearWindows > 0 && hitWindows > 0, JSON.stringify({ wrist, name, clearWindows, hitWindows }))
    }
  }
  t.diagnostic(`${compared} independently checked sweeps from rejected windows`)
})

test('whole-window rejection retains near tangencies and sweeps through a stop', () => {
  const viewport = viewports[2]
  const window = Object.freeze({ firstMs: 10, lastMs: 30 })
  for (const wrist of wrists) {
    const geometry = createShipGeometry(viewport, wrist)
    const direction = wrist === 'left' ? 1 : -1
    const nose = wrist === 'left' ? geometry.x + geometry.w : geometry.x
    const stationary = prepareCollisionWindowSegment(geometry, 0, 30, 200.49, 0)
    const fixed = createShipRect(viewport, stationary.start, wrist)
    for (const offset of [-1e-7, 0, 1e-7]) {
      const asteroid = anchorAsteroidMotion({ x: nose + direction * (7 + offset), y: fixed.centerY, radius: 7, vx: 0 }, 0)
      assert.equal(isCollisionWindowClear(Object.freeze(asteroid), Object.freeze(stationary), window, fixed), offset > 0)
    }

    for (const stopY of [undefined, 180]) {
      const endY = stopY ?? geometry.limits.min
      const startY = endY + 20
      const moving = prepareCollisionWindowSegment(geometry, 0, 30, startY, -4000, 10, stopY)
      const before = createShipRect(viewport, startY, wrist)
      const after = createShipRect(viewport, endY, wrist)
      const asteroid = anchorAsteroidMotion({ x: nose - direction * 20, y: after.centerY, radius: 7, vx: direction * 2000 }, 0)
      assert.ok(getSweptCollisionDamage(after, before, { ...asteroid, x: nose, previousX: asteroid.x }) > 0)
      assert.equal(isCollisionWindowClear(asteroid, moving, window, before), false)
    }
  }
})

test('grid contains every independent rectangle-oracle overlap at radii and cell boundaries', t => {
  let comparisons = 0
  let positives = 0
  for (const viewport of viewports) for (const wrist of wrists) {
    const limits = getShipYLimits(viewport, wrist)
    for (const y of [limits.min, viewport.height / 2, limits.max]) {
      const rect = createShipRect(viewport, y, wrist)
      const grid = createCollisionGrid(viewport)
      const xs = new Set()
      const ys = new Set()
      for (let x = rect.x - 19; x <= rect.x + rect.w + 19; x += 2) xs.add(x)
      for (let y = rect.y - 19; y <= rect.y + rect.h + 19; y += 2) ys.add(y)
      for (let i = 0; i <= grid.sliceCount; i++) for (const epsilon of [-1e-7, 0, 1e-7]) xs.add(i * grid.sliceWidth - grid.padding + epsilon)
      for (let i = 0; i <= grid.bucketCount; i++) for (const epsilon of [-1e-7, 0, 1e-7]) ys.add(i * grid.bucketHeight - grid.padding + epsilon)
      const circles = []
      for (let radius = 7; radius <= 18; radius++) for (const x of xs) for (const y of ys) {
        const circle = { x, y, radius }
        // Independent rectangle edge oracle, a stronger broad-phase contract
        // than the selected silhouette, including the historical omitted tail.
        const polygon = [[rect.x, rect.y], [rect.x + rect.w, rect.y], [rect.x + rect.w, rect.y + rect.h], [rect.x, rect.y + rect.h]]
        const inside = x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h
        const distance = inside ? 0 : Math.min(...polygon.map((a, i) => edgeDistance([x, y], a, polygon[(i + 1) % 4])))
        circle.expected = distance < radius - 1e-8
        comparisons++
        if (circle.expected) positives++
        circles.push(circle)
        addAsteroidToCollisionGrid(circle, grid)
      }
      const candidates = collectCollisionCandidatesFromGrid(grid, rect, wrist)
      const found = new Set(candidates)
      assert.equal(found.size, candidates.length, 'no duplicate center entries')
      for (const circle of circles) if (circle.expected) assert.ok(found.has(circle), JSON.stringify({ viewport, wrist, rect, circle }))
    }
  }
  t.diagnostic(`${comparisons} comparisons; ${positives} positive overlaps; zero omissions`)
})

test('narrow phase agrees with independent triangle oracle, including tail notch and empty corners', t => {
  let comparisons = 0
  for (const viewport of viewports) for (const wrist of wrists) {
    const rect = createShipRect(viewport, viewport.height / 2, wrist)
    for (let radius = 7; radius <= 18; radius++) for (let x = rect.x - 20; x <= rect.x + rect.w + 20; x += 2) {
      for (let y = rect.y - 20; y <= rect.y + rect.h + 20; y += 2) {
        const circle = { x, y, radius, lastHitAt: -Infinity }
        const distance = oracleDistance(rect, circle)
        if (Math.abs(distance - radius) < 1e-7) continue
        assert.equal(hit(rect, circle), distance < radius, JSON.stringify({ wrist, circle, rect }))
        comparisons++
      }
    }
    const tailX = wrist === 'left' ? rect.x + 0.5 : rect.x + rect.w - 0.5
    assert.equal(hit(rect, { x: tailX, y: rect.centerY, radius: 1, lastHitAt: -Infinity }), false, 'tail notch remains empty')
    assert.equal(hit(rect, { x: rect.centerX, y: rect.centerY, radius: 1, lastHitAt: -Infinity }), true)
  }
  t.diagnostic(`${comparisons} independent silhouette comparisons`)
})

test('continuous relative-motion hits agree with independent convex-distance minimization', () => {
  let seed = 42
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32 }
  for (const viewport of viewports) for (const wrist of wrists) for (let i = 0; i < 100; i++) {
    const previous = createShipRect(viewport, random() * viewport.height, wrist)
    const rect = createShipRect(viewport, random() * viewport.height, wrist)
    const circle = { previousX: random() * viewport.width, x: random() * viewport.width,
      y: random() * viewport.height, radius: 7 + random() * 11, lastHitAt: -Infinity }
    const distance = oracleSweptDistance(rect, previous, circle)
    if (Math.abs(distance - circle.radius) < 1e-6) continue
    const result = calculateCollisionResult({ shipRect: rect, previousShipRect: previous, asteroid: circle, now: 1000 })
    assert.equal(result.hit, distance < circle.radius, JSON.stringify({ rect, previous, circle, distance }))
    if (isAsteroidInCollisionBand(circle, rect, wrist, previous)) {
      assert.equal(getSweptCollisionDamage(rect, previous, circle), result.damage)
    }
  }
})

test('damage-only sweep preserves strict tangency and uncached ship geometry', () => {
  const rect = { x: 10, y: 20, w: 20, h: 20, wristSide: 'left' }
  for (const radius of [7, 12, 18]) {
    const tangent = { x: 30 + radius, y: 30, radius, lastHitAt: -Infinity }
    const overlapping = { ...tangent, x: tangent.x - 1e-7 }
    assert.equal(getSweptCollisionDamage(rect, rect, tangent), 0)
    const result = calculateCollisionResult({ shipRect: rect, asteroid: overlapping, now: 1000 })
    assert.ok(result.damage > 0)
    assert.equal(getSweptCollisionDamage(rect, rect, overlapping), result.damage)
  }
})

test('moving/pruned grid scenes omit no swept oracle hit and retain valid memberships', t => {
  let comparisons = 0
  for (const viewport of viewports) for (const wrist of wrists) {
    const grid = createCollisionGrid(viewport)
    const rect = createShipRect(viewport, viewport.height / 2, wrist)
    const circles = []
    for (let i = 0; i < 80; i++) {
      const circle = { x: (i * 31) % viewport.width, y: rect.y - 30 + i % 70, radius: 7 + i % 12,
        vx: (wrist === 'left' ? -1 : 1) * (100 + i * 90), lastHitAt: -Infinity }
      circles.push(circle)
      addAsteroidToCollisionGrid(circle, grid)
    }
    for (let step = 0; step < 20; step++) {
      advanceAsteroidsInCollisionGrid(circles, 0.01, viewport, grid, true)
      const candidates = collectCollisionCandidatesFromGrid(grid, rect, wrist)
      const found = new Set(candidates)
      const members = grid.slices.flat(2)
      assert.equal(new Set(members).size, circles.length)
      assert.equal(members.length, circles.length)
      for (const circle of circles) {
        assert.equal(grid.slices[circle.gridSliceIndex][circle.gridBucketIndex][circle.gridSlotIndex], circle)
        const distance = oracleSweptDistance(rect, rect, circle)
        if (distance < circle.radius - 1e-7) assert.ok(found.has(circle), JSON.stringify(circle))
        comparisons++
      }
    }
  }
  t.diagnostic(`${comparisons} swept moving-scene comparisons`)
})

test('all ship outline strokes clear HUD and screen at both flight limits', () => {
  for (const viewport of viewports) for (const wrist of wrists) {
    const limits = getShipYLimits(viewport, wrist)
    for (const request of [-1e6, limits.min, viewport.height / 2, limits.max, 1e6]) {
      const rect = createShipRect(viewport, request, wrist)
      for (const p of rect.points) {
        if (viewport.width === viewport.height) {
          assert.ok(Math.hypot(p.x - viewport.width / 2, p.y - viewport.height / 2) + 1.5 + 3 <= viewport.width / 2 - 16)
        } else {
          assert.ok(p.y - 1.5 >= 8 + 3)
          assert.ok(p.y + 1.5 <= viewport.height - 8 - 3)
        }
      }
      assert.ok(rect.centerY >= limits.min && rect.centerY <= limits.max)
    }
  }
})
