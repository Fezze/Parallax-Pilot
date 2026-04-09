import { fetch } from '@zos/fetch'
import { settings } from '@zos/settings'
import {
  LEADERBOARD_SCOPES,
  LEADERBOARD_STORAGE_KEYS,
  DEFAULT_LEADERBOARD_API_BASE_URL,
} from '../shared/leaderboard-config.js'

const REFRESH_COMMAND = 'refresh'

function readValue(storage, key, fallback = null) {
  return storage.getItem(key) ?? fallback
}

function writeJson(storage, key, value) {
  storage.setItem(key, JSON.stringify(value))
}

function readLeaderboardState(storage) {
  return {
    apiBaseUrl:
      readValue(storage, LEADERBOARD_STORAGE_KEYS.API_BASE_URL, DEFAULT_LEADERBOARD_API_BASE_URL) ||
      DEFAULT_LEADERBOARD_API_BASE_URL,
    playerId: readValue(storage, LEADERBOARD_STORAGE_KEYS.PLAYER_ID, 'demo-player'),
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch({
    url,
    method: options.method || 'GET',
    headers: options.headers || {
      'content-type': 'application/json',
    },
    body: options.body,
  })

  const body = typeof response.body === 'string' ? response.body : ''
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`HTTP ${response.status}: ${body}`)
  }

  return body ? JSON.parse(body) : null
}

async function refreshLeaderboards(storage) {
  const { apiBaseUrl, playerId } = readLeaderboardState(storage)
  const trimmedBaseUrl = String(apiBaseUrl || DEFAULT_LEADERBOARD_API_BASE_URL).replace(/\/+$/, '')

  const [globalLeaderboard, dailyLeaderboard, seasonalLeaderboard, playerBest, classification] =
    await Promise.all([
      fetchJson(`${trimmedBaseUrl}/v1/leaderboards/global?limit=10`),
      fetchJson(`${trimmedBaseUrl}/v1/leaderboards/daily?limit=10`),
      fetchJson(`${trimmedBaseUrl}/v1/leaderboards/seasonal?limit=10`),
      fetchJson(`${trimmedBaseUrl}/v1/players/${encodeURIComponent(playerId)}/best`),
      fetchJson(`${trimmedBaseUrl}/v1/rankings/classify?playerId=${encodeURIComponent(playerId)}`),
    ])

  writeJson(storage, LEADERBOARD_STORAGE_KEYS.LEADERBOARD_GLOBAL, globalLeaderboard)
  writeJson(storage, LEADERBOARD_STORAGE_KEYS.LEADERBOARD_DAILY, dailyLeaderboard)
  writeJson(storage, LEADERBOARD_STORAGE_KEYS.LEADERBOARD_SEASONAL, seasonalLeaderboard)
  writeJson(storage, LEADERBOARD_STORAGE_KEYS.PLAYER_BEST, playerBest)
  writeJson(storage, LEADERBOARD_STORAGE_KEYS.PLAYER_CLASSIFICATION, classification)
  storage.setItem(LEADERBOARD_STORAGE_KEYS.LAST_SYNC_AT, new Date().toISOString())
  storage.removeItem(LEADERBOARD_STORAGE_KEYS.LAST_SYNC_ERROR)
}

function installCommandListener(storage) {
  settings.settingsStorage.addListener('change', async ({ key, newValue }) => {
    if (key !== LEADERBOARD_STORAGE_KEYS.COMMAND || newValue !== REFRESH_COMMAND) {
      return
    }

    try {
      await refreshLeaderboards(storage)
    } catch (error) {
      storage.setItem(
        LEADERBOARD_STORAGE_KEYS.LAST_SYNC_ERROR,
        error instanceof Error ? error.message : String(error)
      )
    } finally {
      storage.removeItem(LEADERBOARD_STORAGE_KEYS.COMMAND)
    }
  })
}

AppSideService({
  onInit() {
    const storage = settings.settingsStorage
    if (!readValue(storage, LEADERBOARD_STORAGE_KEYS.API_BASE_URL)) {
      storage.setItem(
        LEADERBOARD_STORAGE_KEYS.API_BASE_URL,
        DEFAULT_LEADERBOARD_API_BASE_URL
      )
    }

    for (const [key, value] of [
      [LEADERBOARD_STORAGE_KEYS.PLAYER_ID, 'demo-player'],
      [LEADERBOARD_STORAGE_KEYS.PLAYER_NICKNAME, 'Pilot'],
      [LEADERBOARD_STORAGE_KEYS.ACTIVE_SCOPE, LEADERBOARD_SCOPES[0]],
    ]) {
      if (!readValue(storage, key)) {
        storage.setItem(key, value)
      }
    }

    installCommandListener(storage)
  },
})
