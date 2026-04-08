import {
  CONTROL_MODES,
  DEFAULT_SETTINGS,
  MAX_SCORE_HISTORY,
  SPAWN_MULTIPLIER_OPTIONS,
  STORAGE_KEYS,
  TILT_SENSITIVITY_OPTIONS,
  TIME_SCALE_OPTIONS,
  WRIST_SIDES,
} from './constants.js'
import { sanitizeTiltCalibration } from './tilt-calibration.js'

function safeParse(rawValue, fallback) {
  if (rawValue == null) {
    return fallback
  }

  if (typeof rawValue === 'string') {
    try {
      return JSON.parse(rawValue)
    } catch (_error) {
      return fallback
    }
  }

  return rawValue
}

export function readJson(storage, key, fallback) {
  try {
    return safeParse(storage.getItem(key, null), fallback)
  } catch (_error) {
    return fallback
  }
}

export function writeJson(storage, key, value) {
  storage.setItem(key, JSON.stringify(value))
  return value
}

function normalizeOption(value, options, fallback) {
  const numericValue = Number(value)
  return options.includes(numericValue) ? numericValue : fallback
}

export function sanitizeSettings(settings = {}) {
  const candidate = settings || {}
  const controlMode = CONTROL_MODES.includes(candidate.controlMode)
    ? candidate.controlMode
    : DEFAULT_SETTINGS.controlMode
  const wristSide = WRIST_SIDES.includes(candidate.wristSide)
    ? candidate.wristSide
    : DEFAULT_SETTINGS.wristSide

  return {
    controlMode,
    wristSide,
    timeScale: normalizeOption(
      candidate.timeScale,
      TIME_SCALE_OPTIONS,
      DEFAULT_SETTINGS.timeScale
    ),
    spawnMultiplier: normalizeOption(
      candidate.spawnMultiplier,
      SPAWN_MULTIPLIER_OPTIONS,
      DEFAULT_SETTINGS.spawnMultiplier
    ),
    tiltSensitivity: normalizeOption(
      candidate.tiltSensitivity,
      TILT_SENSITIVITY_OPTIONS,
      DEFAULT_SETTINGS.tiltSensitivity
    ),
  }
}

export function readSettings(storage) {
  return sanitizeSettings(readJson(storage, STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS))
}

export function writeSettings(storage, settings) {
  return writeJson(storage, STORAGE_KEYS.SETTINGS, sanitizeSettings(settings))
}

export function readScores(storage) {
  const scores = readJson(storage, STORAGE_KEYS.SCORES, [])
  return Array.isArray(scores) ? scores : []
}

export function writeScores(storage, scores) {
  const nextScores = Array.isArray(scores) ? scores : []
  return writeJson(storage, STORAGE_KEYS.SCORES, nextScores)
}

export function trimScores(scores, limit = MAX_SCORE_HISTORY) {
  return [...scores]
    .filter(Boolean)
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, limit)
}

export function appendScore(storage, entry) {
  const nextScores = trimScores([...readScores(storage), entry])
  writeScores(storage, nextScores)
  return nextScores
}

export function readLastSession(storage) {
  return readJson(storage, STORAGE_KEYS.LAST_SESSION, null)
}

export function writeLastSession(storage, session) {
  return writeJson(storage, STORAGE_KEYS.LAST_SESSION, session)
}

export function readTiltCalibration(storage) {
  return sanitizeTiltCalibration(
    readJson(storage, STORAGE_KEYS.TILT_CALIBRATION, null)
  )
}

export function writeTiltCalibration(storage, calibration) {
  return writeJson(
    storage,
    STORAGE_KEYS.TILT_CALIBRATION,
    sanitizeTiltCalibration(calibration)
  )
}

export function readTiltCalibrationReport(storage) {
  return readJson(storage, STORAGE_KEYS.TILT_CALIBRATION_REPORT, null)
}

export function writeTiltCalibrationReport(storage, report) {
  return writeJson(storage, STORAGE_KEYS.TILT_CALIBRATION_REPORT, report)
}
