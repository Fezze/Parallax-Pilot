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
  const available = []

  function showAsteroid(asteroid) {
    const { radius } = asteroid
    // An asteroid only moves horizontally during its lifetime.
    const offset = radius + SPRITE_PADDING
    const size = radius * 2 + SPRITE_PADDING * 2 + 1
    const x = Math.round(asteroid.x) - offset
    const options = { x, y: Math.round(asteroid.y) - offset, w: size, h: size }
    const slot = available.pop()
    if (slot) {
      if (slot.radius !== radius) options.src = `game-sprites/asteroid-${radius}.png`
      slot.image.setProperty(prop.MORE, options)
      slot.image.setProperty(prop.VISIBLE, true)
      slot.radius = radius
      slot.x = x
      slot.offset = offset
      return slot
    }

    options.src = `game-sprites/asteroid-${radius}.png`
    return { radius, x, offset, image: asteroidLayer.createWidget(widget.IMG, options) }
  }

  return {
    draw(frame, retiredPresentation) {
      for (const record of retiredPresentation) {
        const slot = record.view
        if (!slot) continue
        slot.image.setProperty(prop.VISIBLE, false)
        available.push(slot)
        record.view = null
      }
      retiredPresentation.length = 0

      for (let i = 0; i < frame.asteroidCount; i += 1) {
        const asteroid = frame.asteroids[i]
        const record = asteroid.presentation
        const slot = record.view
        if (!slot) {
          record.view = showAsteroid(asteroid)
        } else {
          const x = Math.round(asteroid.x) - slot.offset
          if (slot.x !== x) {
            slot.image.setProperty(prop.MORE, { x })
            slot.x = x
          }
        }
      }

      const y = Math.round(frame.ship.y) - SPRITE_PADDING
      if (y !== shipY) {
        ship.setProperty(prop.MORE, { y })
        shipY = y
      }
    },

    destroy() {
      available.length = 0
    },
  }
}
