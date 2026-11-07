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
  advanceFrameCollisionCandidates,
  advanceControlScalar,
  anchorAsteroidMotion,
  calculateDifficulty,
  clamp,
  collectFrameCollisionCandidates,
  createSpawnNeighborhood,
  createAsteroid,
  createScoreEntry,
  createShipGeometry,
  createShipRect,
  getSpawnIntervalMs,
  getNextSpawnQuantum,
  getCollisionSliceIndex,
  setCanonicalShipY,
  getAsteroidXAt,
  getSweptCollisionDamage,
  getSweptShipBounds,
  isAsteroidInSweptBounds,
  updateShipPoints,
  ROUND_HUD_MARGIN,
  HUD_STROKE_WIDTH,
  SHIP_STROKE_WIDTH,
  SQUARE_SPAWN_INTERVAL_FACTOR,
} from '../../shared/game-core.js'
import { copyBatchPose, createContactBatch, prepareContactBatch, reserveContactRows } from '../../shared/contact-batch.js'
import { collectSpawnScene, commitSceneFrame, prepareFractionalFrame } from '../../shared/frame-state.js'
import { resolveTravelDirection, sanitizeControlMode } from '../../shared/device.js'
import { advanceSimulationClockBatched, createSimulationClock, MAX_SIMULATION_GAP_MS, SIMULATION_STEP_MS } from '../../shared/simulation-clock.js'
import { clearPointerCapture, createPointerCapture, createPointerInputQueue, recordPointerSample } from '../../shared/pointer-input.js'
import { normalizePreparedTiltInput, prepareTiltInput } from '../../shared/tilt-calibration.js'
import { appendScore, loadSettings, loadTiltCalibration, saveSettings } from '../../shared/storage.js'
import { createSpriteRenderer } from './sprite-renderer.js'

const FRAME_INTERVAL_MS = 16
const GAME_BRIGHT_TIME_MS = 600000
const CONTROL_BASE_SPEED_FACTOR = 0.46
const SQUARE_HUD_CORNER_RADIUS = 36
const HUD_DISPLAY_HP_SPEED = 72
const SIMULATION_STEP_SECONDS = SIMULATION_STEP_MS / 1000

function createPresentationFrame() {
  return { ship: {}, asteroids: [], asteroidCount: 0, displayedHp: HP_MAX }
}

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

function createSquareHudLayout(viewport) {
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
  return { segments, perimeter }
}

function drawSquareHud(canvas, { segments, perimeter }, hpRatio) {
  const thickness = HUD_STROKE_WIDTH
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

function createRoundHudLayout(viewport) {
  const x = viewport.width / 2
  const y = viewport.height / 2
  return { center_x: x, center_y: y, radius_x: x - ROUND_HUD_MARGIN, radius_y: y - ROUND_HUD_MARGIN }
}

function drawRoundHud(canvas, layout, hpRatio) {
  canvas.setPaint({
    color: COLORS.hudInactive,
    line_width: HUD_STROKE_WIDTH,
  })
  canvas.strokeArc({
    ...layout,
    start_angle: -90,
    end_angle: 270,
    color: COLORS.hudInactive,
  })
  canvas.strokeArc({
    ...layout,
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
    this.tiltCalibration = settings.controlMode === 'tilt' ? loadTiltCalibration() : null
    this.preparedTilt = prepareTiltInput(this.tiltCalibration, settings.wristSide)
    this.hudLayout = this.viewport.isRound ? createRoundHudLayout(this.viewport) : createSquareHudLayout(this.viewport)
    this.spawnIntervalFactor = this.viewport.isRound ? 1 : SQUARE_SPAWN_INTERVAL_FACTOR
    this.collisionSliceWidth = COLLISION_SLICE_WIDTH
    this.shipGeometry = createShipGeometry(this.viewport, settings.wristSide)
    this.shipYLimits = this.shipGeometry.limits
    this.shipCenterY = deviceInfo.height / 2
    this.touchDirection = 0
    this.pointerDown = false
    this.pointerCapture = createPointerCapture()
    this.pointerInput = createPointerInputQueue(settings.controlMode === 'swipe')
    this.swipeStartTouchY = null
    this.swipeStartShipY = this.shipCenterY
    this.swipeTargetY = this.shipCenterY
    this.asteroids = []
    this.collisionCandidates = []
    this.sweptShipBounds = {}
    this.frameCollisionCandidates = []
    this.contactBatch = createContactBatch(this.shipGeometry)
    reserveContactRows(this.contactBatch, 16)
    this.batchControl = { direction: 0, baseControlSpeed: 0, targetY: undefined }
    this.spawnNearby = []
    this.retiredPresentation = []
    this.blockResult = { steps: 0, stopped: false }
    this.simulationFrameActive = false
    this.spawnNeighborhood = createSpawnNeighborhood(
      this.viewport,
      this.collisionSliceWidth
    )
    this.asteroidSeed = 0
    this.hp = HP_MAX
    this.displayedHp = HP_MAX
    this.previousDisplayedHp = HP_MAX
    this.simulationClock = createSimulationClock(Date.now())
    this.lastSpawnAt = 0
    this.scheduledLastSpawnAt = 0
    this.nextSpawnAt = getNextSpawnQuantum(0, settings.timeScale, settings.spawnMultiplier, this.viewport.isRound)
    this.lastDamageAt = -Infinity
    this.finished = false
    this.destroyed = false
    this.loop = null
    this.resultTimer = null
    this.completedRun = null
    this.simulationUpdate = (count, fromMs) => this.advanceSimulationBlock(count, fromMs)
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
    this.canvasShipPoints = Array.from({ length: 5 }, () => ({ x: 0, y: 0 }))
    this.publishedFrame = createPresentationFrame()
    this.nextPresentationFrame = createPresentationFrame()
    this.lastPoseCenterY = this.shipCenterY
    this.spriteRenderer = null
    this.lastSpriteHudHp = null
  },

  build() {
    if (this.settings.controlMode === 'tilt' && !this.tiltCalibration) {
      replace({ url: ROUTES.TILT_CALIBRATION })
      return
    }
    hideStatusBar()
    keepScreenAwake()

    const surface = {
      x: 0,
      y: 0,
      w: this.viewport.width,
      h: this.viewport.height,
    }
    if (widget.IMG !== undefined && widget.GROUP !== undefined) {
      this.spriteRenderer = createSpriteRenderer(surface, this.shipRect, this.settings.wristSide)
    }
    // With IMG, this transparent top layer keeps the same HUD and input surface.
    this.canvas = createWidget(widget.CANVAS, surface)

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
    clearPointerCapture(this.pointerCapture)
    this.pointerInput.events.length = 0
    restoreScreenTimeout()

    this.stopGameLoop()
    if (this.resultTimer !== null) {
      clearTimeout(this.resultTimer)
      this.resultTimer = null
    }

    offGesture()

    if (this.accelerometer) {
      this.accelerometer.stop()
      this.accelerometer = null
    }
    try {
      this.completeRun()
    } finally {
      for (const asteroid of this.asteroids) {
        if (asteroid.presentation) asteroid.presentation.view = null
      }
      for (const record of this.retiredPresentation) record.view = null
      this.spriteRenderer?.destroy()
      this.spriteRenderer = null
      this.retiredPresentation.length = 0
      this.asteroids.length = 0
      this.spawnNearby.length = 0
      this.collisionCandidates.length = 0
      this.frameCollisionCandidates.length = 0
      this.contactBatch.rows.length = 0
      this.contactBatch.windows.length = 0
      this.publishedFrame.asteroids.length = 0
      this.nextPresentationFrame.asteroids.length = 0
    }
  },

  stopGameLoop() {
    if (this.loop === null) return
    clearInterval(this.loop)
    this.loop = null
  },

  bindCanvasEvents() {
    const record = (kind, y) => {
      if (this.finished || this.destroyed) return
      recordPointerSample(this.pointerCapture, this.pointerInput, this.simulationClock,
        this.settings.controlMode, this.viewportHalfHeight, kind, y)
    }
    this.canvas.addEventListener(event.CLICK_DOWN, info => record('down', info.y))
    this.canvas.addEventListener(event.CLICK_UP, () => record('up'))
    this.canvas.addEventListener(event.MOVE, info => record('move', info.y))
  },

  getSwipeTarget(y) {
    return clamp(this.swipeStartShipY + (y - this.swipeStartTouchY),
      this.shipYLimits.min, this.shipYLimits.max)
  },

  applyPointerInput(input, swipeTarget) {
    if (input.kind === 'up') {
      this.pointerDown = false
      this.touchDirection = 0
      this.swipeStartTouchY = null
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
        this.swipeStartShipY = this.shipCenterY
        this.swipeTargetY = this.shipCenterY
      }
    } else {
      if (this.settings.controlMode === 'touch') {
        this.touchDirection = y < this.viewportHalfHeight ? -1 : 1
      }

      if (
        this.settings.controlMode === 'swipe' &&
        this.swipeStartTouchY !== null
      ) {
        this.swipeTargetY = swipeTarget ?? this.getSwipeTarget(y)
      }
    }
  },

  getPointerVelocity() {
    if (this.settings.controlMode === 'touch') return this.touchDirection * this.baseControlSpeed
    return Math.sign(this.swipeTargetY - this.shipCenterY) * this.baseControlSpeed
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
      const normalized = normalizePreparedTiltInput(this.accelerometer.getCurrent()?.y || 0, this.preparedTilt)
      this.shipCenterY += normalized * this.baseControlSpeed * deltaSeconds
    }

    if (this.settings.controlMode === 'touch') {
      this.shipCenterY += this.touchDirection * this.baseControlSpeed * deltaSeconds
    }

    if (this.settings.controlMode === 'swipe') {
      const y = this.shipCenterY
      this.shipCenterY = clamp(y + this.getPointerVelocity() * deltaSeconds,
        Math.min(y, this.swipeTargetY), Math.max(y, this.swipeTargetY))
    }

    this.shipCenterY = clamp(this.shipCenterY, this.shipYLimits.min, this.shipYLimits.max)
  },

  spawnAsteroids(now, shipRect) {
    if (now < this.nextSpawnAt) return
    const difficulty = calculateDifficulty(now, this.settings.timeScale)
    const spawnInterval =
      getSpawnIntervalMs(
        difficulty,
        this.settings.spawnMultiplier
      ) * this.spawnIntervalFactor
    const elapsedSinceSpawn = now - this.lastSpawnAt
    if (elapsedSinceSpawn < spawnInterval) return

    // Placement sees the preceding quantum. Newborns then move in this one.
    const sceneAt = this.simulationFrameActive ? now - SIMULATION_STEP_MS : this.simulationClock.elapsedMs
    const spawnFromRight = resolveTravelDirection(this.settings.wristSide) === 'right'
    collectSpawnScene(this.asteroids, sceneAt, this.viewport, this.spawnNeighborhood,
      spawnFromRight, this.spawnNearby, this.retiredPresentation)

    const spawnCount = elapsedSinceSpawn >= 2 * spawnInterval ? 2 : 1
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
        nearbyAsteroids: this.spawnNearby,
        wristSide: this.settings.wristSide,
      })

      // A newly spawned asteroid has never damaged the ship. Zero is now a
      // real simulation instant rather than an epoch-time sentinel.
      asteroid.lastHitAt = -Infinity
      asteroid.presentation = { view: null }
      anchorAsteroidMotion(asteroid, sceneAt)
      this.asteroids.push(asteroid)
      // Newborns can cross the ship during a long/high-difficulty frame.
      // Keeping them in this small list is conservative at every speed.
      this.frameCollisionCandidates.push(asteroid)
      reserveContactRows(this.contactBatch, Math.max(this.asteroids.length, this.frameCollisionCandidates.length))
      if (index + 1 < spawnCount) {
        const slice = getCollisionSliceIndex(asteroid.x, this.spawnNeighborhood)
        const edge = getCollisionSliceIndex(this.viewport.width * (spawnFromRight ? 0.55 : 0.45), this.spawnNeighborhood)
        if (spawnFromRight ? slice >= edge : slice <= edge) this.spawnNearby.push(asteroid)
      }
    }
    this.scheduledLastSpawnAt = this.lastSpawnAt
    this.nextSpawnAt = Math.max(now + SIMULATION_STEP_MS, getNextSpawnQuantum(
      this.lastSpawnAt, this.settings.timeScale, this.settings.spawnMultiplier, this.viewport.isRound
    ))
  },

  handleCollisions(now, shipRect, previousShipRect) {
    let didDamage = false

    for (let index = 0; index < this.collisionCandidates.length; index += 1) {
      const asteroid = this.collisionCandidates[index]
      const damage = getSweptCollisionDamage(shipRect, previousShipRect, asteroid)
      if (damage === 0) continue

      didDamage = true
      this.hp = Math.max(0, this.hp - damage)
      asteroid.lastHitAt = now
    }
    this.finishContactQuantum(now, didDamage)
  },

  finishContactQuantum(now, didDamage) {
    if (didDamage && now - this.lastDamageAt > 90) {
      this.lastDamageAt = now
      this.vibrator.start({ mode: VIBRATOR_SCENE_SHORT_MIDDLE })
    }
    if (this.hp <= 0) this.finishRun()
  },

  finishRun(now = Date.now()) {
    if (this.finished || this.destroyed) return

    this.finished = true
    this.stopGameLoop()
    this.completedRun = { survivedMs: this.simulationClock.elapsedMs, timestamp: now }
    if (!this.simulationFrameActive) {
      this.completeRun()
      return
    }
    // The one-shot callback runs after the final simulation frame returns.
    this.resultTimer = setTimeout(() => {
      this.resultTimer = null
      this.completeRun()
    }, 1)
  },

  completeRun() {
    const completed = this.completedRun
    if (!completed) return
    this.completedRun = null
    const entry = createScoreEntry(completed.survivedMs, this.settings, completed.timestamp)
    appendScore(entry)
    if (!this.destroyed) {
      replace({ url: ROUTES.RESULTS, params: JSON.stringify({ mode: 'summary', session: entry }) })
    }
  },

  advanceSimulation(now) {
    if (this.finished || this.destroyed) {
      return
    }
    const clock = this.simulationClock
    const events = this.pointerInput.events
    const frameStartMs = clock.elapsedMs
    const gap = Math.max(0, now - clock.lastFrameAt)
    const throughMs = gap > MAX_SIMULATION_GAP_MS ? frameStartMs :
      clock.elapsedMs + Math.floor((clock.pendingMs + gap) / SIMULATION_STEP_MS) * SIMULATION_STEP_MS
    if (throughMs > frameStartMs) {
      collectFrameCollisionCandidates(this.asteroids, this.shipRect, frameStartMs, throughMs, this.frameCollisionCandidates)
    }
    this.simulationFrameActive = true
    let completedNormally = false
    // Only the presentation owner admits elapsed time. A burst of touch events
    // must not turn a paused frame gap into repeated simulation catch-up.
    try {
      if (now - clock.lastFrameAt > MAX_SIMULATION_GAP_MS) {
        advanceSimulationClockBatched(clock, now, this.simulationUpdate)
        for (let index = 0; index < events.length; index++) this.applyPointerInput(events[index])
      } else {
        for (let index = 0; index < events.length; index++) {
          const input = events[index]
          let swipeTarget
          if (input.kind === 'move' && this.settings.controlMode === 'swipe' && this.swipeStartTouchY !== null) {
            swipeTarget = this.getSwipeTarget(input.y)
            // A target farther than this frame can reach cannot change its
            // path while both targets point the same way. Keep one spare step
            // in the bound to cover rounding and the final partial step.
            const budget = (throughMs - clock.elapsedMs + SIMULATION_STEP_MS) * this.baseControlSpeed / 1000
            const y = this.shipCenterY
            if (swipeTarget === this.swipeTargetY ||
                Math.min(swipeTarget, this.swipeTargetY) - y > budget ||
                y - Math.max(swipeTarget, this.swipeTargetY) > budget) {
              this.swipeTargetY = swipeTarget
              continue
            }
          }
          advanceSimulationClockBatched(clock, Math.min(now, input.at), this.simulationUpdate)
          if (this.finished || this.destroyed) break
          this.applyPointerInput(input, swipeTarget)
        }
        if (!this.finished && !this.destroyed) advanceSimulationClockBatched(clock, now, this.simulationUpdate)
      }
      completedNormally = true
    } finally {
      this.simulationFrameActive = false
      events.length = 0
      const canPrepare = completedNormally && !this.finished && !this.destroyed
      const frame = this.nextPresentationFrame
      if (clock.elapsedMs !== frameStartMs) {
        commitSceneFrame(this.asteroids, clock.elapsedMs, this.getRenderMs(), this.viewport,
          canPrepare ? frame : null, this.retiredPresentation)
        if (canPrepare) this.publishPreparedFrame()
      } else if (canPrepare &&
          (clock.elapsedMs !== this.preparedElapsedMs || clock.pendingMs !== this.preparedPendingMs)) {
        prepareFractionalFrame(this.asteroids, this.getRenderMs(), frame)
        this.publishPreparedFrame()
      }
    }
  },

  updateCanonicalRect(rect, centerY) {
    const y = Math.round(clamp(centerY, this.shipYLimits.min, this.shipYLimits.max) - this.shipGeometry.h / 2)
    setCanonicalShipY(rect, y)
  },

  advanceQuietSteps(count) {
    if (count <= 0) return
    let before = this.shipCenterY
    let after = before
    const initial = before
    if (this.settings.controlMode === 'touch' && (this.touchDirection !== 0 || before < this.shipYLimits.min || before > this.shipYLimits.max)) {
      const velocity = this.touchDirection * this.baseControlSpeed
      before = advanceControlScalar(before, velocity, count - 1, this.shipYLimits.min, this.shipYLimits.max)
      after = advanceControlScalar(before, velocity, 1, this.shipYLimits.min, this.shipYLimits.max)
    } else if (this.settings.controlMode === 'swipe' && before !== this.swipeTargetY) {
      const velocity = this.getPointerVelocity()
      const min = Math.min(before, this.swipeTargetY)
      const max = Math.max(before, this.swipeTargetY)
      before = advanceControlScalar(before, velocity, count - 1, min, max)
      after = advanceControlScalar(before, velocity, 1, min, max)
    }
    this.shipCenterY = after
    if (before === initial && after === initial && this.lastPoseCenterY === initial) {
      // Synchronize the first stationary quantum after motion, then leave both
      // poses untouched. Idle callbacks do not need scalar/geometry helpers.
      if (this.nextShipRect.y !== this.shipRect.y) this.updateCanonicalRect(this.nextShipRect, after)
    } else {
      this.updateCanonicalRect(this.nextShipRect, before)
      this.updateCanonicalRect(this.shipRect, after)
    }
    this.lastPoseCenterY = after
    this.advanceHpSteps(count)
    this.simulationClock.elapsedMs += count * SIMULATION_STEP_MS
  },

  advanceHpSteps(count) {
    for (let i = 0; i < count; i += 1) {
      this.previousDisplayedHp = this.displayedHp
      if (this.displayedHp === this.hp) return
      this.displayedHp = moveTowards(this.displayedHp, this.hp, HUD_DISPLAY_HP_SPEED * SIMULATION_STEP_SECONDS)
    }
  },

  commitBatchPose(batch, quantum) {
    this.shipCenterY = this.lastPoseCenterY = batch.centers[quantum]
    copyBatchPose(batch, quantum, this.shipRect, this.nextShipRect)
    this.simulationClock.elapsedMs = batch.fromMs + quantum * SIMULATION_STEP_MS
  },

  consumeContactBatch(batch) {
    let committed = 0
    for (let quantum = 1; quantum <= batch.count; quantum += 1) {
      let index = batch.heads[quantum]
      if (index === -1) continue
      this.advanceHpSteps(quantum - committed - 1)
      if (quantum - 1 > committed) this.commitBatchPose(batch, quantum - 1)
      this.commitBatchPose(batch, quantum)
      const now = this.simulationClock.elapsedMs
      while (index !== -1) {
        const { asteroid, damage, next } = batch.rows[index]
        this.hp = Math.max(0, this.hp - damage)
        asteroid.lastHitAt = now
        index = next
      }
      this.finishContactQuantum(now, true)
      this.advanceHpSteps(1)
      if (this.finished || this.destroyed) return
      committed = quantum
    }

    if (committed < batch.count) {
      this.commitBatchPose(batch, batch.count)
      this.advanceHpSteps(batch.count - committed)
    }
  },

  advanceSimulationBlock(count, fromMs) {
    const clock = this.simulationClock
    const throughMs = fromMs + count * SIMULATION_STEP_MS
    clock.elapsedMs = fromMs
    if (this.scheduledLastSpawnAt !== this.lastSpawnAt) {
      this.scheduledLastSpawnAt = this.lastSpawnAt
      this.nextSpawnAt = Math.max(fromMs + SIMULATION_STEP_MS, getNextSpawnQuantum(
        this.lastSpawnAt, this.settings.timeScale, this.settings.spawnMultiplier, this.viewport.isRound
      ))
    }
    if (this.settings.controlMode === 'tilt') {
      // Every quantum still reads the native sensor before moving the ship.
      while (clock.elapsedMs < throughMs && !this.finished && !this.destroyed) {
        clock.elapsedMs += SIMULATION_STEP_MS
        if (clock.elapsedMs >= this.nextSpawnAt) this.stepSpawnQuantum(clock.elapsedMs)
        else this.stepTiltContacts(clock.elapsedMs)
      }
    } else {
      const control = this.batchControl
      control.direction = this.touchDirection
      control.baseControlSpeed = this.baseControlSpeed
      control.targetY = this.settings.controlMode === 'swipe' ? this.swipeTargetY : undefined
      while (clock.elapsedMs < throughMs && !this.finished && !this.destroyed) {
        const cursor = clock.elapsedMs
        const quietEnd = Math.min(throughMs, this.nextSpawnAt - SIMULATION_STEP_MS)
        if (quietEnd >= cursor + SIMULATION_STEP_MS) {
          const batch = prepareContactBatch(this.contactBatch, this.frameCollisionCandidates,
            this.shipRect, this.shipCenterY, control, cursor, quietEnd)
          if (batch.windowCount === 0) this.advanceQuietSteps(batch.count)
          else this.consumeContactBatch(batch)
        }
        if (!this.finished && !this.destroyed && clock.elapsedMs < throughMs &&
            this.nextSpawnAt <= clock.elapsedMs + SIMULATION_STEP_MS) {
          clock.elapsedMs += SIMULATION_STEP_MS
          this.stepSpawnQuantum(clock.elapsedMs)
        }
      }
    }
    this.blockResult.steps = (clock.elapsedMs - fromMs) / SIMULATION_STEP_MS
    this.blockResult.stopped = this.finished || this.destroyed
    return this.blockResult
  },

  advanceShipPose(deltaSeconds) {
    const previousShipRect = this.shipRect
    this.updateShip(deltaSeconds)

    const shipRect = this.nextShipRect
    this.updateCanonicalRect(shipRect, this.shipCenterY)
    this.nextShipRect = previousShipRect
    this.shipRect = shipRect
    this.lastPoseCenterY = this.shipCenterY
    return previousShipRect
  },

  stepTiltContacts(now) {
    const previousShipRect = this.advanceShipPose(SIMULATION_STEP_SECONDS)
    const shipRect = this.shipRect
    const source = this.frameCollisionCandidates
    const count = source.length
    const contacts = this.collisionCandidates
    contacts.length = 0
    if (count) {
      const bounds = getSweptShipBounds(shipRect, previousShipRect, this.sweptShipBounds)
      for (let index = 0; index < count; index += 1) {
        const asteroid = source[index]
        if (asteroid.motionRemoved || !(now - asteroid.lastHitAt >= COLLISION_COOLDOWN_MS)) continue
        const radius = asteroid.radius
        if (asteroid.y + radius < bounds.top || asteroid.y - radius > bounds.bottom) continue
        const previousX = getAsteroidXAt(asteroid, now - SIMULATION_STEP_MS)
        const x = getAsteroidXAt(asteroid, now)
        if (Math.max(previousX, x) + radius < bounds.left || Math.min(previousX, x) - radius > bounds.right) continue
        asteroid.previousX = previousX
        asteroid.x = x
        contacts.push(asteroid)
      }
    }
    if (contacts.length) this.handleCollisions(now, shipRect, previousShipRect)
    this.advanceHpSteps(1)
  },

  stepSpawnQuantum(now) {
    const previousShipRect = this.advanceShipPose(SIMULATION_STEP_SECONDS)
    const shipRect = this.shipRect

    this.spawnAsteroids(now, shipRect)
    if (this.frameCollisionCandidates.length) advanceFrameCollisionCandidates(this.frameCollisionCandidates, now, SIMULATION_STEP_MS)
    this.collisionCandidates.length = 0
    if (this.frameCollisionCandidates.length) {
      const bounds = getSweptShipBounds(shipRect, previousShipRect, this.sweptShipBounds)
      for (let index = 0; index < this.frameCollisionCandidates.length; index += 1) {
        const asteroid = this.frameCollisionCandidates[index]
        if (!asteroid.motionRemoved && now - asteroid.lastHitAt >= COLLISION_COOLDOWN_MS &&
            isAsteroidInSweptBounds(asteroid, bounds)) {
          this.collisionCandidates.push(asteroid)
        }
      }
    }
    if (this.collisionCandidates.length) this.handleCollisions(now, shipRect, previousShipRect)
    this.advanceHpSteps(1)
  },

  tick() {
    if (this.finished || this.destroyed) return
    const now = Date.now()
    this.advanceSimulation(now)
    if (!this.finished && !this.destroyed) this.presentPreparedFrame()
  },

  getRenderMs() {
    const { elapsedMs, pendingMs } = this.simulationClock
    return elapsedMs > 0 ? elapsedMs - SIMULATION_STEP_MS + pendingMs : elapsedMs
  },

  presentPreparedFrame() {
    if (this.preparedElapsedMs === this.drawnElapsedMs && this.preparedPendingMs === this.drawnPendingMs) return
    this.presentFrame(this.publishedFrame)
    this.drawnElapsedMs = this.preparedElapsedMs
    this.drawnPendingMs = this.preparedPendingMs
  },

  drawFrame(shipRect) {
    const renderMs = shipRect ? this.simulationClock.elapsedMs : this.getRenderMs()
    prepareFractionalFrame(this.asteroids, renderMs, this.nextPresentationFrame)
    this.publishPreparedFrame(shipRect)
    this.presentFrame(this.publishedFrame)
    this.drawnElapsedMs = this.preparedElapsedMs
    this.drawnPendingMs = this.preparedPendingMs
  },

  publishPreparedFrame(shipRect) {
    const { elapsedMs, pendingMs } = this.simulationClock
    const interpolate = !shipRect && elapsedMs > 0
    const alpha = pendingMs / SIMULATION_STEP_MS
    const frame = this.nextPresentationFrame
    const pose = shipRect || this.shipRect
    frame.ship.x = pose.x
    frame.ship.y = interpolate ? this.nextShipRect.y + (pose.y - this.nextShipRect.y) * alpha : pose.y
    frame.ship.w = pose.w
    frame.ship.h = pose.h
    frame.ship.wristSide = pose.wristSide
    frame.displayedHp = interpolate
      ? this.previousDisplayedHp + (this.displayedHp - this.previousDisplayedHp) * alpha
      : this.displayedHp

    this.nextPresentationFrame = this.publishedFrame
    this.publishedFrame = frame
    this.preparedElapsedMs = shipRect ? undefined : elapsedMs
    this.preparedPendingMs = shipRect ? undefined : pendingMs
    if (!this.spriteRenderer) this.retiredPresentation.length = 0
  },

  presentFrame(frame) {
    if (this.spriteRenderer) {
      this.spriteRenderer.draw(frame, this.retiredPresentation)
      if (frame.displayedHp !== this.lastSpriteHudHp) {
        if (this.lastSpriteHudHp !== null) {
          this.canvas.clear({ x: 0, y: 0, w: this.viewport.width, h: this.viewport.height })
        }
        this.drawHud(frame.displayedHp / HP_MAX)
        this.lastSpriteHudHp = frame.displayedHp
      }
      return
    }

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
    for (let index = 0; index < frame.asteroidCount; index += 1) {
      const asteroid = frame.asteroids[index]
      this.canvas.strokeCircle({
        center_x: asteroid.x,
        center_y: asteroid.y,
        radius: asteroid.radius,
        color: COLORS.asteroid,
      })
    }

    drawOutlineShip(
      this.canvas,
      updateShipPoints(this.canvasShipPoints, frame.ship)
    )

    this.drawHud(frame.displayedHp / HP_MAX)
  },

  drawHud(hpRatio) {
    if (this.viewport.isRound) {
      drawRoundHud(this.canvas, this.hudLayout, hpRatio)
    } else {
      drawSquareHud(this.canvas, this.hudLayout, hpRatio)
    }
  },
})
