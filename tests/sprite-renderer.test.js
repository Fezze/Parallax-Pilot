import test from 'node:test'
import assert from 'node:assert/strict'
import { createSpriteRenderer } from '../zepp-app/page/game/sprite-renderer.js'
import { __enableSpriteWidgets, __getWidgets, __resetUI } from './mocks/zos/ui.mjs'
import { __resetStorage, __seedLocalStorage } from './mocks/zos/storage.mjs'

const surface = { x: 0, y: 0, w: 480, h: 480 }
const ship = { x: 140, y: 220 }
const frame = (...asteroids) => ({ ship: { ...ship }, asteroids, asteroidCount: asteroids.length })
const image = (radius = 8) => ({
  x: 420, y: 140, radius, presentation: { view: null },
  get id() { throw new Error('Renderer must use the direct presentation record') },
})

function setup() {
  __resetUI()
  __enableSpriteWidgets()
  return createSpriteRenderer(surface, ship, 'left')
}

test('explicit retirement reuses a view in the same frame and preserves group stacking', () => {
  const renderer = setup()
  const first = image()
  renderer.draw(frame(first), [])
  const slot = first.presentation.view
  const asteroidLayer = __getWidgets()[1]
  assert.deepEqual(__getWidgets().slice(0, 3).map(widget => widget.type), ['FILL_RECT', 'GROUP', 'IMG'])
  assert.equal(slot.image.__parent, asteroidLayer)

  const second = image(12)
  const retired = [first.presentation]
  renderer.draw(frame(second), retired)
  assert.equal(first.presentation.view, null)
  assert.deepEqual(retired, [])
  assert.equal(second.presentation.view, slot)
  assert.deepEqual(slot.image.__propertyCalls, [
    { name: 'VISIBLE', value: false },
    { name: 'MORE', value: { x: 406, y: 126, w: 29, h: 29, src: 'game-sprites/asteroid-12.png' } },
    { name: 'VISIBLE', value: true },
  ])
  assert.equal(__getWidgets().length, 4)
  assert.equal(slot.image.__parent, asteroidLayer)
})

test('draw touches only explicit retirements and current records, with no redundant properties', () => {
  const renderer = setup()
  const first = image()
  const omitted = image()
  const neverShown = image()
  renderer.draw(frame(first, omitted), [])
  const firstWidget = first.presentation.view.image
  const omittedWidget = omitted.presentation.view.image
  const shipWidget = __getWidgets()[2]
  const unchanged = frame(first)
  first.x += 0.2
  unchanged.ship.y += 0.2
  const retired = [neverShown.presentation]
  renderer.draw(unchanged, retired)
  assert.deepEqual(retired, [])
  assert.equal(neverShown.presentation.view, null)
  assert.equal(__getWidgets().length, 5)
  assert.deepEqual(firstWidget.__propertyCalls, [])
  assert.deepEqual(omittedWidget.__propertyCalls, [])
  assert.deepEqual(shipWidget.__propertyCalls, [])
  first.x += 1
  unchanged.ship.y += 1
  renderer.draw(unchanged, [omitted.presentation])
  assert.deepEqual(firstWidget.__propertyCalls, [{ name: 'MORE', value: { x: 411 } }])
  assert.deepEqual(shipWidget.__propertyCalls, [{ name: 'MORE', value: { y: 219 } }])
  const replacement = image()
  renderer.draw(frame(first, replacement), [])
  assert.equal(replacement.presentation.view.image, omittedWidget)
  assert.equal(Object.hasOwn(omittedWidget.__propertyCalls.at(-2).value, 'src'), false)
})

test('repeated game destruction and replay release active records, buffers and the renderer pool', async context => {
  context.mock.timers.enable({ apis: ['setInterval'] })
  __resetStorage()
  __seedLocalStorage({ settings_v1: JSON.stringify({ controlMode: 'touch', wristSide: 'left' }) })
  await import('../zepp-app/page/game/index.js?sprite-lifecycle')
  const definition = globalThis.__zeppPageDefinition
  for (let replay = 0; replay < 3; replay += 1) {
    __resetUI()
    __enableSpriteWidgets()
    const page = { ...definition }
    page.onInit()
    page.build()
    const retired = { id: 'leaving', x: 420, y: 140, radius: 8, presentation: { view: null }, vx: 0, lastHitAt: -Infinity }
    const active = { ...retired, id: 'active', presentation: { view: null } }
    page.asteroids.push(retired, active)
    page.drawFrame()
    const slot = retired.presentation.view
    const renderer = page.spriteRenderer
    page.asteroids.shift()
    page.retiredPresentation.push(retired.presentation)
    page.drawFrame()
    assert.equal(retired.presentation.view, null)
    assert.ok(active.presentation.view)
    page.onDestroy()
    assert.equal(active.presentation.view, null)
    assert.equal(page.spriteRenderer, null)
    assert.equal(page.asteroids.length, 0)
    assert.equal(page.publishedFrame.asteroids.length, 0)
    assert.equal(page.nextPresentationFrame.asteroids.length, 0)
    const afterDestroy = image()
    renderer.draw(frame(afterDestroy), [])
    assert.notEqual(afterDestroy.presentation.view, slot, 'destroy empties recycled slots')
  }
})
