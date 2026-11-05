import { LocalStorage, SessionStorage } from '@zos/storage'
import {
  appendScore as appendScoreToStorage,
  readLastSession,
  readScores,
  readSettings,
  readTiltCalibration,
  readTiltCalibrationReport,
  writeLastSession,
  writeSettings,
  writeTiltCalibration,
  writeTiltCalibrationReport,
} from './persistence.js'

let localStorageInstance
let sessionStorageInstance

function getLocalStorage() {
  if (!localStorageInstance) {
    localStorageInstance = new LocalStorage()
  }

  return localStorageInstance
}

function getSessionStorage() {
  if (!sessionStorageInstance) {
    sessionStorageInstance = new SessionStorage()
  }

  return sessionStorageInstance
}

// Keep diagnostic writes on the same cached instance as settings and scores.
// Separate LocalStorage instances can overwrite each other's loaded snapshots.
export function advanceRuntimeDiagnosticRun() {
  try {
    const store = getLocalStorage()
    const previous = Number(store.getItem('runtime_diagnostic_run_v1', 0))
    const index = (Number.isFinite(previous) && previous >= 0 ? Math.floor(previous) : 0) % 1000000 + 1
    store.setItem('runtime_diagnostic_run_v1', String(index))
    return { index, persisted: true }
  } catch (_error) {
    return { index: 1, persisted: false }
  }
}

export function loadSettings() {
  return readSettings(getLocalStorage())
}

export function saveSettings(settings) {
  return writeSettings(getLocalStorage(), settings)
}

export function loadScores() {
  return readScores(getLocalStorage())
}

export function appendScore(entry) {
  return appendScoreToStorage(getLocalStorage(), entry)
}

export function loadLastSession() {
  return readLastSession(getSessionStorage())
}

export function saveLastSession(session) {
  return writeLastSession(getSessionStorage(), session)
}

export function loadTiltCalibration() {
  return readTiltCalibration(getLocalStorage())
}

export function saveTiltCalibration(calibration) {
  return writeTiltCalibration(getLocalStorage(), calibration)
}

export function loadTiltCalibrationReport() {
  return readTiltCalibrationReport(getLocalStorage())
}

export function saveTiltCalibrationReport(report) {
  return writeTiltCalibrationReport(getLocalStorage(), report)
}
