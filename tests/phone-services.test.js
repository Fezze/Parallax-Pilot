import test from 'node:test'
import assert from 'node:assert/strict'

import { __getFetchRequests, __queueFetchResponse, __resetFetch } from './mocks/zos/fetch.mjs'
import {
  __emitSettingsChange,
  __resetLanguage,
  __resetSettingsStorage,
  settings,
} from './mocks/zos/settings.mjs'
import {
  DEFAULT_LEADERBOARD_API_BASE_URL,
  LEADERBOARD_STORAGE_KEYS,
} from '../zepp-app/shared/leaderboard-config.js'
import {
  decodeLeaderboardMessage,
  encodeLeaderboardMessage,
  LEADERBOARD_MESSAGE_TYPES,
} from '../zepp-app/shared/leaderboard-submit.js'

function resetPhoneHarness(seed = {}) {
  __resetLanguage()
  __resetSettingsStorage(seed)
  __resetFetch()
  globalThis.__PREVIEW_LOCALE = undefined
  globalThis.Section = (props = {}, children = []) => ({
    type: 'section',
    props,
    children: Array.isArray(children) ? children : [children],
  })
  globalThis.Text = (props = {}) => ({
    type: 'text',
    props,
    children: [],
  })
  globalThis.Button = (props = {}) => ({
    type: 'button',
    props,
    children: [],
  })

  const listeners = new Map()
  const sent = []
  globalThis.messaging = {
    peerSocket: {
      send(payload) {
        sent.push(payload)
      },
      addListener(eventName, listener) {
        listeners.set(eventName, listener)
      },
    },
  }

  return {
    sent,
    async emitPeerMessage(message) {
      const listener = listeners.get('message')
      if (listener) {
        await listener(encodeLeaderboardMessage(message))
      }
    },
  }
}

async function loadSettingsDefinition() {
  globalThis.__zeppAppSettingsDefinition = null
  await import(new URL(`../zepp-app/setting/index.js?test=${Date.now()}-${Math.random()}`, import.meta.url))
  return globalThis.__zeppAppSettingsDefinition
}

async function loadAppSideDefinition() {
  globalThis.__zeppAppSideServiceDefinition = null
  await import(new URL(`../zepp-app/app-side/index.js?test=${Date.now()}-${Math.random()}`, import.meta.url))
  return globalThis.__zeppAppSideServiceDefinition
}

function collectSettingsSnapshot(node) {
  const texts = []
  const buttons = []

  function visit(candidate) {
    if (!candidate) {
      return
    }

    if (Array.isArray(candidate)) {
      candidate.forEach(visit)
      return
    }

    if (candidate.type === 'text') {
      texts.push(candidate.props?.text || '')
      return
    }

    if (candidate.type === 'button') {
      buttons.push(candidate)
      texts.push(candidate.props?.label || '')
      return
    }

    if (candidate.children) {
      candidate.children.forEach(visit)
    }
  }

  visit(node)
  return { texts, buttons }
}

function decodeSentMessages(sent) {
  return sent.map((payload) => decodeLeaderboardMessage(payload))
}

test('settings app renders leaderboard identity state and rotates alias', async () => {
  resetPhoneHarness({
    [LEADERBOARD_STORAGE_KEYS.ACTIVE_SCOPE]: 'daily',
    [LEADERBOARD_STORAGE_KEYS.PLAYER_ID]: 'pilot-4fa21b7c',
    [LEADERBOARD_STORAGE_KEYS.PLAYER_NICKNAME]: 'Pilot 1B7C',
    [LEADERBOARD_STORAGE_KEYS.LAST_SYNC_AT]: '2026-04-19T12:00:00Z',
    [LEADERBOARD_STORAGE_KEYS.LAST_SYNC_ERROR]: 'timeout',
    [LEADERBOARD_STORAGE_KEYS.PLAYER_BEST]: JSON.stringify({
      bestScores: {
        daily: { score: 1420 },
      },
    }),
    [LEADERBOARD_STORAGE_KEYS.PLAYER_CLASSIFICATION]: JSON.stringify({
      approximateBand: 'top-10%',
    }),
    [LEADERBOARD_STORAGE_KEYS.LEADERBOARD_DAILY]: JSON.stringify({
      entries: [
        { playerId: 'pilot-1', nickname: 'Nova', score: 1820 },
      ],
    }),
  })
  globalThis.__PREVIEW_LOCALE = 'pl-PL'

  const settingsPage = await loadSettingsDefinition()
  const tree = settingsPage.build({ settingsStorage: settings.settingsStorage })
  const snapshot = collectSettingsSnapshot(tree)

  assert.ok(snapshot.texts.includes('Alias: Pilot 1B7C'))
  assert.ok(snapshot.texts.includes('ID: pilot-4fa21b7c'))
  assert.ok(snapshot.texts.includes('Nowy alias'))
  assert.ok(snapshot.texts.includes('Pozycja: top-10% (Przyblizona)'))
  assert.ok(snapshot.texts.includes('Blad synchronizacji: timeout'))
  assert.ok(snapshot.texts.includes('01  Nova  1820'))

  const rotateButton = snapshot.buttons.find((button) => button.props?.label === 'Nowy alias')
  rotateButton.props.onClick()

  assert.match(settings.settingsStorage.getItem(LEADERBOARD_STORAGE_KEYS.PLAYER_ID), /^pilot-[a-f0-9]{8}$/)
  assert.match(settings.settingsStorage.getItem(LEADERBOARD_STORAGE_KEYS.PLAYER_NICKNAME), /^Pilot [A-F0-9]{4}$/)
  assert.equal(settings.settingsStorage.getItem(LEADERBOARD_STORAGE_KEYS.COMMAND), 'refresh')
  assert.equal(settings.settingsStorage.getItem(LEADERBOARD_STORAGE_KEYS.PLAYER_BEST), null)
  assert.equal(settings.settingsStorage.getItem(LEADERBOARD_STORAGE_KEYS.LAST_SYNC_ERROR), null)
})

test('app side init seeds defaults and refresh command populates leaderboard caches', async () => {
  const harness = resetPhoneHarness()
  const service = await loadAppSideDefinition()

  __queueFetchResponse({ body: JSON.stringify({ entries: [{ playerId: 'pilot-a', score: 10 }] }) })
  __queueFetchResponse({ body: JSON.stringify({ entries: [{ playerId: 'pilot-b', score: 9 }] }) })
  __queueFetchResponse({ body: JSON.stringify({ entries: [{ playerId: 'pilot-c', score: 8 }] }) })
  __queueFetchResponse({ body: JSON.stringify({ playerId: 'pilot-seeded', bestScores: { global: { score: 10 } } }) })
  __queueFetchResponse({ body: JSON.stringify({ playerId: 'pilot-seeded', exactRank: 4 }) })

  service.onInit()

  assert.equal(settings.settingsStorage.getItem(LEADERBOARD_STORAGE_KEYS.API_BASE_URL), DEFAULT_LEADERBOARD_API_BASE_URL)
  assert.equal(settings.settingsStorage.getItem(LEADERBOARD_STORAGE_KEYS.ACTIVE_SCOPE), 'global')
  assert.match(settings.settingsStorage.getItem(LEADERBOARD_STORAGE_KEYS.PLAYER_ID), /^pilot-[a-f0-9]{8}$/)

  let sentMessages = decodeSentMessages(harness.sent)
  assert.equal(sentMessages[0].type, LEADERBOARD_MESSAGE_TYPES.SYNC_IDENTITY)
  assert.match(sentMessages[0].identity.playerId, /^pilot-[a-f0-9]{8}$/)

  await __emitSettingsChange(LEADERBOARD_STORAGE_KEYS.COMMAND, 'refresh')

  assert.ok(settings.settingsStorage.getItem(LEADERBOARD_STORAGE_KEYS.LEADERBOARD_GLOBAL))
  assert.ok(settings.settingsStorage.getItem(LEADERBOARD_STORAGE_KEYS.LEADERBOARD_DAILY))
  assert.ok(settings.settingsStorage.getItem(LEADERBOARD_STORAGE_KEYS.LEADERBOARD_SEASONAL))
  assert.ok(settings.settingsStorage.getItem(LEADERBOARD_STORAGE_KEYS.PLAYER_BEST))
  assert.ok(settings.settingsStorage.getItem(LEADERBOARD_STORAGE_KEYS.PLAYER_CLASSIFICATION))
  assert.ok(settings.settingsStorage.getItem(LEADERBOARD_STORAGE_KEYS.LAST_SYNC_AT))
  assert.equal(settings.settingsStorage.getItem(LEADERBOARD_STORAGE_KEYS.LAST_SYNC_ERROR), null)
  assert.equal(settings.settingsStorage.getItem(LEADERBOARD_STORAGE_KEYS.COMMAND), null)

  const requestUrls = __getFetchRequests().map((request) => request.url)
  assert.deepEqual(requestUrls, [
    `${DEFAULT_LEADERBOARD_API_BASE_URL}/v1/leaderboards/global?limit=10`,
    `${DEFAULT_LEADERBOARD_API_BASE_URL}/v1/leaderboards/daily?limit=10`,
    `${DEFAULT_LEADERBOARD_API_BASE_URL}/v1/leaderboards/seasonal?limit=10`,
    `${DEFAULT_LEADERBOARD_API_BASE_URL}/v1/players/${encodeURIComponent(sentMessages[0].identity.playerId)}/best`,
    `${DEFAULT_LEADERBOARD_API_BASE_URL}/v1/rankings/classify?playerId=${encodeURIComponent(sentMessages[0].identity.playerId)}`,
  ])
})

test('app side handles device submit messages with ack, identity sync and queue flush', async () => {
  const harness = resetPhoneHarness({
    [LEADERBOARD_STORAGE_KEYS.PLAYER_ID]: 'demo-player',
    [LEADERBOARD_STORAGE_KEYS.PLAYER_NICKNAME]: 'Pilot',
  })
  const service = await loadAppSideDefinition()

  __queueFetchResponse({ status: 200, body: JSON.stringify({ accepted: true }) })

  service.onInit()
  harness.sent.length = 0
  settings.settingsStorage.setItem(LEADERBOARD_STORAGE_KEYS.PLAYER_ID, 'demo-player')
  settings.settingsStorage.setItem(LEADERBOARD_STORAGE_KEYS.PLAYER_NICKNAME, 'Pilot')

  await harness.emitPeerMessage({
    type: LEADERBOARD_MESSAGE_TYPES.SUBMIT_SCORE,
    submission: {
      submissionId: 'sub-device-1',
      playerId: 'pilot-device-1',
      nickname: 'Pilot D001',
      score: 1200,
      survivedMs: 15000,
      playedAt: '2026-04-19T12:00:00Z',
      clientVersion: '2.4.5',
      deviceModel: 'balance-2',
    },
  })

  const sentMessages = decodeSentMessages(harness.sent)
  assert.equal(sentMessages[0].type, LEADERBOARD_MESSAGE_TYPES.SUBMIT_ACK)
  assert.equal(sentMessages[0].accepted, true)
  assert.equal(sentMessages[1].type, LEADERBOARD_MESSAGE_TYPES.SYNC_IDENTITY)
  assert.equal(sentMessages[1].identity.playerId, 'pilot-device-1')
  assert.equal(settings.settingsStorage.getItem(LEADERBOARD_STORAGE_KEYS.PLAYER_ID), 'pilot-device-1')
  assert.equal(settings.settingsStorage.getItem(LEADERBOARD_STORAGE_KEYS.PLAYER_NICKNAME), 'Pilot D001')
  assert.equal(settings.settingsStorage.getItem(LEADERBOARD_STORAGE_KEYS.SUBMIT_QUEUE), '[]')
  assert.ok(settings.settingsStorage.getItem(LEADERBOARD_STORAGE_KEYS.LAST_SUBMIT_AT))

  const requests = __getFetchRequests()
  assert.equal(requests.length, 1)
  assert.equal(requests[0].method, 'POST')
  assert.match(requests[0].url, /\/v1\/scores:submit$/)
})