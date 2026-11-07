import { createWidget, prop, widget } from '@zos/ui'
import { COLORS } from '../../shared/constants.js'

const SPRITE_PADDING = 2

export function createSpriteRenderer(surface, shipRect, wristSide) {
  createWidget(widget.FILL_RECT, { ...surface, color: COLORS.background })

  // The group stays below the ship and HUD when new asteroid views are added.
  const asteroidLayer = createWidget(widget.GROUP, surface)
  const ship = createWidget(widget.IMG, {
    x: shipRect.x - SPRITE_PADDING,
    y: shipRect.y - SPRITE_PADDING,
    src: `game-sprites/ship-${wristSide}.png`,
  })
  let shipY = shipRect.y - SPRITE_PADDING
  const views = new Map()
  const active = []
  const available = []
  let frameNumber = 0

  function showAsteroid(asteroid, x, y) {
    const { id, radius } = asteroid
    const size = radius * 2 + SPRITE_PADDING * 2 + 1
    const options = { x, y, w: size, h: size }
    const slot = available.pop()
    if (slot) {
      if (slot.radius !== radius) options.src = `game-sprites/asteroid-${radius}.png`
      slot.image.setProperty(prop.MORE, options)
      slot.image.setProperty(prop.VISIBLE, true)
      slot.id = id
      slot.radius = radius
      slot.x = x
      slot.y = y
      return slot
    }

    options.src = `game-sprites/asteroid-${radius}.png`
    return { id, radius, x, y, seen: 0, image: asteroidLayer.createWidget(widget.IMG, options) }
  }

  return {
    draw(frame) {
      const seen = ++frameNumber
      for (let i = 0; i < frame.asteroidCount; i += 1) {
        const asteroid = frame.asteroids[i]
        const offset = asteroid.radius + SPRITE_PADDING
        const x = Math.round(asteroid.x) - offset
        const y = Math.round(asteroid.y) - offset
        let slot = views.get(asteroid.id)
        if (!slot) {
          slot = showAsteroid(asteroid, x, y)
          active.push(slot)
          views.set(asteroid.id, slot)
        } else if (slot.x !== x || slot.y !== y) {
          slot.image.setProperty(prop.MORE, slot.y === y ? { x } : { x, y })
          slot.x = x
          slot.y = y
        }
        slot.seen = seen
      }

      for (let i = active.length - 1; i >= 0; i -= 1) {
        const slot = active[i]
        if (slot.seen === seen) continue
        slot.image.setProperty(prop.VISIBLE, false)
        views.delete(slot.id)
        slot.id = null
        available.push(slot)
        active[i] = active[active.length - 1]
        active.pop()
      }

      const y = Math.round(frame.ship.y) - SPRITE_PADDING
      if (y !== shipY) {
        ship.setProperty(prop.MORE, { y })
        shipY = y
      }
    },
  }
}
