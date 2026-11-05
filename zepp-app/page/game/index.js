import { getDeviceInfo, SCREEN_SHAPE_ROUND } from '@zos/device'
import { resetPageBrightTime, setPageBrightTime } from '@zos/display'
import {
  createWidget,
  event,
  setStatusBarVisible,
  widget,
} from '@zos/ui'
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
  createShipGeometry,
  createShipRect,
  getSpawnIntervalMs,
  ROUND_HUD_MARGIN,
  HUD_STROKE_WIDTH,
  SHIP_STROKE_WIDTH,
} from '../../shared/game-core.js'
import { sanitizeControlMode } from '../../shared/device.js'
import { advanceSimulationClock, createSimulationClock, MAX_SIMULATION_GAP_MS } from '../../shared/simulation-clock.js'
import { createPointerInputQueue, enqueuePointerInput } from '../../shared/pointer-input.js'
import { normalizeTiltInput } from '../../shared/tilt-calibration.js'
import { appendScore, loadSettings, loadTiltCalibration, saveLastSession, saveSettings } from '../../shared/storage.js'

const FRAME_INTERVAL_MS = 16
const SQUARE_SPAWN_INTERVAL_FACTOR = 0.84
const GAME_BRIGHT_TIME_MS = 600000
const MAX_SPAWNS_PER_TICK = 2
const CONTROL_BASE_SPEED_FACTOR = 0.46
const SQUARE_HUD_CORNER_RADIUS = 36
const HUD_DISPLAY_HP_SPEED = 72

function moveTowards(current, target, maxDelta) {
  if (current === target) {
    return current
  }

  if (Math.abs(target - current) <= maxDelta) {
    return target
  }

  return current + Math.sign(target - current) * maxDelta
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

function drawHudLineSegment(canvas, segment, length, color) {
  if (length <= 0) {
    return
  }

  if (segment.kind === 'line') {
    const ratio = length / segment.length
    canvas.drawLine({
      x1: segment.x1,
      y1: segment.y1,
      x2: segment.x1 + (segment.x2 - segment.x1) * ratio,
      y2: segment.y1 + (segment.y2 - segment.y1) * ratio,
      color,
    })
    return
  }

  canvas.strokeArc({
    center_x: segment.centerX,
    center_y: segment.centerY,
    radius_x: segment.radius,
    radius_y: segment.radius,
    start_angle: segment.startAngle,
    end_angle: segment.startAngle + (segment.endAngle - segment.startAngle) * (length / segment.length),
    color,
  })
}

function drawSquareHud(canvas, viewport, hpRatio) {
  const thickness = HUD_STROKE_WIDTH
  const inset = thickness / 2
  const radius = SQUARE_HUD_CORNER_RADIUS
  const left = inset
  const top = inset
  const right = viewport.width - inset
  const bottom = viewport.height - inset
  const horizontalLength = right - left - radius * 2
  const verticalLength = bottom - top - radius * 2
  const arcLength = (Math.PI * radius) / 2
  const segments = [
    {
      kind: 'arc',
      centerX: left + radius,
      centerY: top + radius,
      radius,
      startAngle: 180,
      endAngle: 270,
      length: arcLength,
    },
    {
      kind: 'line',
      x1: left + radius,
      y1: top,
      x2: right - radius,
      y2: top,
      length: horizontalLength,
    },
    {
      kind: 'arc',
      centerX: right - radius,
      centerY: top + radius,
      radius,
      startAngle: 270,
      endAngle: 360,
      length: arcLength,
    },
    {
      kind: 'line',
      x1: right,
      y1: top + radius,
      x2: right,
      y2: bottom - radius,
      length: verticalLength,
    },
    {
      kind: 'arc',
      centerX: right - radius,
      centerY: bottom - radius,
      radius,
      startAngle: 0,
      endAngle: 90,
      length: arcLength,
    },
    {
      kind: 'line',
      x1: right - radius,
      y1: bottom,
      x2: left + radius,
      y2: bottom,
      length: horizontalLength,
    },
    {
      kind: 'arc',
      centerX: left + radius,
      centerY: bottom - radius,
      radius,
      startAngle: 90,
      endAngle: 180,
      length: arcLength,
    },
    {
      kind: 'line',
      x1: left,
      y1: bottom - radius,
      x2: left,
      y2: top + radius,
      length: verticalLength,
    },
  ]
  const perimeter = segments.reduce((sum, segment) => sum + segment.length, 0)
  let remaining = perimeter * hpRatio

  canvas.setPaint({
    color: COLORS.hudInactive,
    line_width: thickness,
  })
  for (const segment of segments) {
    drawHudLineSegment(canvas, segment, segment.length, COLORS.hudInactive)
  }

  canvas.setPaint({
    color: COLORS.hudActive,
    line_width: thickness,
  })
  for (const segment of segments) {
    if (remaining <= 0) {
      break
    }

    const segmentLength = Math.min(remaining, segment.length)
    drawHudLineSegment(canvas, segment, segmentLength, COLORS.hudActive)
    remaining -= segmentLength
  }
}

function drawRoundHud(canvas, viewport, hpRatio) {
  const margin = ROUND_HUD_MARGIN
  canvas.setPaint({
    color: COLORS.hudInactive,
    line_width: HUD_STROKE_WIDTH,
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
    line_width: SHIP_STROKE_WIDTH,
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
      isRound: deviceInfo.screenShape === SCREEN_SHAPE_ROUND,
    }
    this.viewportHalfHeight = this.viewport.height / 2
    this.settings = settings
    this.tiltCalibration = loadTiltCalibration()
    this.collisionSliceWidth = COLLISION_SLICE_WIDTH
    this.shipGeometry = createShipGeometry(this.viewport, settings.wristSide)
    this.shipYLimits = this.shipGeometry.limits
    this.shipCenterY = deviceInfo.height / 2
    this.touchDirection = 0
    this.pointerDown = false
    this.pointerInput = createPointerInputQueue()
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
    this.displayedHp = HP_MAX
    this.simulationClock = createSimulationClock(Date.now())
    this.lastSpawnAt = 0
    this.lastDamageAt = -Infinity
    this.finished = false
    this.destroyed = false
    this.simulationUpdate = (deltaSeconds, elapsedMs) => {
      this.stepSimulation(deltaSeconds, elapsedMs)
      return !this.finished && !this.destroyed
    }
    this.accelerometer = null
    this.vibrator = new Vibrator()
    this.baseControlSpeed =
      Math.min(this.viewport.width, this.viewport.height) *
      CONTROL_BASE_SPEED_FACTOR *
      (this.settings.controlMode === 'tilt' && this.tiltCalibration ? 1 : this.settings.tiltSensitivity)
    this.nextShipRect = {}
    this.shipRect = createShipRect(
      this.viewport,
      this.shipCenterY,
      this.settings.wristSide,
      {},
      this.shipGeometry
    )
    createShipRect(this.viewport, this.shipCenterY, this.settings.wristSide, this.nextShipRect, this.shipGeometry)
  },

  build() {
    if (this.settings.controlMode === 'tilt' && !this.tiltCalibration) {
      replace({ url: ROUTES.TILT_CALIBRATION })
      return
    }
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
    this.destroyed = true
    this.pointerInput.events.length = 0
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
    const record = (kind, y) => {
      if (this.finished || this.destroyed) return
      enqueuePointerInput(this.pointerInput, kind, y, Date.now(), this.simulationClock)
    }
    this.canvas.addEventListener(event.CLICK_DOWN, info => record('down', info.y))
    this.canvas.addEventListener(event.CLICK_UP, () => record('up'))
    this.canvas.addEventListener(event.MOVE, info => {
      if (!this.pointerInput.down) return
      if (this.settings.controlMode === 'touch' &&
          (info.y < this.viewportHalfHeight) === (this.pointerInput.y < this.viewportHalfHeight)) return
      record('move', info.y)
    })
  },

  applyPointerInput(input) {
    if (input.kind === 'up') {
      this.pointerDown = false
      this.touchDirection = 0
      this.swipeStartTouchY = null
      this.swipeCurrentTouchY = null
      return
    }
    const y = input.y
    if (input.kind === 'down') {
      this.pointerDown = true
      if (this.settings.controlMode === 'touch') {
        this.touchDirection = y < this.viewportHalfHeight ? -1 : 1
      }

      if (this.settings.controlMode === 'swipe') {
        this.swipeStartTouchY = y
        this.swipeCurrentTouchY = y
        this.swipeStartShipY = this.shipCenterY
      }
    } else {
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

    this.shipCenterY = clamp(this.shipCenterY, this.shipYLimits.min, this.shipYLimits.max)
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

      // A newly spawned asteroid has never damaged the ship. Zero is now a
      // real simulation instant rather than an epoch-time sentinel.
      asteroid.lastHitAt = -Infinity
      this.asteroids.push(asteroid)
      addAsteroidToCollisionGrid(asteroid, this.collisionGrid)
    }
  },

  handleCollisions(now, shipRect, difficulty, previousShipRect = shipRect) {
    let didDamage = false

    for (let index = 0; index < this.collisionCandidates.length; index += 1) {
      const asteroid = this.collisionCandidates[index]
      const collision = calculateCollisionResult({
        shipRect,
        previousShipRect,
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
      this.finishRun()
    }
  },

  finishRun(now = Date.now()) {
    if (this.finished) {
      return
    }

    this.finished = true
    const scoreEntry = createScoreEntry(this.simulationClock.elapsedMs, this.settings, now)
    saveLastSession(scoreEntry)
    appendScore(scoreEntry)
    replace({ url: ROUTES.RESULTS, params: JSON.stringify({ mode: 'summary', session: scoreEntry }) })
  },

  advanceSimulation(now) {
    if (this.finished || this.destroyed) {
      return
    }
    const clock = this.simulationClock
    const events = this.pointerInput.events
    // Only the presentation owner admits elapsed time. A burst of touch events
    // must not turn a paused frame gap into repeated simulation catch-up.
    if (now - clock.lastFrameAt > MAX_SIMULATION_GAP_MS) {
      advanceSimulationClock(clock, now, this.simulationUpdate)
      for (let index = 0; index < events.length; index++) this.applyPointerInput(events[index])
    } else {
      for (let index = 0; index < events.length; index++) {
        advanceSimulationClock(clock, Math.min(now, events[index].at), this.simulationUpdate)
        if (this.finished || this.destroyed) break
        this.applyPointerInput(events[index])
      }
      if (!this.finished && !this.destroyed) advanceSimulationClock(clock, now, this.simulationUpdate)
    }
    events.length = 0
  },

  stepSimulation(deltaSeconds, now) {
    const previousShipRect = this.shipRect
    this.updateShip(deltaSeconds)

    const shipRect = createShipRect(
      this.viewport,
      this.shipCenterY,
      this.settings.wristSide,
      this.nextShipRect,
      this.shipGeometry
    )
    this.nextShipRect = previousShipRect
    this.shipRect = shipRect
    const difficulty = calculateDifficulty(
      now,
      this.settings.timeScale
    )

    this.spawnAsteroids(now, shipRect, difficulty)
    advanceAsteroidsInCollisionGrid(
      this.asteroids,
      deltaSeconds,
      this.viewport,
      this.collisionGrid,
      true
    )
    collectCollisionCandidatesFromGrid(
      this.collisionGrid,
      shipRect,
      this.settings.wristSide,
      this.collisionCandidates,
      previousShipRect
    )
    this.handleCollisions(now, shipRect, difficulty, previousShipRect)
    this.displayedHp = moveTowards(
      this.displayedHp,
      this.hp,
      HUD_DISPLAY_HP_SPEED * deltaSeconds
    )
  },

  tick() {
    if (this.finished || this.destroyed) return
    this.advanceSimulation(Date.now())
    // Collision handling may have navigated away during catch-up.
    if (!this.finished && !this.destroyed) this.drawFrame()
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
      shipRect.points
    )

    const hpRatio = this.displayedHp / HP_MAX
    if (this.deviceInfo.screenShape === SCREEN_SHAPE_ROUND) {
      drawRoundHud(this.canvas, this.viewport, hpRatio)
    } else {
      drawSquareHud(this.canvas, this.viewport, hpRatio)
    }
  },
})
