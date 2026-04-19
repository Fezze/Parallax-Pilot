import test from 'node:test'
import assert from 'node:assert/strict'

import { decodeLeaderboardMessage, LEADERBOARD_MESSAGE_TYPES } from '../zepp-app/shared/leaderboard-submit.js'
import { __getBleState, __resetBle } from './mocks/zos/ble.mjs'
import { __resetStorage } from './mocks/zos/storage.mjs'

async function loadAppDefinition() {
  globalThis.__zeppAppDefinition = null
  await import(new URL(`../zepp-app/app.js?test=${Date.now()}-${Math.random()}`, import.meta.url))
  return globalThis.__zeppAppDefinition
}

test('root app creates leaderboard bridge and connects on startup', async () => {
  __resetBle()
  __resetStorage()

  const app = await loadAppDefinition()
  const runtime = {
    globalData: {
      leaderboardBridge: null,
    },
  }

  app.onCreate.call(runtime)

  const bleState = __getBleState()
  assert.ok(runtime.globalData.leaderboardBridge)
  assert.equal(typeof runtime.globalData.leaderboardBridge.flush, 'function')
  assert.ok(bleState.messageHandler)
  assert.ok(bleState.statusListener)
  assert.deepEqual(
    bleState.sentPayloads.map((entry) => decodeLeaderboardMessage(entry.payload).type),
    [
      LEADERBOARD_MESSAGE_TYPES.REQUEST_IDENTITY,
      LEADERBOARD_MESSAGE_TYPES.REQUEST_IDENTITY,
      LEADERBOARD_MESSAGE_TYPES.FLUSH_QUEUE,
    ]
  )
})

test('root app disconnects leaderboard bridge on destroy', async () => {
  __resetBle()
  __resetStorage()

  const app = await loadAppDefinition()
  const runtime = {
    globalData: {
      leaderboardBridge: null,
    },
  }

  app.onCreate.call(runtime)
  app.onDestroy.call(runtime)

  const bleState = __getBleState()
  assert.equal(bleState.connectStatusValue, false)
  assert.equal(bleState.statusListener, null)
})