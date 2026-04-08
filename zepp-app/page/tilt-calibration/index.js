import { Accelerometer, FREQ_MODE_NORMAL } from '@zos/sensor'
import { replace, push } from '@zos/router'
import { align, createWidget, prop, setStatusBarVisible, widget } from '@zos/ui'
import { resetPageBrightTime, setPageBrightTime } from '@zos/display'
import { getDeviceInfo } from '@zos/device'
import {
  COLORS,
  FEATURE_FLAGS,
  ROUTES,
} from '../../shared/constants.js'
import {
  TILT_CALIBRATION_STAGES,
  getAverageStepDelta,
  buildTiltCalibrationReport,
  getDirectionalDelta,
  getMeanAbsoluteDeviation,
  getWindowRange,
  orientTiltY,
} from '../../shared/tilt-calibration.js'
import { loadSettings, saveTiltCalibration, saveTiltCalibrationReport } from '../../shared/storage.js'
import { t } from '../../shared/i18n.js'

const SAMPLE_INTERVAL_MS = 60
const BRIGHT_TIME_MS = 600000
const STABILITY_WINDOW_SIZE = 10
const CENTER_STABLE_RANGE = 18
const CENTER_STABLE_DELTA = 4.8
const CENTER_STABLE_DEVIATION = 5.4
const SETTLE_RANGE = 16
const SETTLE_DELTA = 4.2
const SETTLE_DEVIATION = 4.8
const STABILITY_SMOOTHING_ALPHA = 0.08
const HOLD_DECAY_FACTOR_STILL = 0.35
const HOLD_DECAY_FACTOR_SETTLE = 0.55

function hideStatusBar() {
  try {
    setStatusBarVisible(false)
  } catch (_error) {}
}

function keepScreenAwake() {
  try {
    setPageBrightTime({ brightTime: BRIGHT_TIME_MS })
  } catch (_error) {}
}

function restoreScreenTimeout() {
  try {
    resetPageBrightTime()
  } catch (_error) {}
}

function setText(target, text) {
  if (!target) {
    return
  }

  const nextText = String(text ?? '')

  try {
    target.props.text = nextText
  } catch (_error) {}

  try {
    target.setProperty(prop.MORE, { text: nextText })
  } catch (_error) {}
}

function updateHoldProgress(currentMs, isStable, decayFactor) {
  if (isStable) {
    return currentMs + SAMPLE_INTERVAL_MS
  }

  return Math.max(0, currentMs - SAMPLE_INTERVAL_MS * decayFactor)
}

Page({
  onInit() {
    this.stageIndex = -1
    this.stageStartedAt = 0
    this.stageHoldMs = 0
    this.stagePhase = 'idle'
    this.referenceY = 0
    this.recentSamples = []
    this.recentStableSamples = []
    this.smoothedY = null
    this.samplesByStage = Object.fromEntries(
      TILT_CALIBRATION_STAGES.map((stage) => [stage.id, []])
    )
    this.stageDiagnostics = Object.fromEntries(
      TILT_CALIBRATION_STAGES.map((stage) => [stage.id, {}])
    )
    this.finished = false
    this.accelerometer = null
    this.wristSide = 'left'
  },

  ensureState() {
    if (this.samplesByStage && this.stageDiagnostics) {
      return
    }

    this.stageIndex = -1
    this.stageStartedAt = 0
    this.stageHoldMs = 0
    this.stagePhase = 'idle'
    this.referenceY = 0
    this.recentSamples = []
    this.recentStableSamples = []
    this.smoothedY = null
    this.samplesByStage = Object.fromEntries(
      TILT_CALIBRATION_STAGES.map((stage) => [stage.id, []])
    )
    this.stageDiagnostics = Object.fromEntries(
      TILT_CALIBRATION_STAGES.map((stage) => [stage.id, {}])
    )
    this.finished = false
    this.accelerometer = null
    this.wristSide = 'left'
  },

  build() {
    this.ensureState()
    hideStatusBar()
    keepScreenAwake()
    const deviceInfo = getDeviceInfo()
    const settings = loadSettings()
    this.wristSide = settings.wristSide || 'left'
    const width = deviceInfo.width
    const titleY = 28
    const guideY = 74
    const stepY = 114
    const instructionY = 150
    const timerY = 226
    const liveY = 258

    const title = createWidget(widget.TEXT, {
      x: 0,
      y: titleY,
      w: width,
      h: 34,
      text: t('tiltCalibrationTitle'),
      color: COLORS.accent,
      text_size: 26,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
    })
    const guide = createWidget(widget.TEXT, {
      x: 0,
      y: guideY,
      w: width,
      h: 24,
      text: t('tiltCalibrationGuide'),
      color: COLORS.textMuted,
      text_size: 16,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
    })
    const step = createWidget(widget.TEXT, {
      x: 0,
      y: stepY,
      w: width,
      h: 24,
      text: '',
      color: COLORS.accent,
      text_size: 18,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
    })
    const instruction = createWidget(widget.TEXT, {
      x: 0,
      y: instructionY,
      w: width,
      h: 60,
      text: '',
      color: COLORS.textPrimary,
      text_size: 24,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
    })
    const timer = createWidget(widget.TEXT, {
      x: 0,
      y: timerY,
      w: width,
      h: 32,
      text: '',
      color: COLORS.textMuted,
      text_size: 18,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
    })
    const live = createWidget(widget.TEXT, {
      x: 0,
      y: liveY,
      w: width,
      h: 28,
      text: '',
      color: COLORS.textMuted,
      text_size: 16,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
    })
    const debug = createWidget(widget.TEXT, {
      x: 0,
      y: liveY + 24,
      w: width,
      h: 22,
      text: '',
      color: COLORS.textMuted,
      text_size: 13,
      align_h: align.CENTER_H,
      align_v: align.CENTER_V,
    })

    this.guideText = guide
    this.stepText = step
    this.titleText = title
    this.instructionText = instruction
    this.timerText = timer
    this.liveText = live
    this.debugText = debug

    this.accelerometer = new Accelerometer()
    this.accelerometer.setFreqMode(FREQ_MODE_NORMAL)
    this.accelerometer.start()

    this.beginStage(0)
    this.loop = setInterval(() => this.tick(), SAMPLE_INTERVAL_MS)
  },

  onDestroy() {
    restoreScreenTimeout()
    if (this.loop) {
      clearInterval(this.loop)
      this.loop = null
    }
    if (this.accelerometer) {
      this.accelerometer.stop()
      this.accelerometer = null
    }
  },

  beginStage(index) {
    this.stageIndex = index
    this.stageStartedAt = Date.now()
    this.stageHoldMs = 0
    this.recentSamples = []
    this.recentStableSamples = []
    const stage = TILT_CALIBRATION_STAGES[index]
    this.stagePhase = stage.mode === 'still' ? 'still' : 'move'
    this.stageDiagnostics[stage.id] = {
      samples: 0,
      resets: 0,
      holdMs: 0,
      entryMs: null,
      peakDelta: 0,
      settleRange: 0,
      avgStepDelta: 0,
      avgDeviation: 0,
    }
    setText(
      this.stepText,
      t('tiltCalibrationStep', {
        current: index + 1,
        total: TILT_CALIBRATION_STAGES.length,
      })
    )
    setText(this.instructionText, t(`tiltCalibration${stage.id[0].toUpperCase()}${stage.id.slice(1)}`))
    setText(
      this.timerText,
      stage.mode === 'still'
        ? t('tiltCalibrationWaitingStill', { current: '0.0', target: (stage.durationMs / 1000).toFixed(1) })
        : t('tiltCalibrationWaitingMove')
    )
    setText(this.liveText, t('tiltCalibrationLive', { value: '0.00' }))
    setText(this.debugText, 'RNG 0.00  MOV 0.00  DEV 0.00')
  },

  tick() {
    if (this.finished || !this.accelerometer) {
      return
    }

    const now = Date.now()
    const stage = TILT_CALIBRATION_STAGES[this.stageIndex]
    const reading = this.accelerometer.getCurrent() || { y: 0 }
    const orientedY = orientTiltY(reading.y, this.wristSide)
    this.samplesByStage[stage.id].push(orientedY)
    this.recentSamples.push(orientedY)
    if (this.recentSamples.length > STABILITY_WINDOW_SIZE) {
      this.recentSamples.shift()
    }
    this.smoothedY =
      this.smoothedY == null
        ? orientedY
        : this.smoothedY + (orientedY - this.smoothedY) * STABILITY_SMOOTHING_ALPHA
    this.recentStableSamples.push(this.smoothedY)
    if (this.recentStableSamples.length > STABILITY_WINDOW_SIZE) {
      this.recentStableSamples.shift()
    }
    const debug = this.stageDiagnostics[stage.id]
    debug.samples += 1

    const roundedY = (Math.round(reading.y * 100) / 100).toFixed(2)
    setText(
      this.liveText,
      t('tiltCalibrationLive', {
        value: roundedY,
      })
    )
    const stableRange = getWindowRange(this.recentStableSamples)
    const avgStepDelta = getAverageStepDelta(this.recentStableSamples)
    const avgDeviation = getMeanAbsoluteDeviation(this.recentStableSamples)
    setText(
      this.debugText,
      `RNG ${stableRange.toFixed(2)}  MOV ${avgStepDelta.toFixed(2)}  DEV ${avgDeviation.toFixed(2)}`
    )

    if (stage.mode === 'still') {
      const isStable =
        this.recentStableSamples.length >= 4 &&
        stableRange <= CENTER_STABLE_RANGE &&
        avgStepDelta <= CENTER_STABLE_DELTA &&
        avgDeviation <= CENTER_STABLE_DEVIATION

      const nextHoldMs = updateHoldProgress(
        this.stageHoldMs,
        isStable,
        HOLD_DECAY_FACTOR_STILL
      )
      if (!isStable && nextHoldMs < this.stageHoldMs) {
        debug.resets += 1
      }
      this.stageHoldMs = nextHoldMs
      debug.holdMs = this.stageHoldMs
      debug.settleRange = Math.max(debug.settleRange, stableRange)
      debug.avgStepDelta = Math.max(debug.avgStepDelta, avgStepDelta)
      debug.avgDeviation = Math.max(debug.avgDeviation, avgDeviation)
      setText(
        this.timerText,
        t('tiltCalibrationWaitingStill', {
          current: (this.stageHoldMs / 1000).toFixed(1),
          target: (stage.durationMs / 1000).toFixed(1),
        })
      )
      if (this.stageHoldMs < stage.durationMs) {
        return
      }
      this.referenceY = this.smoothedY ?? orientedY
    } else {
      const currentY = this.smoothedY ?? orientedY
      const delta = getDirectionalDelta(currentY, this.referenceY, stage.direction)
      debug.peakDelta = Math.max(debug.peakDelta, delta)

      if (this.stagePhase === 'move') {
        setText(this.timerText, t('tiltCalibrationWaitingMove'))
        if (delta < stage.entryThreshold) {
          return
        }
        this.stagePhase = 'settle'
        this.stageHoldMs = 0
        this.recentStableSamples = [currentY]
        debug.entryMs = now - this.stageStartedAt
        debug.holdMs = this.stageHoldMs
        return
      }

      const needsReset =
        delta < stage.entryThreshold * 0.82 || stableRange > SETTLE_RANGE
        || avgStepDelta > SETTLE_DELTA
        || avgDeviation > SETTLE_DEVIATION

      const nextHoldMs = updateHoldProgress(
        this.stageHoldMs,
        !needsReset,
        HOLD_DECAY_FACTOR_SETTLE
      )
      if (needsReset && nextHoldMs < this.stageHoldMs) {
        debug.resets += 1
      }
      this.stageHoldMs = nextHoldMs

      debug.holdMs = this.stageHoldMs
      debug.settleRange = Math.max(debug.settleRange, stableRange)
      debug.avgStepDelta = Math.max(debug.avgStepDelta, avgStepDelta)
      debug.avgDeviation = Math.max(debug.avgDeviation, avgDeviation)
      setText(
        this.timerText,
        t('tiltCalibrationWaitingSettle', {
          current: (this.stageHoldMs / 1000).toFixed(1),
          target: (stage.durationMs / 1000).toFixed(1),
        })
      )

      if (this.stageHoldMs < stage.durationMs) {
        return
      }
    }

    if (this.stageIndex < TILT_CALIBRATION_STAGES.length - 1) {
      this.beginStage(this.stageIndex + 1)
      return
    }

    this.finishCalibration()
  },

  finishCalibration() {
    this.finished = true
    const report = buildTiltCalibrationReport(this.samplesByStage, this.stageDiagnostics)
    saveTiltCalibration(report.profile)
    saveTiltCalibrationReport(report)
    setText(this.stepText, '')
    setText(this.instructionText, t('tiltCalibrationDone'))
    setText(this.timerText, '')
    setText(this.liveText, '')
    setText(this.debugText, '')

    setTimeout(() => {
      if (FEATURE_FLAGS.tiltCalibrationLogs) {
        push({ url: ROUTES.TILT_CALIBRATION_LOGS })
        return
      }

      replace({ url: ROUTES.SETTINGS })
    }, 250)
  },
})
