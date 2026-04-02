import { getDeviceInfo, SCREEN_SHAPE_ROUND } from '@zos/device'
import {
  createWidget,
  event,
  setStatusBarVisible,
  widget,
} from '@zos/ui'
import {
  GESTURE_DOWN,
  GESTURE_UP,
  KEY_HOME,
  offDigitalCrown,
  offGesture,
  onDigitalCrown,
  onGesture,
} from '@zos/interaction'
import {
  Accelerometer,
  FREQ_MODE_NORMAL,
  Vibrator,
  VIBRATOR_SCENE_SHORT_MIDDLE,
} from '@zos/sensor'
import { replace } from '@zos/router'
import {
  COLLISION_COOLDOWN_MS,
  COLORS,
  HP_MAX,
  ROUTES,
} from '../../shared/constants.js'
import {
  calculateCollisionResult,
  calculateDifficulty,
  clamp,
  createAsteroid,
  createScoreEntry,
  createShipRect,
  getSpawnIntervalMs,
  moveAsteroids,
  pruneAsteroids,
} from '../../shared/game-core.js'
import { sanitizeControlMode, supportsDigitalCrown } from '../../shared/device.js'
import { appendScore, loadSettings, saveLastSession, saveSettings } from '../../shared/storage.js'

function hideStatusBar() {
  try {
    setStatusBarVisible(false)
  } catch (_error) {}
}

function drawSquareHud(canvas, viewport, hpRatio) {
  const thickness = 8
  const perimeter =
    viewport.width * 2 + viewport.height * 2 - thickness * 4
  const active = perimeter * hpRatio
  let remaining = active

  canvas.drawRect({
    x1: 0,
    y1: 0,
    x2: viewport.width,
    y2: thickness,
    color: COLORS.hudInactive,
  })
  canvas.drawRect({
    x1: viewport.width - thickness,
    y1: 0,
    x2: viewport.width,
    y2: viewport.height,
    color: COLORS.hudInactive,
  })
  canvas.drawRect({
    x1: 0,
    y1: viewport.height - thickness,
    x2: viewport.width,
    y2: viewport.height,
    color: COLORS.hudInactive,
  })
  canvas.drawRect({
    x1: 0,
    y1: 0,
    x2: thickness,
    y2: viewport.height,
    color: COLORS.hudInactive,
  })

  const topLength = Math.min(remaining, viewport.width)
  if (topLength > 0) {
    canvas.drawRect({
      x1: 0,
      y1: 0,
      x2: topLength,
      y2: thickness,
      color: COLORS.hudActive,
    })
  }
  remaining -= topLength

  const rightLength = Math.min(remaining, viewport.height)
  if (rightLength > 0) {
    canvas.drawRect({
      x1: viewport.width - thickness,
      y1: 0,
      x2: viewport.width,
      y2: rightLength,
      color: COLORS.hudActive,
    })
  }
  remaining -= rightLength

  const bottomLength = Math.min(remaining, viewport.width)
  if (bottomLength > 0) {
    canvas.drawRect({
      x1: viewport.width - bottomLength,
      y1: viewport.height - thickness,
      x2: viewport.width,
      y2: viewport.height,
      color: COLORS.hudActive,
    })
  }
  remaining -= bottomLength

  const leftLength = Math.min(remaining, viewport.height)
  if (leftLength > 0) {
    canvas.drawRect({
      x1: 0,
      y1: viewport.height - leftLength,
      x2: thickness,
      y2: viewport.height,
      color: COLORS.hudActive,
    })
  }
}

function drawRoundHud(canvas, viewport, hpRatio) {
  const margin = 12
  canvas.setPaint({
    color: COLORS.hudInactive,
    line_width: 8,
  })
  canvas.strokeArc({
    center_x: viewport.width / 2,
    center_y: viewport.height / 2,
    radius_x: viewport.width / 2 - margin,
    radius_y: viewport.height / 2 - margin,
    start_angle: -90,
    end_angle: 270,
    color: COLORS.hudInactive,
  })
  canvas.strokeArc({
    center_x: viewport.width / 2,
    center_y: viewport.height / 2,
    radius_x: viewport.width / 2 - margin,
    radius_y: viewport.height / 2 - margin,
    start_angle: -90,
    end_angle: -90 + hpRatio * 360,
    color: COLORS.hudActive,
  })
}

Page({
  onInit() {
    const deviceInfo = getDeviceInfo()
    const crownSupported = supportsDigitalCrown(deviceInfo)
    const loadedSettings = loadSettings()
    const settings = {
      ...loadedSettings,
      controlMode: sanitizeControlMode(loadedSettings.controlMode, crownSupported),
    }

    if (settings.controlMode !== loadedSettings.controlMode) {
      saveSettings(settings)
    }

    this.deviceInfo = deviceInfo
    this.viewport = {
      width: deviceInfo.width,
      height: deviceInfo.height,
    }
    this.settings = settings
    this.crownSupported = crownSupported
    this.shipCenterY = deviceInfo.height / 2
    this.crownCenterY = deviceInfo.height / 2
    this.touchDirection = 0
    this.asteroids = []
    this.asteroidSeed = 0
    this.hp = HP_MAX
    this.startedAt = Date.now()
    this.lastFrameAt = this.startedAt
    this.lastSpawnAt = this.startedAt
    this.lastDamageAt = 0
    this.finished = false
    this.accelerometer = null
    this.vibrator = new Vibrator()
  },

  build() {
    hideStatusBar()

    this.canvas = createWidget(widget.CANVAS, {
      x: 0,
      y: 0,
      w: this.viewport.width,
      h: this.viewport.height,
    })

    this.bindCanvasEvents()
    this.bindGestureEvents()
    this.bindCrownEvents()
    this.bindTiltSensor()
    this.drawFrame()

    this.loop = setInterval(() => {
      this.tick()
    }, 33)
  },

  onDestroy() {
    if (this.loop) {
      clearInterval(this.loop)
      this.loop = null
    }

    offGesture()
    offDigitalCrown()

    if (this.accelerometer) {
      this.accelerometer.stop()
      this.accelerometer = null
    }
  },

  bindCanvasEvents() {
    const updateTouchDirection = (y) => {
      if (this.settings.controlMode !== 'touch') {
        return
      }

      this.touchDirection = y < this.viewport.height / 2 ? -1 : 1
    }

    this.canvas.addEventListener(event.CLICK_DOWN, (info) => {
      updateTouchDirection(info.y)
    })
    this.canvas.addEventListener(event.CLICK_UP, () => {
      this.touchDirection = 0
    })
    this.canvas.addEventListener(event.MOVE, (info) => {
      updateTouchDirection(info.y)
    })
  },

  bindGestureEvents() {
    onGesture({
      callback: (gestureEvent) => {
        if (this.settings.controlMode === 'swipe') {
          const step = this.viewport.height * 0.11
          if (gestureEvent === GESTURE_UP) {
            this.shipCenterY -= step
          }
          if (gestureEvent === GESTURE_DOWN) {
            this.shipCenterY += step
          }
        }

        return true
      },
    })
  },

  bindCrownEvents() {
    if (!this.crownSupported) {
      return
    }

    onDigitalCrown({
      callback: (key, degree) => {
        if (key !== KEY_HOME || this.settings.controlMode !== 'crown') {
          return
        }

        this.crownCenterY = clamp(
          this.crownCenterY - degree * 0.8,
          20,
          this.viewport.height - 20
        )
      },
    })
  },

  bindTiltSensor() {
    if (this.settings.controlMode !== 'tilt') {
      return
    }

    this.accelerometer = new Accelerometer()
    this.accelerometer.setFreqMode(FREQ_MODE_NORMAL)
    this.accelerometer.start()
  },

  updateShip(deltaSeconds) {
    const minDimension = Math.min(this.viewport.width, this.viewport.height)
    const baseSpeed = minDimension * 0.74 * this.settings.tiltSensitivity

    if (this.settings.controlMode === 'tilt' && this.accelerometer) {
      const current = this.accelerometer.getCurrent() || { y: 0 }
      const normalized = clamp(current.y / 18, -1.15, 1.15)
      this.shipCenterY += normalized * baseSpeed * deltaSeconds
    }

    if (this.settings.controlMode === 'touch') {
      this.shipCenterY += this.touchDirection * baseSpeed * deltaSeconds
    }

    if (this.settings.controlMode === 'crown') {
      this.shipCenterY = this.crownCenterY
    }

    this.shipCenterY = clamp(this.shipCenterY, 20, this.viewport.height - 20)
  },

  spawnAsteroids(now, shipRect, difficulty) {
    const spawnInterval = getSpawnIntervalMs(
      difficulty,
      this.settings.spawnMultiplier
    )
    if (now - this.lastSpawnAt < spawnInterval) {
      return
    }

    this.lastSpawnAt = now
    this.asteroidSeed += 1
    this.asteroids.push(
      createAsteroid({
        id: `${now}-${this.asteroidSeed}`,
        viewport: this.viewport,
        difficulty,
        shipRect,
        asteroids: this.asteroids,
        wristSide: this.settings.wristSide,
      })
    )
  },

  handleCollisions(now, shipRect, difficulty) {
    let didDamage = false

    this.asteroids = this.asteroids.map((asteroid) => {
      const collision = calculateCollisionResult({
        shipRect,
        asteroid,
        difficulty,
        now,
        cooldownMs: COLLISION_COOLDOWN_MS,
      })

      if (!collision.hit) {
        return asteroid
      }

      didDamage = true
      this.hp = Math.max(0, this.hp - collision.damage)
      return {
        ...asteroid,
        lastHitAt: now,
      }
    })

    if (didDamage && now - this.lastDamageAt > 90) {
      this.lastDamageAt = now
      this.vibrator.start({
        mode: VIBRATOR_SCENE_SHORT_MIDDLE,
      })
    }

    if (this.hp <= 0) {
      this.finishRun(now)
    }
  },

  finishRun(now) {
    if (this.finished) {
      return
    }

    this.finished = true
    const scoreEntry = createScoreEntry(now - this.startedAt, this.settings, now)
    saveLastSession(scoreEntry)
    appendScore(scoreEntry)
    replace({ url: ROUTES.RESULTS })
  },

  tick() {
    if (this.finished) {
      return
    }

    const now = Date.now()
    const deltaSeconds = Math.min((now - this.lastFrameAt) / 1000, 0.05)
    this.lastFrameAt = now

    this.updateShip(deltaSeconds)

    const shipRect = createShipRect(
      this.viewport,
      this.shipCenterY,
      this.settings.wristSide
    )
    const difficulty = calculateDifficulty(
      now - this.startedAt,
      this.settings.timeScale
    )

    this.spawnAsteroids(now, shipRect, difficulty)
    this.asteroids = pruneAsteroids(
      moveAsteroids(this.asteroids, deltaSeconds),
      this.viewport
    )
    this.handleCollisions(now, shipRect, difficulty)
    this.drawFrame()
  },

  drawFrame() {
    const now = Date.now()
    const shipRect = createShipRect(
      this.viewport,
      this.shipCenterY,
      this.settings.wristSide
    )

    this.canvas.clear({
      x: 0,
      y: 0,
      w: this.viewport.width,
      h: this.viewport.height,
    })
    this.canvas.drawRect({
      x1: 0,
      y1: 0,
      x2: this.viewport.width,
      y2: this.viewport.height,
      color: COLORS.background,
    })

    this.asteroids.forEach((asteroid) => {
      this.canvas.drawCircle({
        center_x: asteroid.x,
        center_y: asteroid.y,
        radius: asteroid.radius,
        color: COLORS.asteroid,
      })
    })

    const shipPoints =
      this.settings.wristSide === 'left'
        ? [
            { x: shipRect.x + shipRect.w, y: shipRect.centerY },
            { x: shipRect.x, y: shipRect.y },
            { x: shipRect.x + shipRect.w * 0.28, y: shipRect.centerY },
            { x: shipRect.x, y: shipRect.y + shipRect.h },
            { x: shipRect.x + shipRect.w, y: shipRect.centerY },
          ]
        : [
            { x: shipRect.x, y: shipRect.centerY },
            { x: shipRect.x + shipRect.w, y: shipRect.y },
            { x: shipRect.x + shipRect.w * 0.72, y: shipRect.centerY },
            { x: shipRect.x + shipRect.w, y: shipRect.y + shipRect.h },
            { x: shipRect.x, y: shipRect.centerY },
          ]

    this.canvas.drawPoly({
      data_array: shipPoints,
      color: COLORS.ship,
    })

    const hpRatio = this.hp / HP_MAX
    if (this.deviceInfo.screenShape === SCREEN_SHAPE_ROUND) {
      drawRoundHud(this.canvas, this.viewport, hpRatio)
    } else {
      drawSquareHud(this.canvas, this.viewport, hpRatio)
    }

    this.canvas.drawText({
      x: 16,
      y: 18,
      text: `${Math.round(now - this.startedAt)}`,
      text_size: 22,
      color: COLORS.textPrimary,
    })

    this.canvas.drawText({
      x: 16,
      y: 46,
      text: `${this.settings.controlMode.toUpperCase()}  HP ${this.hp}`,
      text_size: 14,
      color: COLORS.textMuted,
    })

    this.canvas.drawText({
      x: 16,
      y: this.viewport.height - 28,
      text: `TIME ${this.settings.timeScale}x  SPAWN ${this.settings.spawnMultiplier}x`,
      text_size: 14,
      color: COLORS.textMuted,
    })
  },
})
