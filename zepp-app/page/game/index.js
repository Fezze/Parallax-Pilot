import { getDeviceInfo, SCREEN_SHAPE_ROUND } from '@zos/device'
import {
  createWidget,
  event,
  setStatusBarVisible,
  widget,
} from '@zos/ui'
import { log } from '@zos/utils'
import {
  offDigitalCrown,
  offGesture,
  offKey,
  onDigitalCrown,
  onGesture,
  onKey,
  KEY_DOWN,
  KEY_EVENT_CLICK,
  KEY_EVENT_DOUBLE_CLICK,
  KEY_EVENT_LONG_PRESS,
  KEY_EVENT_PRESS,
  KEY_EVENT_RELEASE,
  KEY_HOME,
  KEY_SHORTCUT,
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
  advanceAsteroidsInPlace,
  calculateCollisionResult,
  calculateDifficulty,
  clamp,
  createAsteroid,
  createScoreEntry,
  createShipRect,
  getSpawnIntervalMs,
} from '../../shared/game-core.js'
import { sanitizeControlMode, supportsDigitalCrown } from '../../shared/device.js'
import { appendScore, loadSettings, saveLastSession, saveSettings } from '../../shared/storage.js'

const FRAME_INTERVAL_MS = 16
const SHIP_BOUNDARY = 20
const pageLogger = log.getLogger('game')
const BUTTON_STEP = 26

function getLegacyHmApp() {
  if (typeof hmApp !== 'undefined') {
    return hmApp
  }

  if (typeof globalThis !== 'undefined' && globalThis.hmApp) {
    return globalThis.hmApp
  }

  return null
}

function clampShipY(value, viewportHeight) {
  return clamp(value, SHIP_BOUNDARY, viewportHeight - SHIP_BOUNDARY)
}

function updateShipPoints(points, shipRect, wristSide) {
  if (wristSide === 'left') {
    points[0].x = shipRect.x + shipRect.w
    points[0].y = shipRect.centerY
    points[1].x = shipRect.x
    points[1].y = shipRect.y
    points[2].x = shipRect.x + shipRect.w * 0.28
    points[2].y = shipRect.centerY
    points[3].x = shipRect.x
    points[3].y = shipRect.y + shipRect.h
    points[4].x = shipRect.x + shipRect.w
    points[4].y = shipRect.centerY
    return points
  }

  points[0].x = shipRect.x
  points[0].y = shipRect.centerY
  points[1].x = shipRect.x + shipRect.w
  points[1].y = shipRect.y
  points[2].x = shipRect.x + shipRect.w * 0.72
  points[2].y = shipRect.centerY
  points[3].x = shipRect.x + shipRect.w
  points[3].y = shipRect.y + shipRect.h
  points[4].x = shipRect.x
  points[4].y = shipRect.centerY
  return points
}

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

function drawOutlineShip(canvas, shipPoints) {
  canvas.setPaint({
    color: COLORS.ship,
    line_width: 3,
  })

  for (let index = 0; index < shipPoints.length - 1; index += 1) {
    const start = shipPoints[index]
    const end = shipPoints[index + 1]

    canvas.drawLine({
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
      color: COLORS.ship,
    })
  }
}

function shouldConsumeLegacySpin(controlMode) {
  return controlMode === 'crown'
}

function isUpButton(key) {
  return key === KEY_HOME
}

function isDownButton(key) {
  return key === KEY_SHORTCUT || key === KEY_DOWN
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
    this.pointerDown = false
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
    this.lastRotaryDegree = 0
    this.lastRotaryKey = '--'
    this.lastRotaryAt = 0
    this.lastRotarySource = '--'
    this.lastKeyCode = '--'
    this.lastKeyEvent = '--'
    this.lastKeySource = '--'
    this.lastKeyAt = 0
    this.buttonDirection = 0
    this.buttonClickDirection = -1
    this.shipPoints = Array.from({ length: 5 }, () => ({ x: 0, y: 0 }))
    pageLogger.info(
      `init keyType=${deviceInfo.keyType || 'unknown'} keyNumber=${deviceInfo.keyNumber || 'unknown'} crownSupported=${crownSupported}`
    )
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
      this.bindHardwareKeyEvents()
      this.bindTiltSensor()
      this.drawFrame()

    this.loop = setInterval(() => {
      this.tick()
    }, FRAME_INTERVAL_MS)
  },

  onDestroy() {
    if (this.loop) {
      clearInterval(this.loop)
      this.loop = null
    }

    offGesture()
    offDigitalCrown()
    offKey()
    const legacyHmApp = getLegacyHmApp()
    if (
      legacyHmApp &&
      typeof legacyHmApp.unregisterSpinEvent === 'function'
    ) {
      legacyHmApp.unregisterSpinEvent()
    }
    if (
      legacyHmApp &&
      typeof legacyHmApp.unregisterKeyEvent === 'function'
    ) {
      legacyHmApp.unregisterKeyEvent()
    }

    if (this.accelerometer) {
      this.accelerometer.stop()
      this.accelerometer = null
    }
  },

  bindCanvasEvents() {
    const applyPointerInput = (y) => {
      if (this.settings.controlMode === 'touch') {
        this.touchDirection = y < this.viewport.height / 2 ? -1 : 1
      }

      if (this.settings.controlMode === 'swipe') {
        this.shipCenterY = clamp(y, 20, this.viewport.height - 20)
      }
    }

    this.canvas.addEventListener(event.CLICK_DOWN, (info) => {
      this.pointerDown = true
      applyPointerInput(info.y)
    })
    this.canvas.addEventListener(event.CLICK_UP, () => {
      this.pointerDown = false
      this.touchDirection = 0
    })
    this.canvas.addEventListener(event.MOVE, (info) => {
      if (!this.pointerDown) {
        return
      }

      applyPointerInput(info.y)
    })
  },

  bindGestureEvents() {
    onGesture({
      callback: () => true,
    })
  },

  bindCrownEvents() {
    const applyRotary = (source, key, degree) => {
      this.lastRotaryKey = `${key}`
      this.lastRotaryDegree = degree
      this.lastRotaryAt = Date.now()
      this.lastRotarySource = source
      pageLogger.debug(`${source} key=${key} degree=${degree}`)

      if (this.settings.controlMode !== 'crown') {
        return
      }

      this.crownCenterY = clamp(
        this.crownCenterY - degree * 2.2,
        SHIP_BOUNDARY,
        this.viewport.height - SHIP_BOUNDARY
      )
      this.shipCenterY = this.crownCenterY
    }

    pageLogger.info('register onDigitalCrown')
    onDigitalCrown({
      callback: (key, degree) => {
        applyRotary('newapi', key, degree)
      },
    })

    const legacyHmApp = getLegacyHmApp()
    if (
      legacyHmApp &&
      typeof legacyHmApp.registerSpinEvent === 'function'
    ) {
      pageLogger.info('register hmApp.registerSpinEvent')
      legacyHmApp.registerSpinEvent((key, degree) => {
        applyRotary('legacy', key, degree)
        return shouldConsumeLegacySpin(this.settings.controlMode)
      })
    } else {
      pageLogger.warn('hmApp.registerSpinEvent unavailable')
    }
  },

  bindHardwareKeyEvents() {
    const applyHardwareKey = (source, key, keyEvent) => {
      this.lastKeyCode = `${key}`
      this.lastKeyEvent = `${keyEvent}`
      this.lastKeySource = source
      this.lastKeyAt = Date.now()
      pageLogger.debug(`${source} key=${key} event=${keyEvent}`)

      if (this.settings.controlMode !== 'crown') {
        return false
      }

      if (keyEvent === KEY_EVENT_PRESS) {
        if (isDownButton(key)) {
          this.buttonDirection = 1
          return true
        }
      }

      if (keyEvent === KEY_EVENT_LONG_PRESS) {
        if (isUpButton(key) || isDownButton(key)) {
          this.buttonDirection = 1
          return true
        }
      }

      if (keyEvent === KEY_EVENT_DOUBLE_CLICK) {
        if (isUpButton(key) || isDownButton(key)) {
          this.crownCenterY = clamp(
            this.crownCenterY + BUTTON_STEP,
            SHIP_BOUNDARY,
            this.viewport.height - SHIP_BOUNDARY
          )
          this.shipCenterY = this.crownCenterY
          return true
        }
      }

      if (keyEvent === KEY_EVENT_RELEASE) {
        if (isUpButton(key) || isDownButton(key)) {
          this.buttonDirection = 0
          return true
        }
      }

      if (keyEvent === KEY_EVENT_CLICK) {
        if (isUpButton(key)) {
          this.crownCenterY = clamp(
            this.crownCenterY + this.buttonClickDirection * BUTTON_STEP,
            SHIP_BOUNDARY,
            this.viewport.height - SHIP_BOUNDARY
          )
          this.shipCenterY = this.crownCenterY
          this.buttonClickDirection *= -1
          return true
        }

        if (isDownButton(key)) {
          this.crownCenterY = clamp(
            this.crownCenterY + BUTTON_STEP,
            SHIP_BOUNDARY,
            this.viewport.height - SHIP_BOUNDARY
          )
          this.shipCenterY = this.crownCenterY
          return true
        }
      }

      return false
    }

    pageLogger.info('register onKey')
    onKey({
      callback: (key, keyEvent) => applyHardwareKey('newkey', key, keyEvent),
    })

    const legacyHmApp = getLegacyHmApp()
    if (
      legacyHmApp &&
      typeof legacyHmApp.registerKeyEvent === 'function'
    ) {
      pageLogger.info('register hmApp.registerKeyEvent')
      legacyHmApp.registerKeyEvent((key, action) =>
        applyHardwareKey('legacykey', key, action)
      )
    } else {
      pageLogger.warn('hmApp.registerKeyEvent unavailable')
    }
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
      if (this.buttonDirection !== 0) {
        this.crownCenterY += this.buttonDirection * baseSpeed * deltaSeconds
      }
      this.shipCenterY = this.crownCenterY
    }

    this.shipCenterY = clampShipY(this.shipCenterY, this.viewport.height)
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

    for (let index = 0; index < this.asteroids.length; index += 1) {
      const asteroid = this.asteroids[index]
      const collision = calculateCollisionResult({
        shipRect,
        asteroid,
        difficulty,
        now,
        cooldownMs: COLLISION_COOLDOWN_MS,
      })

      if (!collision.hit) {
        continue
      }

      didDamage = true
      this.hp = Math.max(0, this.hp - collision.damage)
      asteroid.lastHitAt = now
    }

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
    advanceAsteroidsInPlace(this.asteroids, deltaSeconds, this.viewport)
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

    this.canvas.setPaint({
      color: COLORS.asteroid,
      line_width: 2,
    })
    this.asteroids.forEach((asteroid) => {
      this.canvas.strokeCircle({
        center_x: asteroid.x,
        center_y: asteroid.y,
        radius: asteroid.radius,
        color: COLORS.asteroid,
      })
    })

    drawOutlineShip(
      this.canvas,
      updateShipPoints(this.shipPoints, shipRect, this.settings.wristSide)
    )

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

    if (this.settings.controlMode === 'crown') {
      const ageMs = this.lastRotaryAt ? now - this.lastRotaryAt : -1
      const rawText =
        ageMs >= 0
          ? `ROT ${this.lastRotaryDegree} ${this.lastRotarySource} ${ageMs}ms`
          : 'ROT NO EVENT'

      this.canvas.drawText({
        x: 16,
        y: 64,
        text: rawText,
        text_size: 14,
        color: COLORS.textMuted,
      })

      this.canvas.drawText({
        x: 16,
        y: 82,
        text: `TYPE ${this.deviceInfo.keyType || 'unknown'} K ${this.lastRotaryKey}`,
        text_size: 14,
        color: COLORS.textMuted,
      })

      const keyAgeMs = this.lastKeyAt ? now - this.lastKeyAt : -1
      this.canvas.drawText({
        x: 16,
        y: 100,
        text:
          keyAgeMs >= 0
            ? `KEY ${this.lastKeyCode}/${this.lastKeyEvent} ${this.lastKeySource} ${keyAgeMs}ms`
            : 'KEY NO EVENT',
        text_size: 14,
        color: COLORS.textMuted,
      })
    }

    this.canvas.drawText({
      x: 16,
      y: this.viewport.height - 28,
      text: `TIME ${this.settings.timeScale}x  SPAWN ${this.settings.spawnMultiplier}x`,
      text_size: 14,
      color: COLORS.textMuted,
    })
  },
})
