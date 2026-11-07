import { createWidget, prop, widget } from '@zos/ui'
import { COLORS } from '../../shared/constants.js'
import { getAsteroidXAt } from '../../shared/game-core.js'

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

  function showAsteroid(asteroid, x) {
    const { radius } = asteroid
    const y = Math.round(asteroid.y) - radius - SPRITE_PADDING
    const size = radius * 2 + SPRITE_PADDING * 2 + 1
    const options = { x, y, w: size, h: size }
    const slot = available.pop()
    if (slot) {
      if (slot.radius !== radius) options.src = `game-sprites/asteroid-${radius}.png`
      slot.image.setProperty(prop.MORE, options)
      slot.image.setProperty(prop.VISIBLE, true)
      slot.asteroid = asteroid
      slot.radius = radius
      slot.x = x
      return slot
    }

    options.src = `game-sprites/asteroid-${radius}.png`
    return { asteroid, radius, x, image: asteroidLayer.createWidget(widget.IMG, options) }
  }

  return {
    draw(asteroids, nextShipY, renderAtMs, interpolate) {
      // Canonical pruning marks the removed object before compacting the list.
      for (let i = active.length - 1; i >= 0; i -= 1) {
        const slot = active[i]
        if (!slot.asteroid.motionRemoved) continue
        slot.image.setProperty(prop.VISIBLE, false)
        views.delete(slot.asteroid)
        slot.asteroid = null
        available.push(slot)
        active[i] = active[active.length - 1]
        active.pop()
      }

      for (let i = 0; i < asteroids.length; i += 1) {
        const asteroid = asteroids[i]
        const centerX = interpolate ? getAsteroidXAt(asteroid, renderAtMs) : asteroid.x
        const x = Math.round(centerX) - asteroid.radius - SPRITE_PADDING
        const slot = views.get(asteroid)
        if (!slot) {
          const next = showAsteroid(asteroid, x)
          active.push(next)
          views.set(asteroid, next)
        } else if (slot.x !== x) {
          slot.image.setProperty(prop.MORE, { x })
          slot.x = x
        }
      }

      const y = Math.round(nextShipY) - SPRITE_PADDING
      if (y !== shipY) {
        ship.setProperty(prop.MORE, { y })
        shipY = y
      }
    },
  }
}
