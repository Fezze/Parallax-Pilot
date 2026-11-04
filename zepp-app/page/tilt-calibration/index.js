import { Accelerometer, FREQ_MODE_NORMAL } from '@zos/sensor'
import { replace } from '@zos/router'
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
  average,
  CALIBRATION_SAMPLE_LIMIT,
  CALIBRATION_STAGE_TIMEOUT_MS,
  CALIBRATION_STABLE_RANGE,
  CALIBRATION_SETTLE_RANGE,
} from '../../shared/tilt-calibration.js'
import { loadSettings, saveTiltCalibration, saveTiltCalibrationReport } from '../../shared/storage.js'
import { createRoundButtonPair } from '../../shared/page-ui.js'
import { t } from '../../shared/i18n.js'

const SAMPLE_INTERVAL_MS = 60
const BRIGHT_TIME_MS = 600000
const STABILITY_WINDOW_SIZE = 10

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

Page({
  onInit() {
    this.destroyed = false
    this.finished = false
    this.accelerometer = null
    this.loop = null
    this.samplesByStage = {}
    this.stageDiagnostics = {}
  },

  build() {
    if (!this.samplesByStage) this.onInit()
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

    createRoundButtonPair({
      x: Math.round(width * 0.14), w: Math.round(width * 0.72),
      y: deviceInfo.height - 68, h: 44,
      left: { text: t('cancel'), textSize: 18, onClick: () => {
        this.stopSampling()
        replace({ url: ROUTES.SETTINGS })
      } },
      right: { text: t('retry'), textSize: 18, onClick: () => this.startAttempt() },
    })
    this.startAttempt()
  },

  stopSampling() {
    if (this.loop != null) clearInterval(this.loop)
    this.loop = null
    if (this.accelerometer) this.accelerometer.stop()
    this.accelerometer = null
  },

  onDestroy() {
    this.destroyed = true
    this.finished = true
    this.stopSampling()
    restoreScreenTimeout()
  },

  startAttempt() {
    if (this.destroyed) return
    this.stopSampling()
    this.finished = false
    this.referenceY = 0
    this.deadzone = 0
    this.samplesByStage = Object.fromEntries(TILT_CALIBRATION_STAGES.map(stage => [stage.id, []]))
    this.stageDiagnostics = {}
    setText(this.guideText, t('tiltCalibrationGuide'))
    try {
      this.accelerometer = new Accelerometer()
      this.accelerometer.setFreqMode(FREQ_MODE_NORMAL)
      this.accelerometer.start()
      this.beginStage(0)
      this.loop = setInterval(() => this.tick(), SAMPLE_INTERVAL_MS)
    } catch (_error) {
      this.failCalibration()
    }
  },

  failCalibration() {
    this.finished = true
    this.stagePhase = 'failed'
    this.stopSampling()
    setText(this.instructionText, t('tiltCalibrationFailed'))
    setText(this.timerText, t('tiltCalibrationRetryHint'))
    setText(this.liveText, '')
    setText(this.debugText, '')
  },

  beginStage(index) {
    this.stageIndex = index
    this.stageStartedAt = Date.now()
    this.stageHoldMs = 0
    this.recentSamples = []
    this.lastSampleAt = Date.now()
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
    setText(this.debugText, 'RNG 0.00  MOV 0.00')
  },

  tick() {
    if (this.finished || !this.accelerometer) return
    const now = Date.now()
    if (now - this.stageStartedAt >= CALIBRATION_STAGE_TIMEOUT_MS) {
      this.failCalibration()
      return
    }
    const stage = TILT_CALIBRATION_STAGES[this.stageIndex]
    let reading
    try { reading = this.accelerometer.getCurrent() } catch (_error) {
      this.failCalibration()
      return
    }
    const sampleMs = now - this.lastSampleAt
    this.lastSampleAt = now
    if (!Number.isFinite(reading?.y) || sampleMs <= 0 || sampleMs > SAMPLE_INTERVAL_MS * 3) {
      this.recentSamples = []
      this.samplesByStage[stage.id] = []
      this.stageHoldMs = 0
      return
    }
    const orientedY = orientTiltY(reading.y, this.wristSide)
    this.recentSamples.push(orientedY)
    if (this.recentSamples.length > STABILITY_WINDOW_SIZE) this.recentSamples.shift()
    const debug = this.stageDiagnostics[stage.id]
    debug.samples += 1
    const stableRange = getWindowRange(this.recentSamples)
    const avgStepDelta = getAverageStepDelta(this.recentSamples)
    const avgDeviation = getMeanAbsoluteDeviation(this.recentSamples)
    debug.settleRange = Math.max(debug.settleRange, stableRange)
    debug.avgStepDelta = Math.max(debug.avgStepDelta, avgStepDelta)
    debug.avgDeviation = Math.max(debug.avgDeviation, avgDeviation)
    setText(this.liveText, t('tiltCalibrationLive', { value: orientedY.toFixed(2) }))
    setText(this.debugText, `RNG ${stableRange.toFixed(2)}  MOV ${avgStepDelta.toFixed(2)}`)

    const delta = getDirectionalDelta(orientedY, this.referenceY, stage.direction)
    const entryThreshold = Math.max(CALIBRATION_STABLE_RANGE, this.deadzone * 3)
    if (stage.mode === 'move') {
      debug.peakDelta = Math.max(debug.peakDelta, delta)
      if (this.stagePhase === 'move') {
        if (delta <= entryThreshold) return
        this.stagePhase = 'settle'
        this.recentSamples = [orientedY]
        debug.entryMs = now - this.stageStartedAt
        return
      }
    }
    const isStable = this.recentSamples.length === STABILITY_WINDOW_SIZE &&
      stableRange <= (stage.mode === 'still' ? CALIBRATION_STABLE_RANGE : CALIBRATION_SETTLE_RANGE) &&
      avgStepDelta <= (stage.mode === 'still' ? 4.8 : 4.2) &&
      avgDeviation <= (stage.mode === 'still' ? 5.4 : 4.8) &&
      (stage.mode === 'still' || delta > entryThreshold)
    if (!isStable) {
      if (this.stageHoldMs > 0) debug.resets += 1
      this.stageHoldMs = 0
      this.samplesByStage[stage.id] = []
    } else {
      // Consecutive settled raw samples only; transition/waiting spikes cannot set gain.
      this.stageHoldMs += Math.min(sampleMs, SAMPLE_INTERVAL_MS)
      this.samplesByStage[stage.id].push(orientedY)
      if (this.samplesByStage[stage.id].length > CALIBRATION_SAMPLE_LIMIT) this.samplesByStage[stage.id].shift()
    }
    debug.holdMs = this.stageHoldMs
    setText(this.timerText, t(stage.mode === 'still' ? 'tiltCalibrationWaitingStill' : 'tiltCalibrationWaitingSettle', {
      current: (this.stageHoldMs / 1000).toFixed(1), target: (stage.durationMs / 1000).toFixed(1),
    }))
    if (this.stageHoldMs < stage.durationMs) return
    if (stage.mode === 'still') {
      this.referenceY = average(this.samplesByStage.center)
      this.deadzone = Math.max(0.01, ...this.samplesByStage.center.map(value => Math.abs(value - this.referenceY) * 2.4))
    }
    if (this.stageIndex < TILT_CALIBRATION_STAGES.length - 1) this.beginStage(this.stageIndex + 1)
    else this.finishCalibration()
  },

  finishCalibration() {
    const report = buildTiltCalibrationReport(this.samplesByStage, this.stageDiagnostics, this.wristSide)
    if (!report.profile || loadSettings().wristSide !== this.wristSide) {
      this.failCalibration()
      return
    }
    this.finished = true
    this.stopSampling()
    saveTiltCalibration(report.profile)
    if (FEATURE_FLAGS.tiltCalibrationLogs) saveTiltCalibrationReport(report)
    setText(this.instructionText, t('tiltCalibrationDone'))
    replace({ url: FEATURE_FLAGS.tiltCalibrationLogs ? ROUTES.TILT_CALIBRATION_LOGS : ROUTES.SETTINGS })
  },
})
