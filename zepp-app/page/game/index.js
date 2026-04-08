import { getDeviceInfo, SCREEN_SHAPE_ROUND } from '@zos/device'
import { resetPageBrightTime, setPageBrightTime } from '@zos/display'
import {
  createWidget,
  event,
  setStatusBarVisible,
  widget,
} from '@zos/ui'
import { log } from '@zos/utils'
import {
  offGesture,
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
  COLLISION_SLICE_WIDTH,
  COLLISION_COOLDOWN_MS,
  COLORS,
  HP_MAX,
  ROUTES,
} from '../../shared/constants.js'
import {
  addAsteroidToCollisionGrid,
  advanceAsteroidsInCollisionGrid,
  calculateCollisionResult,
  calculateDifficulty,
  clamp,
  collectCollisionCandidatesFromGrid,
  createCollisionGrid,
  createAsteroid,
  createScoreEntry,
  createShipRect,
  getSpawnIntervalMs,
} from '../../shared/game-core.js'
import { sanitizeControlMode } from '../../shared/device.js'
import { normalizeTiltInput } from '../../shared/tilt-calibration.js'
import { appendScore, loadSettings, loadTiltCalibration, saveLastSession, saveSettings } from '../../shared/storage.js'

const FRAME_INTERVAL_MS = 16
const SHIP_BOUNDARY = 20
const pageLogger = log.getLogger('game')
const SQUARE_SPAWN_INTERVAL_FACTOR = 0.84
const GAME_BRIGHT_TIME_MS = 600000
const MAX_SPAWNS_PER_TICK = 2
const CONTROL_BASE_SPEED_FACTOR = 0.46

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

function keepScreenAwake() {
  try {
    setPageBrightTime({
      brightTime: GAME_BRIGHT_TIME_MS,
    })
  } catch (_error) {}
}

function restoreScreenTimeout() {
  try {
    resetPageBrightTime()
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

Page({
  onInit() {
    const deviceInfo = getDeviceInfo()
    const loadedSettings = loadSettings()
    const settings = {
      ...loadedSettings,
      controlMode: sanitizeControlMode(loadedSettings.controlMode),
    }

    if (settings.controlMode !== loadedSettings.controlMode) {
      saveSettings(settings)
    }

    this.deviceInfo = deviceInfo
    this.viewport = {
      width: deviceInfo.width,
      height: deviceInfo.height,
    }
    this.viewportHalfHeight = this.viewport.height / 2
    this.settings = settings
    this.tiltCalibration = loadTiltCalibration()
    this.collisionSliceWidth = COLLISION_SLICE_WIDTH
    this.shipCenterY = deviceInfo.height / 2
    this.touchDirection = 0
    this.pointerDown = false
    this.swipeStartTouchY = null
    this.swipeCurrentTouchY = null
    this.swipeStartShipY = this.shipCenterY
    this.asteroids = []
    this.collisionCandidates = []
    this.collisionGrid = createCollisionGrid(
      this.viewport,
      this.collisionSliceWidth
    )
    this.asteroidSeed = 0
    this.hp = HP_MAX
    this.startedAt = Date.now()
    this.lastFrameAt = this.startedAt
    this.lastSpawnAt = this.startedAt
    this.lastDamageAt = 0
    this.finished = false
    this.accelerometer = null
    this.vibrator = new Vibrator()
    this.baseControlSpeed =
      Math.min(this.viewport.width, this.viewport.height) *
      CONTROL_BASE_SPEED_FACTOR *
      (this.tiltCalibration ? 1 : this.settings.tiltSensitivity)
    this.shipPoints = Array.from({ length: 5 }, () => ({ x: 0, y: 0 }))
    this.shipRect = createShipRect(
      this.viewport,
      this.shipCenterY,
      this.settings.wristSide
    )
    pageLogger.info(
      `init keyType=${deviceInfo.keyType || 'unknown'} keyNumber=${deviceInfo.keyNumber || 'unknown'}`
    )
  },

  build() {
    hideStatusBar()
    keepScreenAwake()

    this.canvas = createWidget(widget.CANVAS, {
      x: 0,
      y: 0,
      w: this.viewport.width,
      h: this.viewport.height,
    })

      this.bindCanvasEvents()
      this.bindGestureEvents()
      this.bindTiltSensor()
      this.drawFrame()

    this.loop = setInterval(() => {
      this.tick()
    }, FRAME_INTERVAL_MS)
  },

  onDestroy() {
    restoreScreenTimeout()

    if (this.loop) {
      clearInterval(this.loop)
      this.loop = null
    }

    offGesture()

    if (this.accelerometer) {
      this.accelerometer.stop()
      this.accelerometer = null
    }
  },

  bindCanvasEvents() {
    const beginPointerInput = (y) => {
      if (this.settings.controlMode === 'touch') {
        this.touchDirection = y < this.viewportHalfHeight ? -1 : 1
      }

      if (this.settings.controlMode === 'swipe') {
        this.swipeStartTouchY = y
        this.swipeCurrentTouchY = y
        this.swipeStartShipY = this.shipCenterY
      }
    }

    const updatePointerInput = (y) => {
      if (this.settings.controlMode === 'touch') {
        this.touchDirection = y < this.viewportHalfHeight ? -1 : 1
      }

      if (
        this.settings.controlMode === 'swipe' &&
        this.swipeStartTouchY !== null
      ) {
        this.swipeCurrentTouchY = y
      }
    }

    this.canvas.addEventListener(event.CLICK_DOWN, (info) => {
      this.pointerDown = true
      beginPointerInput(info.y)
    })
    this.canvas.addEventListener(event.CLICK_UP, () => {
      this.pointerDown = false
      this.touchDirection = 0
      this.swipeStartTouchY = null
      this.swipeCurrentTouchY = null
    })
    this.canvas.addEventListener(event.MOVE, (info) => {
      if (!this.pointerDown) {
        return
      }

      updatePointerInput(info.y)
    })
  },

  bindGestureEvents() {
    onGesture({
      callback: () => true,
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
    if (this.settings.controlMode === 'tilt' && this.accelerometer) {
      const current = this.accelerometer.getCurrent() || { y: 0 }
      const normalized = normalizeTiltInput(
        current.y,
        this.tiltCalibration,
        this.settings.wristSide
      )
      this.shipCenterY += normalized * this.baseControlSpeed * deltaSeconds
    }

    if (this.settings.controlMode === 'touch') {
      this.shipCenterY += this.touchDirection * this.baseControlSpeed * deltaSeconds
    }

    if (
      this.settings.controlMode === 'swipe' &&
      this.pointerDown &&
      this.swipeStartTouchY !== null &&
      this.swipeCurrentTouchY !== null
    ) {
      this.shipCenterY = this.swipeStartShipY + (
        this.swipeCurrentTouchY - this.swipeStartTouchY
      )
    }

    this.shipCenterY = clampShipY(this.shipCenterY, this.viewport.height)
  },

  spawnAsteroids(now, shipRect, difficulty) {
    const spawnInterval =
      getSpawnIntervalMs(
        difficulty,
        this.settings.spawnMultiplier
      ) *
      (this.deviceInfo.screenShape === SCREEN_SHAPE_ROUND
        ? 1
        : SQUARE_SPAWN_INTERVAL_FACTOR)
    const elapsedSinceSpawn = now - this.lastSpawnAt
    if (elapsedSinceSpawn < spawnInterval) {
      return
    }

    const rawSpawnCount = Math.floor(elapsedSinceSpawn / spawnInterval)
    const spawnCount = Math.min(
      MAX_SPAWNS_PER_TICK,
      Math.max(1, rawSpawnCount)
    )
    const remainingDebt = Math.max(
      0,
      elapsedSinceSpawn - spawnInterval * spawnCount
    )
    this.lastSpawnAt = now - Math.min(spawnInterval, remainingDebt)

    for (let index = 0; index < spawnCount; index += 1) {
      this.asteroidSeed += 1
      const asteroid = createAsteroid({
        id: `${now}-${this.asteroidSeed}`,
        viewport: this.viewport,
        difficulty,
        shipRect,
        asteroids: this.asteroids,
        grid: this.collisionGrid,
        wristSide: this.settings.wristSide,
      })

      this.asteroids.push(asteroid)
      addAsteroidToCollisionGrid(asteroid, this.collisionGrid)
    }
  },

  handleCollisions(now, shipRect, difficulty) {
    let didDamage = false

    for (let index = 0; index < this.collisionCandidates.length; index += 1) {
      const asteroid = this.collisionCandidates[index]
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
    this.shipRect = shipRect
    const difficulty = calculateDifficulty(
      now - this.startedAt,
      this.settings.timeScale
    )

    this.spawnAsteroids(now, shipRect, difficulty)
    advanceAsteroidsInCollisionGrid(
      this.asteroids,
      deltaSeconds,
      this.viewport,
      this.collisionGrid
    )
    collectCollisionCandidatesFromGrid(
      this.collisionGrid,
      shipRect,
      this.settings.wristSide,
      this.collisionCandidates
    )
    this.handleCollisions(now, shipRect, difficulty)
    this.drawFrame(shipRect)
  },

  drawFrame(shipRect = this.shipRect) {
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
    for (let index = 0; index < this.asteroids.length; index += 1) {
      const asteroid = this.asteroids[index]
      this.canvas.strokeCircle({
        center_x: asteroid.x,
        center_y: asteroid.y,
        radius: asteroid.radius,
        color: COLORS.asteroid,
      })
    }

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
  },
})
