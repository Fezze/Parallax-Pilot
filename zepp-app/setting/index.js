import {
  DEFAULT_LEADERBOARD_API_BASE_URL,
  DEFAULT_LEADERBOARD_SCOPE,
  LEADERBOARD_SCOPES,
  LEADERBOARD_STORAGE_KEYS,
} from '../shared/leaderboard-config.js'
import { ensureLeaderboardIdentity } from '../shared/leaderboard-identity.js'

const STRINGS = {
  'en-US': {
    title: 'Leaderboard',
    subtitle: 'Phone-only ranking inside Zepp',
    refresh: 'Refresh leaderboard',
    lastSync: 'Last sync',
    lastSyncNever: 'Not synced yet',
    player: 'Player',
    alias: 'Alias',
    playerId: 'ID',
    anonymousHint: 'Anonymous profile synced to the watch',
    rotateIdentity: 'New alias',
    best: 'Best',
    rank: 'Rank',
    exact: 'Exact',
    approx: 'Approx',
    apiBaseUrl: 'API URL',
    global: 'Global',
    daily: 'Daily',
    seasonal: 'Seasonal',
    noData: 'No leaderboard data yet',
    error: 'Sync error',
  },
  'pl-PL': {
    title: 'Leaderboard',
    subtitle: 'Ranking telefonu w aplikacji Zepp',
    refresh: 'Odswiez leaderboard',
    lastSync: 'Ostatnia synchronizacja',
    lastSyncNever: 'Brak synchronizacji',
    player: 'Gracz',
    alias: 'Alias',
    playerId: 'ID',
    anonymousHint: 'Anonimowy profil synchronizowany z zegarkiem',
    rotateIdentity: 'Nowy alias',
    best: 'Best',
    rank: 'Pozycja',
    exact: 'Dokladna',
    approx: 'Przyblizona',
    apiBaseUrl: 'API URL',
    global: 'Global',
    daily: 'Dzienny',
    seasonal: 'Sezonowy',
    noData: 'Brak danych leaderboardu',
    error: 'Blad synchronizacji',
  },
}

function detectLocale() {
  const language =
    globalThis.__PREVIEW_LOCALE ||
    globalThis.hmSetting?.getLanguage?.() ||
    globalThis.navigator?.language ||
    'en-US'
  return String(language).startsWith('pl') ? 'pl-PL' : 'en-US'
}

function t(locale, key) {
  return STRINGS[locale]?.[key] || STRINGS['en-US'][key] || key
}

function safeParse(rawValue, fallback) {
  if (!rawValue) {
    return fallback
  }

  try {
    return JSON.parse(rawValue)
  } catch (_error) {
    return fallback
  }
}

function readLeaderboard(storage, scope) {
  const storageKey = {
    global: LEADERBOARD_STORAGE_KEYS.LEADERBOARD_GLOBAL,
    daily: LEADERBOARD_STORAGE_KEYS.LEADERBOARD_DAILY,
    seasonal: LEADERBOARD_STORAGE_KEYS.LEADERBOARD_SEASONAL,
  }[scope]

  return safeParse(storage.getItem(storageKey), null)
}

function formatLastSync(storage, locale) {
  const value = storage.getItem(LEADERBOARD_STORAGE_KEYS.LAST_SYNC_AT)
  if (!value) {
    return t(locale, 'lastSyncNever')
  }

  return value
}

function renderEntry(entry, index) {
  return Text({
    paragraph: true,
    style: {
      fontSize: '13px',
      color: '#f4f4f4',
      marginTop: '6px',
      fontFamily: 'Menlo, monospace',
    },
    text: `${String(index + 1).padStart(2, '0')}  ${entry.nickname || entry.playerId}  ${entry.score}`,
  })
}

function resetIdentity(storage) {
  ensureLeaderboardIdentity(storage, {
    forceNew: true,
    seed: `phone-reset-${Date.now()}`,
  })
  storage.removeItem?.(LEADERBOARD_STORAGE_KEYS.PLAYER_BEST)
  storage.removeItem?.(LEADERBOARD_STORAGE_KEYS.PLAYER_CLASSIFICATION)
  storage.removeItem?.(LEADERBOARD_STORAGE_KEYS.LAST_SYNC_ERROR)
  storage.setItem(LEADERBOARD_STORAGE_KEYS.COMMAND, 'refresh')
}

AppSettingsPage({
  build(props) {
    const locale = detectLocale()
    const storage = props.settingsStorage
    const identity = ensureLeaderboardIdentity(storage, { seed: 'phone-settings' })
    const scope = storage.getItem(LEADERBOARD_STORAGE_KEYS.ACTIVE_SCOPE) || DEFAULT_LEADERBOARD_SCOPE
    const leaderboard = readLeaderboard(storage, scope)
    const playerBest = safeParse(storage.getItem(LEADERBOARD_STORAGE_KEYS.PLAYER_BEST), null)
    const classification = safeParse(storage.getItem(LEADERBOARD_STORAGE_KEYS.PLAYER_CLASSIFICATION), null)
    const lastSyncError = storage.getItem(LEADERBOARD_STORAGE_KEYS.LAST_SYNC_ERROR)
    const apiBaseUrl = storage.getItem(LEADERBOARD_STORAGE_KEYS.API_BASE_URL) || DEFAULT_LEADERBOARD_API_BASE_URL

    const entries = Array.isArray(leaderboard?.entries) ? leaderboard.entries : []
    const rankText = classification?.exactRank
      ? `${classification.exactRank} (${t(locale, 'exact')})`
      : classification?.approximateBand
        ? `${classification.approximateBand} (${t(locale, 'approx')})`
        : '-'

    return Section({ style: { padding: '20px 16px 32px', background: '#0b0d11', color: '#ffffff', minHeight: '100%', fontFamily: 'ui-sans-serif, system-ui, sans-serif' } }, [
      Text({ text: t(locale, 'title'), style: { fontSize: '24px', fontWeight: '700', color: '#ffd400' } }),
      Text({ text: t(locale, 'subtitle'), style: { fontSize: '13px', color: '#b4bac5', marginTop: '6px', marginBottom: '18px' } }),
      Button({
        label: t(locale, 'refresh'),
        style: { fontSize: '14px', borderRadius: '14px', background: '#ffd400', color: '#111111', padding: '12px 14px', marginBottom: '14px' },
        onClick: () => props.settingsStorage.setItem(LEADERBOARD_STORAGE_KEYS.COMMAND, 'refresh'),
      }),
      Text({ text: `${t(locale, 'lastSync')}: ${formatLastSync(storage, locale)}`, style: { fontSize: '12px', color: '#8d94a1', marginBottom: '8px' } }),
      Text({ text: `${t(locale, 'apiBaseUrl')}: ${apiBaseUrl}`, style: { fontSize: '12px', color: '#8d94a1', marginBottom: '18px' } }),
      ...(lastSyncError ? [Text({ text: `${t(locale, 'error')}: ${lastSyncError}`, style: { fontSize: '12px', color: '#ff8686', marginBottom: '14px' } })] : []),
      Section(
        { style: { display: 'flex', gap: '8px', marginBottom: '18px' } },
        LEADERBOARD_SCOPES.map((candidateScope) =>
          Button({
            label: t(locale, candidateScope),
            style: { fontSize: '13px', borderRadius: '999px', background: candidateScope === scope ? '#1d2430' : '#12161d', color: candidateScope === scope ? '#ffd400' : '#d6dae2', padding: '10px 12px' },
            onClick: () => props.settingsStorage.setItem(LEADERBOARD_STORAGE_KEYS.ACTIVE_SCOPE, candidateScope),
          })
        )
      ),
      Text({ text: `${t(locale, 'alias')}: ${identity.nickname}`, style: { fontSize: '14px', color: '#ffffff', marginBottom: '6px' } }),
      Text({ text: `${t(locale, 'playerId')}: ${identity.playerId}`, style: { fontSize: '12px', color: '#8d94a1', marginBottom: '6px' } }),
      Text({ text: t(locale, 'anonymousHint'), style: { fontSize: '12px', color: '#8d94a1', marginBottom: '12px' } }),
      Button({
        label: t(locale, 'rotateIdentity'),
        style: { fontSize: '13px', borderRadius: '12px', background: '#12161d', color: '#d6dae2', padding: '10px 12px', marginBottom: '18px' },
        onClick: () => resetIdentity(props.settingsStorage),
      }),
      Text({ text: `${t(locale, 'player')}: ${identity.nickname}`, style: { fontSize: '14px', color: '#ffffff', marginBottom: '6px' } }),
      Text({ text: `${t(locale, 'best')}: ${playerBest?.bestScores?.[scope]?.score ?? '-'}`, style: { fontSize: '14px', color: '#ffffff', marginBottom: '6px' } }),
      Text({ text: `${t(locale, 'rank')}: ${rankText}`, style: { fontSize: '14px', color: '#ffffff', marginBottom: '18px' } }),
      ...(entries.length > 0 ? entries.map((entry, index) => renderEntry(entry, index)) : [Text({ text: t(locale, 'noData'), style: { fontSize: '14px', color: '#b4bac5' } })]),
    ])
  },
})
