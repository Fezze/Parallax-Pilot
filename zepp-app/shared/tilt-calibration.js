import { clamp } from './game-core.js'

// Raw Accelerometer Y is cm/s^2. In this wrist-oriented frame +Y moves down.
export const TILT_CALIBRATION_VERSION = 2
export const TILT_CALIBRATION_UNIT = 'cm/s^2'
export const TILT_CALIBRATION_FRAME = 'wrist-y-positive-down'
export const CALIBRATION_SAMPLE_LIMIT = 32
export const CALIBRATION_STAGE_TIMEOUT_MS = 30000
export const CALIBRATION_STABLE_RANGE = 18
export const CALIBRATION_SETTLE_RANGE = 16
const SENSOR_RESOLUTION = 0.01

export function orientTiltY(currentY, wristSide) {
  return wristSide === 'right' ? -currentY : currentY
}

export const TILT_CALIBRATION_STAGES = [
  { id: 'center', durationMs: 1400, mode: 'still' },
  { id: 'down', durationMs: 700, mode: 'move', direction: 'down' },
  { id: 'up', durationMs: 700, mode: 'move', direction: 'up' },
]

export function average(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

export function getMeanAbsoluteDeviation(values) {
  const center = average(values || [])
  return average((values || []).map(value => Math.abs(value - center)))
}

function maxAbsDeviation(values, reference) {
  return values.reduce((peak, value) => Math.max(peak, Math.abs(value - reference)), 0)
}

function roundMetric(value, digits = 2) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function getWindowRange(values) {
  return values?.length ? Math.max(...values) - Math.min(...values) : 0
}

export function getAverageStepDelta(values) {
  if (!values || values.length < 2) return 0
  let sum = 0
  for (let index = 1; index < values.length; index += 1) sum += Math.abs(values[index] - values[index - 1])
  return sum / (values.length - 1)
}

export function getDirectionalDelta(value, reference, direction) {
  if (direction === 'down') return Math.max(0, value - reference)
  if (direction === 'up') return Math.max(0, reference - value)
  return Math.abs(value - reference)
}

export function hasTiltCalibration(profile, wristSide = profile?.wristSide) {
  return Boolean(profile && profile.version === TILT_CALIBRATION_VERSION &&
    profile.unit === TILT_CALIBRATION_UNIT && profile.frame === TILT_CALIBRATION_FRAME &&
    ['left', 'right'].includes(profile.wristSide) && profile.wristSide === wristSide &&
    Number.isFinite(profile.offset) && Number.isFinite(profile.deadzone) && profile.deadzone > 0 &&
    Number.isFinite(profile.negativeRange) && Number.isFinite(profile.positiveRange) &&
    profile.negativeRange > profile.deadzone * 3 && profile.positiveRange > profile.deadzone * 3 &&
    profile.responseExponent === 1 && Number.isFinite(profile.noisePeak) && profile.noisePeak >= 0)
}

export function sanitizeTiltCalibration(profile, wristSide = profile?.wristSide) {
  if (!hasTiltCalibration(profile, wristSide)) return null
  // Do not cap or round the measured spans; either operation changes the gain.
  return {
    version: TILT_CALIBRATION_VERSION,
    unit: TILT_CALIBRATION_UNIT,
    frame: TILT_CALIBRATION_FRAME,
    wristSide: profile.wristSide,
    offset: profile.offset,
    deadzone: profile.deadzone,
    negativeRange: profile.negativeRange,
    positiveRange: profile.positiveRange,
    responseExponent: 1,
    noisePeak: profile.noisePeak,
    timestamp: Number.isFinite(profile.timestamp) ? profile.timestamp : 0,
  }
}

export function normalizeTiltInput(currentY, calibration, wristSide = 'left') {
  if (!Number.isFinite(currentY) || !hasTiltCalibration(calibration, wristSide)) return 0
  const raw = orientTiltY(currentY, wristSide) - calibration.offset
  const range = raw < 0 ? calibration.negativeRange : calibration.positiveRange
  const normalized = clamp((Math.abs(raw) - calibration.deadzone) / (range - calibration.deadzone), 0, 1)
  return raw < 0 ? -normalized : normalized
}

// Bound both diagnostic writes and reads, including reports from older versions.
export function sanitizeTiltCalibrationReport(report) {
  if (!report || typeof report !== 'object') return null
  const samplesByStage = {}
  const debug = {}
  for (const { id } of TILT_CALIBRATION_STAGES) {
    samplesByStage[id] = Array.isArray(report.samplesByStage?.[id])
      ? report.samplesByStage[id].slice(-CALIBRATION_SAMPLE_LIMIT).filter(Number.isFinite) : []
    debug[id] = {}
    for (const key of ['samples', 'resets', 'holdMs', 'entryMs', 'peakDelta', 'settleRange', 'avgStepDelta', 'avgDeviation']) {
      const value = report.debug?.[id]?.[key]
      if (Number.isFinite(value)) debug[id][key] = roundMetric(value)
    }
  }
  const metrics = {}
  for (const key of ['offset', 'noisePeak', 'downPeak', 'upPeak']) {
    if (Number.isFinite(report.metrics?.[key])) metrics[key] = roundMetric(report.metrics[key])
  }
  return { version: TILT_CALIBRATION_VERSION, profile: sanitizeTiltCalibration(report.profile),
    metrics, debug, samplesByStage, failureReason: report.profile ? null : 'invalid-samples' }
}

export function buildTiltCalibrationReport(samplesByStage, stageDiagnostics = {}, wristSide = 'left') {
  const samples = {}
  let valid = true
  for (const { id } of TILT_CALIBRATION_STAGES) {
    const values = samplesByStage[id]
    samples[id] = Array.isArray(values) ? values.slice(-CALIBRATION_SAMPLE_LIMIT) : []
    if (samples[id].length < 10 || !samples[id].every(Number.isFinite) ||
        getWindowRange(samples[id]) > (id === 'center' ? CALIBRATION_STABLE_RANGE : CALIBRATION_SETTLE_RANGE)) valid = false
  }
  const offset = average(samples.center)
  const noisePeak = maxAbsDeviation(samples.center, offset)
  const downPeak = average(samples.down) - offset
  const upPeak = offset - average(samples.up)
  const deadzone = Math.max(SENSOR_RESOLUTION, noisePeak * 2.4)
  // Require excursions beyond the raw stability envelope and all settled noise.
  const endpointNoise = Math.max(noisePeak,
    maxAbsDeviation(samples.down, average(samples.down)), maxAbsDeviation(samples.up, average(samples.up)))
  const minimumSpan = Math.max(CALIBRATION_STABLE_RANGE, deadzone * 3, endpointNoise * 3)
  if (downPeak <= minimumSpan || upPeak <= minimumSpan) valid = false
  const profile = valid ? sanitizeTiltCalibration({
    version: TILT_CALIBRATION_VERSION, unit: TILT_CALIBRATION_UNIT, frame: TILT_CALIBRATION_FRAME,
    wristSide, offset, deadzone, negativeRange: upPeak, positiveRange: downPeak,
    responseExponent: 1, noisePeak, timestamp: Date.now(),
  }) : null
  return sanitizeTiltCalibrationReport({ profile, metrics: { offset, noisePeak, downPeak, upPeak },
    debug: stageDiagnostics, samplesByStage: samples })
}
