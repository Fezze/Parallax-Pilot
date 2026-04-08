import { clamp } from './game-core.js'

export function orientTiltY(currentY, wristSide) {
  return wristSide === 'right' ? -currentY : currentY
}

export const TILT_CALIBRATION_STAGES = [
  {
    id: 'center',
    durationMs: 1400,
    mode: 'still',
  },
  {
    id: 'down',
    durationMs: 700,
    mode: 'move',
    direction: 'up',
    entryThreshold: 1.6,
  },
  {
    id: 'up',
    durationMs: 700,
    mode: 'move',
    direction: 'down',
    entryThreshold: 1.6,
  },
]

function average(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0
  }

  let sum = 0
  for (let index = 0; index < values.length; index += 1) {
    sum += values[index]
  }
  return sum / values.length
}

export function getMeanAbsoluteDeviation(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0
  }

  const center = average(values)
  let sum = 0

  for (let index = 0; index < values.length; index += 1) {
    sum += Math.abs(values[index] - center)
  }

  return sum / values.length
}

function maxAbsDeviation(values, reference) {
  let peak = 0
  for (let index = 0; index < values.length; index += 1) {
    peak = Math.max(peak, Math.abs(values[index] - reference))
  }
  return peak
}

function maxPositiveDelta(values, reference) {
  let peak = 0
  for (let index = 0; index < values.length; index += 1) {
    peak = Math.max(peak, values[index] - reference)
  }
  return peak
}

function maxNegativeDelta(values, reference) {
  let peak = 0
  for (let index = 0; index < values.length; index += 1) {
    peak = Math.max(peak, reference - values[index])
  }
  return peak
}

function roundMetric(value, digits = 2) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function getWindowRange(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return 0
  }

  let min = values[0]
  let max = values[0]

  for (let index = 1; index < values.length; index += 1) {
    min = Math.min(min, values[index])
    max = Math.max(max, values[index])
  }

  return max - min
}

export function getAverageStepDelta(values) {
  if (!Array.isArray(values) || values.length < 2) {
    return 0
  }

  let sum = 0

  for (let index = 1; index < values.length; index += 1) {
    sum += Math.abs(values[index] - values[index - 1])
  }

  return sum / (values.length - 1)
}

export function getDirectionalDelta(value, reference, direction) {
  if (direction === 'down') {
    return Math.max(0, reference - value)
  }

  if (direction === 'up') {
    return Math.max(0, value - reference)
  }

  return Math.abs(value - reference)
}

export function hasTiltCalibration(profile) {
  return Boolean(
    profile &&
      Number.isFinite(profile.offset) &&
      Number.isFinite(profile.deadzone) &&
      Number.isFinite(profile.negativeRange) &&
      Number.isFinite(profile.positiveRange) &&
      profile.negativeRange > profile.deadzone &&
      profile.positiveRange > profile.deadzone
  )
}

export function sanitizeTiltCalibration(profile) {
  if (!hasTiltCalibration(profile)) {
    return null
  }

  return {
    offset: roundMetric(profile.offset),
    deadzone: roundMetric(clamp(profile.deadzone, 0.4, 6)),
    negativeRange: roundMetric(clamp(profile.negativeRange, profile.deadzone + 1, 24)),
    positiveRange: roundMetric(clamp(profile.positiveRange, profile.deadzone + 1, 24)),
    responseExponent: roundMetric(clamp(profile.responseExponent ?? 1.12, 0.85, 1.4), 3),
    noisePeak: roundMetric(Math.max(0, profile.noisePeak ?? 0)),
    timestamp: Number(profile.timestamp) || Date.now(),
  }
}

export function normalizeTiltInput(currentY, calibration, wristSide = 'left') {
  const safeCalibration = sanitizeTiltCalibration(calibration)
  const orientedY = orientTiltY(currentY, wristSide)

  if (!safeCalibration) {
    return clamp(orientedY / 18, -1.15, 1.15)
  }

  const raw = orientedY - safeCalibration.offset
  const absRaw = Math.abs(raw)

  if (absRaw <= safeCalibration.deadzone) {
    return 0
  }

  const range = raw < 0
    ? safeCalibration.negativeRange
    : safeCalibration.positiveRange
  const normalized = clamp(
    (absRaw - safeCalibration.deadzone) /
      Math.max(0.001, range - safeCalibration.deadzone),
    0,
    1
  )
  const curved = Math.pow(normalized, safeCalibration.responseExponent)
  return raw < 0 ? -curved : curved
}

export function buildTiltCalibrationReport(samplesByStage, stageDiagnostics = {}) {
  const centerSamples = samplesByStage.center || []
  const downSamples = samplesByStage.down || []
  const upSamples = samplesByStage.up || []

  const offset = average(centerSamples)
  const noisePeak = maxAbsDeviation(centerSamples, offset)
  const downPeak = maxNegativeDelta(downSamples, offset)
  const upPeak = maxPositiveDelta(upSamples, offset)

  const profile = sanitizeTiltCalibration({
    offset,
    deadzone: Math.max(0.55, noisePeak * 2.4),
    negativeRange: Math.max(downPeak * 1.08, 5.8),
    positiveRange: Math.max(upPeak * 1.08, 5.8),
    responseExponent: 1,
    noisePeak,
    timestamp: Date.now(),
  })

  return {
    profile,
    metrics: {
      offset: roundMetric(offset),
      noisePeak: roundMetric(noisePeak),
      downPeak: roundMetric(downPeak),
      upPeak: roundMetric(upPeak),
    },
    debug: Object.fromEntries(
      Object.entries(stageDiagnostics).map(([stageId, debug]) => [
        stageId,
        Object.fromEntries(
          Object.entries(debug || {}).map(([key, value]) => [
            key,
            Number.isFinite(value) ? roundMetric(value, key.toLowerCase().includes('ms') ? 0 : 2) : value,
          ])
        ),
      ])
    ),
    samplesByStage,
  }
}
