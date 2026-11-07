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
  getCollisionQuantumWindow,
  getAsteroidXAt,
  getSweptCollisionDamage,
  getSweptShipBounds,
  isAsteroidInSweptBounds,
  updateShipPoints,
  materializeAsteroidsAt,
  ROUND_HUD_MARGIN,
  HUD_STROKE_WIDTH,
  SHIP_STROKE_WIDTH,
  SQUARE_SPAWN_INTERVAL_FACTOR,
} from '../../shared/game-core.js'
import { sanitizeControlMode } from '../../shared/device.js'
import { advanceSimulationClockBatched, createSimulationClock, MAX_SIMULATION_GAP_MS, SIMULATION_STEP_MS } from '../../shared/simulation-clock.js'
import {
  clearPointerSamples,
  consumePointerSamples,
  createPointerInbox,
  createPointerInputQueue,
  recordPointerSample,
} from '../../shared/pointer-input.js'
import { RuntimeDiagnostics } from '../../shared/runtime-diagnostics.js'
import { normalizePreparedTiltInput, prepareTiltInput } from '../../shared/tilt-calibration.js'
import { advanceRuntimeDiagnosticRun, appendScore, loadSettings, loadTiltCalibration, saveSettings } from '../../shared/storage.js'
import { createSpriteRenderer } from './sprite-renderer.js'

const FRAME_INTERVAL_MS = 16
const GAME_RENDERER = 'img' // Set to 'canvas' to select the original renderer.
const GAME_BRIGHT_TIME_MS = 600000
const CONTROL_BASE_SPEED_FACTOR = 0.46
const SQUARE_HUD_CORNER_RADIUS = 36
const HUD_DISPLAY_HP_SPEED = 72
// Temporary physical-watch diagnostic build; this does not change game timing.
const DIAGNOSTIC_VERSION = '2.3.39'

function resetStallFrame(frame, inbox) {
  frame.inputMs = 0
  frame.scanMs = 0
  frame.windowsMs = 0
  frame.stepsMs = 0
  frame.quietMs = 0
  frame.spawnMs = 0
  frame.contactMs = 0
  frame.materializeMs = 0
  frame.inbox = inbox
  frame.commands = 0
  frame.blocks = 0
  frame.eventSteps = 0
  frame.contactChecks = 0
}

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
    this.pointerInbox = createPointerInbox()
    this.pointerInput = createPointerInputQueue(settings.controlMode === 'swipe')
    this.swipeStartTouchY = null
    this.swipeStartShipY = this.shipCenterY
    this.swipeTargetY = this.shipCenterY
    this.asteroids = []
    this.collisionCandidates = []
    this.sweptShipBounds = {}
    this.frameCollisionCandidates = []
    this.collisionWindows = []
    this.collisionWindowCount = 0
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
    const diagnosticSession = advanceRuntimeDiagnosticRun()
    const diagnosticRun = diagnosticSession.index
    this.diagnosticMetadata = {
      version: DIAGNOSTIC_VERSION,
      baselineCommit: '11274b6',
      runIndex: diagnosticRun,
      phaseSampleEvery: 0,
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
      measureDamage: true,
      foldedSwipeMoves: 0,
      stallFrame: {},
    }
    this.stallProbe = null
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
    if (GAME_RENDERER === 'img' && widget.IMG !== undefined && widget.GROUP !== undefined) {
      this.spriteRenderer = createSpriteRenderer(surface, this.shipRect, this.settings.wristSide)
    }
    // With IMG, this transparent top layer keeps the same HUD and input surface.
    this.canvas = createWidget(widget.CANVAS, surface)

    this.bindCanvasEvents()
    this.bindGestureEvents()
    this.bindTiltSensor()
    console.log(`PP_RENDERER v=${DIAGNOSTIC_VERSION} renderer=${this.spriteRenderer ? 'img' : 'canvas'}`)
    this.drawFrame()

    this.diagnosticMetadata.timerRegisteredAt = Date.now()
    this.loop = setInterval(() => {
      this.tick()
    }, FRAME_INTERVAL_MS)
  },

  onDestroy() {
    this.destroyed = true
    this.flushPointerDiagnostics()
    clearPointerSamples(this.pointerInbox)
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
      this.runtimeDiagnostics.requestFinish('destroy')
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
      recordPointerSample(this.pointerInbox, kind, y)
    }
    this.canvas.addEventListener(event.CLICK_DOWN, info => record('down', info.y))
    this.canvas.addEventListener(event.CLICK_UP, () => record('up'))
    this.canvas.addEventListener(event.MOVE, info => record('move', info.y))
  },

  flushPointerDiagnostics() {
    const inbox = this.pointerInbox
    if (inbox.downCount) this.runtimeDiagnostics.pointer('down', inbox.downCount)
    if (inbox.moveCount) this.runtimeDiagnostics.pointer('move', inbox.moveCount)
    if (inbox.upCount) this.runtimeDiagnostics.pointer('up', inbox.upCount)
    inbox.downCount = 0
    inbox.moveCount = 0
    inbox.upCount = 0
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
      this.diagnosticMetadata.sensorReads += 1
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
    const probe = this.stallProbe
    const startedAt = probe ? Date.now() : 0
    const difficulty = calculateDifficulty(now, this.settings.timeScale)
    const spawnInterval =
      getSpawnIntervalMs(
        difficulty,
        this.settings.spawnMultiplier
      ) * this.spawnIntervalFactor
    const elapsedSinceSpawn = now - this.lastSpawnAt
    if (elapsedSinceSpawn < spawnInterval) {
      if (probe) probe.spawnMs += Date.now() - startedAt
      return
    }

    // Spawning precedes movement in the canonical step: placement sees the
    // preceding quantum, then newborns receive their first 10 ms movement.
    if (this.simulationFrameActive) {
      this.diagnosticMetadata.fullMaterializations += 1
      this.diagnosticMetadata.fullAsteroidVisits += this.asteroids.length
      materializeAsteroidsAt(this.asteroids, now - SIMULATION_STEP_MS, this.viewport, undefined, SIMULATION_STEP_MS, false)
    }

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
        grid: this.spawnNeighborhood,
        wristSide: this.settings.wristSide,
      })

      // A newly spawned asteroid has never damaged the ship. Zero is now a
      // real simulation instant rather than an epoch-time sentinel.
      asteroid.lastHitAt = -Infinity
      anchorAsteroidMotion(asteroid, this.simulationFrameActive ? now - SIMULATION_STEP_MS : this.simulationClock.elapsedMs)
      this.asteroids.push(asteroid)
      // Newborns can cross the ship during a long/high-difficulty frame.
      // Keeping them in this small list is conservative at every speed.
      this.frameCollisionCandidates.push(asteroid)
    }
    this.scheduledLastSpawnAt = this.lastSpawnAt
    this.nextSpawnAt = Math.max(now + SIMULATION_STEP_MS, getNextSpawnQuantum(
      this.lastSpawnAt, this.settings.timeScale, this.settings.spawnMultiplier, this.viewport.isRound
    ))
    if (probe) probe.spawnMs += Date.now() - startedAt
  },

  handleCollisions(now, shipRect, previousShipRect) {
    const probe = this.stallProbe
    const startedAt = probe ? Date.now() : 0
    let didDamage = false

    for (let index = 0; index < this.collisionCandidates.length; index += 1) {
      const asteroid = this.collisionCandidates[index]
      const damage = getSweptCollisionDamage(shipRect, previousShipRect, asteroid)
      if (damage === 0) continue

      didDamage = true
      this.hp = Math.max(0, this.hp - damage)
      asteroid.lastHitAt = now
    }
    if (probe) {
      probe.contactChecks += this.collisionCandidates.length
      probe.contactMs += Date.now() - startedAt
    }

    if (didDamage) this.diagnosticMetadata.frameHit = true
    if (didDamage && now - this.lastDamageAt > 90) {
      this.lastDamageAt = now
      this.diagnosticMetadata.vibrations += 1
      const startedAt = this.runtimeDiagnostics.enabled ? Date.now() : undefined
      this.vibrator.start({
        mode: VIBRATOR_SCENE_SHORT_MIDDLE,
      })
      if (startedAt !== undefined) this.runtimeDiagnostics.recordHaptic(startedAt, Date.now())
    }

    if (this.hp <= 0) {
      this.finishRun()
    }
  },

  finishRun(now = Date.now()) {
    if (this.finished || this.destroyed) return

    this.finished = true
    this.stopGameLoop()
    this.completedRun = { survivedMs: this.simulationClock.elapsedMs, timestamp: now }
    this.flushPointerDiagnostics()
    this.diagnosticMetadata.deferExport = true
    this.runtimeDiagnostics.requestFinish('game-over')
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
    const diagnostics = this.runtimeDiagnostics
    try {
      const entry = createScoreEntry(completed.survivedMs, this.settings, completed.timestamp)
      const startedAt = diagnostics.enabled ? Date.now() : undefined
      appendScore(entry)
      if (startedAt !== undefined) this.diagnosticMetadata.scoreSaveMs = Date.now() - startedAt
      if (!this.destroyed) {
        const routingAt = diagnostics.enabled ? Date.now() : undefined
        replace({ url: ROUTES.RESULTS, params: JSON.stringify({ mode: 'summary', session: entry }) })
        if (routingAt !== undefined) this.diagnosticMetadata.resultsRouteMs = Date.now() - routingAt
      }
    } finally {
      diagnostics.finishDeferred()
    }
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
    const probe = this.stallProbe
    const scanAt = probe ? Date.now() : 0
    collectFrameCollisionCandidates(this.asteroids, this.shipRect, clock.elapsedMs, throughMs, this.frameCollisionCandidates)
    if (probe) probe.scanMs = Date.now() - scanAt
    this.simulationFrameActive = true
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
              this.diagnosticMetadata.foldedSwipeMoves += 1
              continue
            }
          }
          advanceSimulationClockBatched(clock, Math.min(now, input.at), this.simulationUpdate)
          if (this.finished || this.destroyed) break
          this.applyPointerInput(input, swipeTarget)
        }
        if (!this.finished && !this.destroyed) advanceSimulationClockBatched(clock, now, this.simulationUpdate)
      }
    } finally {
      // Full list/grid work occurs once per callback (plus actual spawn events).
      // Damage, cooldown and score still use the original 10 ms step instants.
      const materializeAt = probe ? Date.now() : 0
      this.diagnosticMetadata.fullMaterializations += 1
      this.diagnosticMetadata.fullAsteroidVisits += this.asteroids.length
      materializeAsteroidsAt(this.asteroids, clock.elapsedMs, this.viewport, undefined, SIMULATION_STEP_MS, false)
      this.simulationFrameActive = false
      events.length = 0
      if (probe) probe.materializeMs = Date.now() - materializeAt
    }
  },

  updateCanonicalRect(rect, centerY) {
    // Dimensions and x never change during a run. Stationary steps must not
    // rewrite the same five points, but both temporal buffers stay independent.
    const y = Math.round(clamp(centerY, this.shipYLimits.min, this.shipYLimits.max) - this.shipGeometry.h / 2)
    if (rect.y === y) return
    rect.y = y
    rect.centerY = y + rect.h / 2
    rect.points[0].y = rect.points[2].y = rect.points[4].y = rect.centerY
    rect.points[1].y = y
    rect.points[3].y = y + rect.h
  },

  advanceQuietSteps(count) {
    if (count <= 0) return
    const probe = this.stallProbe
    const startedAt = probe ? Date.now() : 0
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
    if (this.displayedHp === this.hp) {
      this.previousDisplayedHp = this.hp
    } else {
      // Retain repeated-add rounding and the last two presentation values.
      for (let index = 0; index < count; index += 1) {
        this.previousDisplayedHp = this.displayedHp
        this.displayedHp = moveTowards(this.displayedHp, this.hp, HUD_DISPLAY_HP_SPEED * (SIMULATION_STEP_MS / 1000))
        if (this.displayedHp === this.hp && index + 1 < count) {
          this.previousDisplayedHp = this.hp
          break
        }
      }
    }
    this.simulationClock.elapsedMs += count * SIMULATION_STEP_MS
    this.diagnosticMetadata.skippedQuanta += count
    this.runtimeDiagnostics.recordSkippedSteps(count)
    if (probe) probe.quietMs += Date.now() - startedAt
  },

  prepareCollisionWindows(fromMs, throughMs) {
    const probe = this.frameCollisionCandidates.length ? this.stallProbe : null
    const startedAt = probe ? Date.now() : 0
    const velocity = this.getPointerVelocity()
    const stopCenter = this.settings.controlMode === 'swipe' ? this.swipeTargetY : undefined
    let count = 0
    for (let index = 0; index < this.frameCollisionCandidates.length; index += 1) {
      const asteroid = this.frameCollisionCandidates[index]
      if (asteroid.motionRemoved) continue
      // This object cannot damage again anywhere in the remaining segment.
      // Its analytic position still advances at the usual scene boundaries.
      if (asteroid.lastHitAt + COLLISION_COOLDOWN_MS > throughMs) continue
      const slot = this.collisionWindows[count] || (this.collisionWindows[count] = {})
      if (getCollisionQuantumWindow(asteroid, this.shipGeometry, fromMs, throughMs, this.shipCenterY, velocity, slot, SIMULATION_STEP_MS, stopCenter)) {
        slot.asteroid = asteroid
        count += 1
      }
    }
    this.collisionWindowCount = count
    if (probe) probe.windowsMs += Date.now() - startedAt
  },

  advanceSimulationBlock(count, fromMs) {
    if (this.stallProbe) this.stallProbe.blocks += 1
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
          // A hit inside this block changes eligibility without rebuilding the
          // spatial window. Read this asteroid's current cooldown every time.
          const readyAt = window.asteroid.lastHitAt + COLLISION_COOLDOWN_MS
          const readyQuantum = Number.isFinite(readyAt) ? Math.ceil(readyAt / SIMULATION_STEP_MS) * SIMULATION_STEP_MS : 0
          const candidate = Math.max(cursor + SIMULATION_STEP_MS, window.firstMs, readyQuantum)
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
    const probe = this.stallProbe
    const startedAt = probe ? Date.now() : 0
    this.diagnosticMetadata.eventQuanta += 1
    const sampled = this.runtimeDiagnostics.beginStep(this.frameCollisionCandidates.length)
    const previousShipRect = this.shipRect
    this.updateShip(deltaSeconds)

    const shipRect = this.nextShipRect
    this.updateCanonicalRect(shipRect, this.shipCenterY)
    this.nextShipRect = previousShipRect
    this.shipRect = shipRect
    this.lastPoseCenterY = this.shipCenterY
    if (sampled) this.runtimeDiagnostics.markStepPhase(0)

    this.spawnAsteroids(now, shipRect)
    if (sampled) this.runtimeDiagnostics.markStepPhase(1)
    if (this.frameCollisionCandidates.length) advanceFrameCollisionCandidates(this.frameCollisionCandidates, now, SIMULATION_STEP_MS)
    if (sampled) this.runtimeDiagnostics.markStepPhase(2)
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
    if (sampled) this.runtimeDiagnostics.markStepPhase(3)
    if (this.collisionCandidates.length) this.handleCollisions(now, shipRect, previousShipRect)
    if (sampled) this.runtimeDiagnostics.markStepPhase(4)
    this.previousDisplayedHp = this.displayedHp
    this.displayedHp = moveTowards(
      this.displayedHp,
      this.hp,
      HUD_DISPLAY_HP_SPEED * deltaSeconds
    )
    if (sampled) this.runtimeDiagnostics.markStepPhase(5)
    this.runtimeDiagnostics.endStep(this.collisionCandidates.length)
    if (probe) {
      probe.eventSteps += 1
      probe.stepsMs += Date.now() - startedAt
    }
  },

  tick() {
    if (this.finished || this.destroyed) return
    const now = Date.now()
    const diagnostics = this.runtimeDiagnostics
    const probe = diagnostics.enabled ? this.diagnosticMetadata.stallFrame : null
    this.stallProbe = probe
    if (probe) resetStallFrame(probe, this.pointerInbox.length)
    this.flushPointerDiagnostics()
    consumePointerSamples(this.pointerInbox, this.pointerInput, this.simulationClock,
      this.settings.controlMode, this.viewportHalfHeight)
    if (probe) {
      probe.inputMs = Date.now() - now
      probe.commands = this.pointerInput.events.length
    }
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
      this.stallProbe = null
      diagnostics.endFrame(Date.now(), this.simulationClock, this.finished || this.destroyed)
    }
  },

  drawFrame(shipRect) {
    this.publishPresentationFrame(shipRect)
    this.presentFrame(this.publishedFrame)
  },

  publishPresentationFrame(shipRect) {
    const interpolate = !shipRect && this.simulationClock.elapsedMs > 0
    const alpha = this.simulationClock.pendingMs / SIMULATION_STEP_MS
    const renderAtMs = interpolate ? this.simulationClock.elapsedMs - SIMULATION_STEP_MS + this.simulationClock.pendingMs : this.simulationClock.elapsedMs
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
    frame.asteroidCount = this.asteroids.length
    for (let i = 0; i < frame.asteroidCount; i += 1) {
      const asteroid = this.asteroids[i]
      const image = frame.asteroids[i] || (frame.asteroids[i] = {})
      image.id = asteroid.id
      image.x = interpolate ? getAsteroidXAt(asteroid, renderAtMs) : asteroid.x
      image.y = asteroid.y
      image.radius = asteroid.radius
    }

    // The renderer only sees the complete published frame. Reuse the other buffer.
    this.nextPresentationFrame = this.publishedFrame
    this.publishedFrame = frame
  },

  presentFrame(frame) {
    if (this.spriteRenderer) {
      this.spriteRenderer.draw(frame)
      if (frame.displayedHp !== this.lastSpriteHudHp) {
        this.diagnosticMetadata.frameHud = true
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
