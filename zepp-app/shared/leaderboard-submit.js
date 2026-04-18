import { DEFAULT_LEADERBOARD_API_BASE_URL, LEADERBOARD_STORAGE_KEYS } from './leaderboard-config.js'

export const LEADERBOARD_MESSAGE_TYPES = {
  SUBMIT_SCORE: 'leaderboard.submit-score',
  SUBMIT_ACK: 'leaderboard.submit-ack',
  FLUSH_QUEUE: 'leaderboard.flush-queue',
}

export const LEADERBOARD_SUBMIT_QUEUE_LIMIT = 25

function safeParse(rawValue, fallback) {
  if (!rawValue) {
    return fallback
  }

  if (typeof rawValue !== 'string') {
    return rawValue
  }

  try {
    return JSON.parse(rawValue)
  } catch (_error) {
    return fallback
  }
}

export function readSubmitQueue(storage) {
  const queue = safeParse(storage.getItem(LEADERBOARD_STORAGE_KEYS.SUBMIT_QUEUE), [])
  return Array.isArray(queue) ? queue.filter(Boolean) : []
}

export function writeSubmitQueue(storage, queue) {
  const nextQueue = Array.isArray(queue)
    ? queue.slice(-LEADERBOARD_SUBMIT_QUEUE_LIMIT)
    : []
  storage.setItem(LEADERBOARD_STORAGE_KEYS.SUBMIT_QUEUE, JSON.stringify(nextQueue))
  storage.setItem(LEADERBOARD_STORAGE_KEYS.SUBMIT_QUEUE_SIZE, String(nextQueue.length))
  return nextQueue
}

export function removeSubmittedScore(storage, submissionId) {
  const nextQueue = readSubmitQueue(storage)
    .filter((submission) => submission.submissionId !== submissionId)
  return writeSubmitQueue(storage, nextQueue)
}

export function buildScoreSubmission({
  scoreEntry,
  playerId,
  nickname,
  clientVersion,
  deviceModel,
}) {
  return {
    submissionId: `watch-${playerId}-${scoreEntry.id || scoreEntry.timestamp}`,
    playerId,
    nickname,
    score: Math.max(1, Math.round(Number(scoreEntry.score) || 0)),
    survivedMs: Math.max(1, Math.round(Number(scoreEntry.survivedMs) || 0)),
    playedAt: new Date(scoreEntry.timestamp || Date.now()).toISOString(),
    clientVersion,
    deviceModel,
  }
}

export function queueScoreSubmission(storage, submission) {
  const queue = readSubmitQueue(storage)
    .filter((entry) => entry.submissionId !== submission.submissionId)
  queue.push(submission)
  return writeSubmitQueue(storage, queue)
}

export function readLeaderboardSubmitConfig(storage) {
  return {
    apiBaseUrl:
      storage.getItem(LEADERBOARD_STORAGE_KEYS.API_BASE_URL) ||
      DEFAULT_LEADERBOARD_API_BASE_URL,
    playerId: storage.getItem(LEADERBOARD_STORAGE_KEYS.PLAYER_ID) || 'demo-player',
    nickname: storage.getItem(LEADERBOARD_STORAGE_KEYS.PLAYER_NICKNAME) || 'Pilot',
  }
}

export function encodeLeaderboardMessage(message) {
  const json = JSON.stringify(message)
  const bytes = new Uint8Array(json.length)
  for (let index = 0; index < json.length; index += 1) {
    bytes[index] = json.charCodeAt(index) & 0xff
  }
  return bytes.buffer
}

export function decodeLeaderboardMessage(payload) {
  if (!payload) {
    return null
  }

  if (typeof Buffer !== 'undefined') {
    return safeParse(Buffer.from(payload).toString('utf-8'), null)
  }

  const bytes = payload instanceof Uint8Array ? payload : new Uint8Array(payload)
  let json = ''
  for (let index = 0; index < bytes.length; index += 1) {
    json += String.fromCharCode(bytes[index])
  }
  return safeParse(json, null)
}

export function buildSubmitMessage(submission) {
  return {
    type: LEADERBOARD_MESSAGE_TYPES.SUBMIT_SCORE,
    submission,
  }
}

export function buildFlushMessage() {
  return {
    type: LEADERBOARD_MESSAGE_TYPES.FLUSH_QUEUE,
  }
}
