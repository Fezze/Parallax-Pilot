import { LEADERBOARD_STORAGE_KEYS } from './leaderboard-config.js'

const DEFAULT_PLAYER_ID = 'demo-player'
const DEFAULT_PLAYER_NICKNAME = 'Pilot'
const PLAYER_ID_PREFIX = 'pilot-'

function normalizeValue(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function sanitizePlayerId(value) {
  const normalized = normalizeValue(value).toLowerCase()
  if (!normalized || !/^[a-z0-9-]{6,64}$/.test(normalized)) {
    return ''
  }

  return normalized
}

function sanitizeNickname(value) {
  const normalized = normalizeValue(value).replace(/\s+/g, ' ')
  if (!normalized) {
    return ''
  }

  return normalized.slice(0, 24)
}

function hashSeed(seed) {
  let hash = 2166136261
  const input = String(seed || 'parallax-pilot')

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function isLegacyLeaderboardIdentity(playerId, nickname) {
  const normalizedPlayerId = normalizeValue(playerId)
  const normalizedNickname = normalizeValue(nickname)

  return (
    normalizedPlayerId === DEFAULT_PLAYER_ID ||
    (!normalizedPlayerId && normalizedNickname === DEFAULT_PLAYER_NICKNAME)
  )
}

export function buildAnonymousLeaderboardIdentity(seed = `${Date.now()}-${Math.random()}`) {
  const suffix = hashSeed(seed)
  return {
    playerId: `${PLAYER_ID_PREFIX}${suffix}`,
    nickname: `Pilot ${suffix.slice(-4).toUpperCase()}`,
  }
}

export function readLeaderboardIdentity(storage) {
  const rawPlayerId = storage.getItem(LEADERBOARD_STORAGE_KEYS.PLAYER_ID)
  const rawNickname = storage.getItem(LEADERBOARD_STORAGE_KEYS.PLAYER_NICKNAME)

  if (isLegacyLeaderboardIdentity(rawPlayerId, rawNickname)) {
    return null
  }

  const playerId = sanitizePlayerId(rawPlayerId)
  if (!playerId) {
    return null
  }

  const nickname = sanitizeNickname(rawNickname) || buildAnonymousLeaderboardIdentity(playerId).nickname
  return { playerId, nickname }
}

export function writeLeaderboardIdentity(storage, identity) {
  const playerId = sanitizePlayerId(identity?.playerId)
  const nickname = sanitizeNickname(identity?.nickname)

  if (!playerId) {
    throw new Error('Invalid leaderboard identity')
  }

  storage.setItem(LEADERBOARD_STORAGE_KEYS.PLAYER_ID, playerId)
  storage.setItem(
    LEADERBOARD_STORAGE_KEYS.PLAYER_NICKNAME,
    nickname || buildAnonymousLeaderboardIdentity(playerId).nickname
  )

  return readLeaderboardIdentity(storage)
}

export function ensureLeaderboardIdentity(storage, options = {}) {
  if (!options.forceNew) {
    const existing = readLeaderboardIdentity(storage)
    if (existing) {
      return existing
    }
  }

  if (options.preferredIdentity) {
    return writeLeaderboardIdentity(storage, options.preferredIdentity)
  }

  return writeLeaderboardIdentity(
    storage,
    buildAnonymousLeaderboardIdentity(options.seed)
  )
}