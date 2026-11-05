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
  advanceFrameCollisionCandidates,
  advanceControlScalar,
  anchorAsteroidMotion,
  calculateCollisionResult,
  calculateDifficulty,
  clamp,
  collectFrameCollisionCandidates,
  collectCollisionCandidatesFromList,
  createCollisionGrid,
  createAsteroid,
  createScoreEntry,
  createShipGeometry,
  createShipRect,
  getSpawnIntervalMs,
  getNextSpawnQuantum,
  getCollisionQuantumWindow,
  getAsteroidXAt,
  interpolateShipRect,
  materializeAsteroidsAt,
  ROUND_HUD_MARGIN,
  HUD_STROKE_WIDTH,
  SHIP_STROKE_WIDTH,
  SQUARE_SPAWN_INTERVAL_FACTOR,
} from '../../shared/game-core.js'
import { sanitizeControlMode } from '../../shared/device.js'
import { advanceSimulationClockBatched, createSimulationClock, MAX_SIMULATION_GAP_MS, SIMULATION_STEP_MS } from '../../shared/simulation-clock.js'
import { createPointerInputQueue, enqueuePointerInput } from '../../shared/pointer-input.js'
import { RuntimeDiagnostics } from '../../shared/runtime-diagnostics.js'
import { normalizeTiltInput } from '../../shared/tilt-calibration.js'
import { advanceRuntimeDiagnosticRun, appendScore, loadSettings, loadTiltCalibration, saveLastSession, saveSettings } from '../../shared/storage.js'

const FRAME_INTERVAL_MS = 16
const GAME_BRIGHT_TIME_MS = 600000
const MAX_SPAWNS_PER_TICK = 2
const CONTROL_BASE_SPEED_FACTOR = 0.46
const SQUARE_HUD_CORNER_RADIUS = 36
const HUD_DISPLAY_HP_SPEED = 72
// Temporary physical-watch diagnostic build; this does not change game timing.
const DIAGNOSTIC_VERSION = '2.3.32'

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
    this.frameCollisionCandidates = []
    this.collisionWindows = []
    this.collisionWindowCount = 0
    this.blockResult = { steps: 0, stopped: false }
    this.simulationFrameActive = false
    this.collisionGrid = createCollisionGrid(
      this.viewport,
      this.collisionSliceWidth
    )
    this.asteroidSeed = 0
    this.hp = HP_MAX
    this.displayedHp = HP_MAX
    this.previousDisplayedHp = HP_MAX
    const diagnosticSession = advanceRuntimeDiagnosticRun()
    const diagnosticRun = diagnosticSession.index
    this.diagnosticMetadata = {
      version: DIAGNOSTIC_VERSION,
      baselineCommit: 'b5c7264',
      runIndex: diagnosticRun,
      phaseSampleEvery: diagnosticSession.persisted && diagnosticRun % 2 ? 0 : 13,
      modePersisted: diagnosticSession.persisted,
      width: deviceInfo.width,
      height: deviceInfo.height,
      deviceSource: deviceInfo.deviceSource,
      controlMode: settings.controlMode,
      wristSide: settings.wristSide,
      timeScale: settings.timeScale,
      spawnMultiplier: settings.spawnMultiplier,
      requestedIntervalMs: FRAME_INTERVAL_MS,
      simulationStepMs: SIMULATION_STEP_MS,
      maxAdmittedGapMs: MAX_SIMULATION_GAP_MS,
      vibrations: 0,
      callbackErrors: 0,
      compactExport: true,
      fullMaterializations: 0,
      fullAsteroidVisits: 0,
      sensorReads: 0,
      skippedQuanta: 0,
      eventQuanta: 0,
    }
    this.runtimeDiagnostics = new RuntimeDiagnostics(this.diagnosticMetadata)
    // Startup logging and clock calibration happen before the game's clock.
    console.log(`PP_DIAG_START v=${DIAGNOSTIC_VERSION} run=${diagnosticRun} sampling=${this.diagnosticMetadata.phaseSampleEvery} control=${settings.controlMode} wrist=${settings.wristSide} time=${settings.timeScale} spawn=${settings.spawnMultiplier}`)
    this.simulationClock = createSimulationClock(Date.now())
    this.diagnosticMetadata.gameClockAt = this.simulationClock.lastFrameAt
    this.lastSpawnAt = 0
    this.scheduledLastSpawnAt = 0
    this.nextSpawnAt = getNextSpawnQuantum(0, settings.timeScale, settings.spawnMultiplier, this.viewport.isRound)
    this.lastDamageAt = -Infinity
    this.finished = false
    this.destroyed = false
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
    this.renderShipRect = createShipRect(this.viewport, this.shipCenterY, this.settings.wristSide, {}, this.shipGeometry)
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

    this.diagnosticMetadata.timerRegisteredAt = Date.now()
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
    this.runtimeDiagnostics.requestFinish('destroy')
  },

  bindCanvasEvents() {
    const record = (kind, y) => {
      if (this.finished || this.destroyed) return
      if (kind !== 'move') this.runtimeDiagnostics.pointer(kind)
      enqueuePointerInput(this.pointerInput, kind, y, Date.now(), this.simulationClock)
    }
    this.canvas.addEventListener(event.CLICK_DOWN, info => record('down', info.y))
    this.canvas.addEventListener(event.CLICK_UP, () => record('up'))
    this.canvas.addEventListener(event.MOVE, info => {
      if (this.finished || this.destroyed) return
      // Include delivered MOVE callbacks even when game input coalesces them.
      this.runtimeDiagnostics.pointer('move')
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
      this.diagnosticMetadata.sensorReads += 1
      const normalized = normalizeTiltInput(this.accelerometer.getCurrent()?.y || 0, this.tiltCalibration, this.settings.wristSide)
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
    if (now < this.nextSpawnAt) return
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

    // Spawning precedes movement in the canonical step: placement sees the
    // preceding quantum, then newborns receive their first 10 ms movement.
    if (this.simulationFrameActive) {
      this.diagnosticMetadata.fullMaterializations += 1
      this.diagnosticMetadata.fullAsteroidVisits += this.asteroids.length
      materializeAsteroidsAt(this.asteroids, now - SIMULATION_STEP_MS, this.viewport, this.collisionGrid, SIMULATION_STEP_MS)
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
      anchorAsteroidMotion(asteroid, this.simulationFrameActive ? now - SIMULATION_STEP_MS : this.simulationClock.elapsedMs)
      this.asteroids.push(asteroid)
      addAsteroidToCollisionGrid(asteroid, this.collisionGrid)
      // Newborns can cross the ship during a long/high-difficulty frame.
      // Keeping them in this small list is conservative at every speed.
      this.frameCollisionCandidates.push(asteroid)
    }
    this.scheduledLastSpawnAt = this.lastSpawnAt
    this.nextSpawnAt = Math.max(now + SIMULATION_STEP_MS, getNextSpawnQuantum(
      this.lastSpawnAt, this.settings.timeScale, this.settings.spawnMultiplier, this.viewport.isRound
    ))
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
      this.diagnosticMetadata.vibrations += 1
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
    this.runtimeDiagnostics.requestFinish('game-over')
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
    const gap = Math.max(0, now - clock.lastFrameAt)
    const throughMs = gap > MAX_SIMULATION_GAP_MS ? clock.elapsedMs :
      clock.elapsedMs + Math.floor((clock.pendingMs + gap) / SIMULATION_STEP_MS) * SIMULATION_STEP_MS
    collectFrameCollisionCandidates(this.asteroids, this.shipRect, clock.elapsedMs, throughMs, this.frameCollisionCandidates)
    this.simulationFrameActive = true
    // Only the presentation owner admits elapsed time. A burst of touch events
    // must not turn a paused frame gap into repeated simulation catch-up.
    try {
      if (now - clock.lastFrameAt > MAX_SIMULATION_GAP_MS) {
        advanceSimulationClockBatched(clock, now, this.simulationUpdate)
        for (let index = 0; index < events.length; index++) this.applyPointerInput(events[index])
      } else {
        for (let index = 0; index < events.length; index++) {
          advanceSimulationClockBatched(clock, Math.min(now, events[index].at), this.simulationUpdate)
          if (this.finished || this.destroyed) break
          this.applyPointerInput(events[index])
        }
        if (!this.finished && !this.destroyed) advanceSimulationClockBatched(clock, now, this.simulationUpdate)
      }
    } finally {
      // Full list/grid work occurs once per callback (plus actual spawn events).
      // Damage, cooldown and score still use the original 10 ms step instants.
      this.diagnosticMetadata.fullMaterializations += 1
      this.diagnosticMetadata.fullAsteroidVisits += this.asteroids.length
      materializeAsteroidsAt(this.asteroids, clock.elapsedMs, this.viewport, this.collisionGrid, SIMULATION_STEP_MS)
      this.simulationFrameActive = false
      events.length = 0
    }
  },

  updateCanonicalRect(rect, centerY) {
    // Dimensions and x never change during a run. Stationary steps must not
    // rewrite the same five points, but both temporal buffers stay independent.
    const y = Math.round(clamp(centerY, this.shipYLimits.min, this.shipYLimits.max) - this.shipGeometry.h / 2)
    if (rect.y !== y) createShipRect(this.viewport, centerY, this.settings.wristSide, rect, this.shipGeometry)
  },

  advanceQuietSteps(count) {
    if (count <= 0) return
    let before = this.shipCenterY
    let after = before
    if (this.settings.controlMode === 'touch') {
      const velocity = this.touchDirection * this.baseControlSpeed
      before = advanceControlScalar(before, velocity, count - 1, this.shipYLimits.min, this.shipYLimits.max)
      after = advanceControlScalar(before, velocity, 1, this.shipYLimits.min, this.shipYLimits.max)
    } else if (this.pointerDown && this.swipeStartTouchY !== null && this.swipeCurrentTouchY !== null) {
      after = clamp(this.swipeStartShipY + (this.swipeCurrentTouchY - this.swipeStartTouchY), this.shipYLimits.min, this.shipYLimits.max)
      if (count > 1) before = after
    }
    this.shipCenterY = after
    this.updateCanonicalRect(this.nextShipRect, before)
    this.updateCanonicalRect(this.shipRect, after)
    if (this.displayedHp === this.hp) {
      this.previousDisplayedHp = this.hp
    } else {
      // Retain repeated-add rounding and the last two presentation values.
      for (let index = 0; index < count; index += 1) {
        this.previousDisplayedHp = this.displayedHp
        this.displayedHp = moveTowards(this.displayedHp, this.hp, HUD_DISPLAY_HP_SPEED * (SIMULATION_STEP_MS / 1000))
      }
    }
    this.simulationClock.elapsedMs += count * SIMULATION_STEP_MS
    this.diagnosticMetadata.skippedQuanta += count
    this.runtimeDiagnostics.recordSkippedSteps(count)
  },

  prepareCollisionWindows(fromMs, throughMs) {
    const velocity = this.settings.controlMode === 'touch' ? this.touchDirection * this.baseControlSpeed : 0
    const instantCenter = this.settings.controlMode === 'swipe' && this.pointerDown && this.swipeStartTouchY !== null && this.swipeCurrentTouchY !== null
      ? clamp(this.swipeStartShipY + (this.swipeCurrentTouchY - this.swipeStartTouchY), this.shipYLimits.min, this.shipYLimits.max)
      : undefined
    let count = 0
    for (let index = 0; index < this.frameCollisionCandidates.length; index += 1) {
      const asteroid = this.frameCollisionCandidates[index]
      if (asteroid.motionRemoved) continue
      const slot = this.collisionWindows[count] || (this.collisionWindows[count] = {})
      if (getCollisionQuantumWindow(asteroid, this.shipGeometry, fromMs, throughMs, this.shipCenterY, velocity, slot, SIMULATION_STEP_MS, instantCenter)) count += 1
    }
    this.collisionWindowCount = count
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
      // Preserve the existing sensor-read chronology. Geometry caching and
      // scheduled spawning still avoid unchanged work in this path.
      while (clock.elapsedMs < throughMs && !this.finished && !this.destroyed) {
        clock.elapsedMs += SIMULATION_STEP_MS
        this.stepSimulation(SIMULATION_STEP_MS / 1000, clock.elapsedMs)
      }
    } else {
      this.prepareCollisionWindows(fromMs, throughMs)
      while (clock.elapsedMs < throughMs && !this.finished && !this.destroyed) {
        const cursor = clock.elapsedMs
        let next = Math.max(cursor + SIMULATION_STEP_MS, this.nextSpawnAt)
        for (let index = 0; index < this.collisionWindowCount; index += 1) {
          const window = this.collisionWindows[index]
          const candidate = Math.max(cursor + SIMULATION_STEP_MS, window.firstMs)
          if (candidate <= window.lastMs && candidate < next) next = candidate
        }
        if (next > throughMs) {
          this.advanceQuietSteps((throughMs - cursor) / SIMULATION_STEP_MS)
          break
        }
        this.advanceQuietSteps((next - cursor) / SIMULATION_STEP_MS - 1)
        clock.elapsedMs = next
        const seed = this.asteroidSeed
        this.stepSimulation(SIMULATION_STEP_MS / 1000, next)
        if (this.asteroidSeed !== seed && !this.finished && !this.destroyed) this.prepareCollisionWindows(next, throughMs)
      }
    }
    this.blockResult.steps = (clock.elapsedMs - fromMs) / SIMULATION_STEP_MS
    this.blockResult.stopped = this.finished || this.destroyed
    return this.blockResult
  },

  stepSimulation(deltaSeconds, now) {
    this.diagnosticMetadata.eventQuanta += 1
    const sampled = this.runtimeDiagnostics.beginStep(this.frameCollisionCandidates.length)
    const previousShipRect = this.shipRect
    this.updateShip(deltaSeconds)

    const shipRect = this.nextShipRect
    this.updateCanonicalRect(shipRect, this.shipCenterY)
    this.nextShipRect = previousShipRect
    this.shipRect = shipRect
    const difficulty = calculateDifficulty(
      now,
      this.settings.timeScale
    )
    if (sampled) this.runtimeDiagnostics.markStepPhase(0)

    this.spawnAsteroids(now, shipRect, difficulty)
    if (sampled) this.runtimeDiagnostics.markStepPhase(1)
    if (this.frameCollisionCandidates.length) advanceFrameCollisionCandidates(this.frameCollisionCandidates, now, SIMULATION_STEP_MS)
    if (sampled) this.runtimeDiagnostics.markStepPhase(2)
    if (this.frameCollisionCandidates.length) collectCollisionCandidatesFromList(
      this.frameCollisionCandidates,
      shipRect,
      this.settings.wristSide,
      this.collisionCandidates,
      previousShipRect
    )
    else this.collisionCandidates.length = 0
    if (sampled) this.runtimeDiagnostics.markStepPhase(3)
    if (this.collisionCandidates.length) this.handleCollisions(now, shipRect, difficulty, previousShipRect)
    if (sampled) this.runtimeDiagnostics.markStepPhase(4)
    this.previousDisplayedHp = this.displayedHp
    this.displayedHp = moveTowards(
      this.displayedHp,
      this.hp,
      HUD_DISPLAY_HP_SPEED * deltaSeconds
    )
    if (sampled) this.runtimeDiagnostics.markStepPhase(5)
    this.runtimeDiagnostics.endStep(this.collisionCandidates.length)
  },

  tick() {
    if (this.finished || this.destroyed) return
    const now = Date.now()
    const diagnostics = this.runtimeDiagnostics
    if (!diagnostics.enabled) {
      this.advanceSimulation(now)
      if (!this.finished && !this.destroyed) this.drawFrame()
      return
    }
    diagnostics.beginFrame(now, this.simulationClock, this.pointerInput.down, this.asteroids.length)
    try {
      // Reuse the original admission timestamp, before diagnostic bookkeeping.
      this.advanceSimulation(now)
      diagnostics.markUpdate(Date.now())
      if (!this.finished && !this.destroyed) this.drawFrame()
    } catch (error) {
      this.diagnosticMetadata.callbackErrors += 1
      diagnostics.requestFinish('callback-error')
      throw error
    } finally {
      diagnostics.endFrame(Date.now(), this.simulationClock, this.finished || this.destroyed)
    }
  },

  drawFrame(shipRect) {
    const interpolate = !shipRect && this.simulationClock.elapsedMs > 0
    const alpha = this.simulationClock.pendingMs / SIMULATION_STEP_MS
    if (!shipRect) shipRect = interpolate
      ? interpolateShipRect(this.nextShipRect, this.shipRect, alpha, this.renderShipRect)
      : this.shipRect
    const renderAtMs = interpolate ? this.simulationClock.elapsedMs - SIMULATION_STEP_MS + this.simulationClock.pendingMs : this.simulationClock.elapsedMs
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
        center_x: interpolate ? getAsteroidXAt(asteroid, renderAtMs) : asteroid.x,
        center_y: asteroid.y,
        radius: asteroid.radius,
        color: COLORS.asteroid,
      })
    }

    drawOutlineShip(
      this.canvas,
      shipRect.points
    )

    const renderedHp = interpolate ? this.previousDisplayedHp + (this.displayedHp - this.previousDisplayedHp) * alpha : this.displayedHp
    const hpRatio = renderedHp / HP_MAX
    if (this.deviceInfo.screenShape === SCREEN_SHAPE_ROUND) {
      drawRoundHud(this.canvas, this.viewport, hpRatio)
    } else {
      drawSquareHud(this.canvas, this.viewport, hpRatio)
    }
  },
})
