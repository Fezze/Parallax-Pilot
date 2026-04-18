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
import {
  buildScoreSubmission,
  queueScoreSubmission,
  readLeaderboardSubmitConfig,
  readSubmitQueue,
  removeSubmittedScore,
} from './leaderboard-submit.js'

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

export function queueLeaderboardScore(entry, deviceInfo = {}, clientVersion = 'watch') {
  const storage = getLocalStorage()
  const submitConfig = readLeaderboardSubmitConfig(storage)
  const submission = buildScoreSubmission({
    scoreEntry: entry,
    playerId: submitConfig.playerId,
    nickname: submitConfig.nickname,
    clientVersion,
    deviceModel: deviceInfo.deviceName || deviceInfo.model || deviceInfo.screenShape || 'zepp-watch',
  })
  queueScoreSubmission(storage, submission)
  return submission
}

export function loadLeaderboardSubmitQueue() {
  return readSubmitQueue(getLocalStorage())
}

export function removeLeaderboardSubmission(submissionId) {
  return removeSubmittedScore(getLocalStorage(), submissionId)
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
