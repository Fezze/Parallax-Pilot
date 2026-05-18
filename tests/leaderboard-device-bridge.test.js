import test from 'node:test'
import assert from 'node:assert/strict'

import { __readLocalStorage, __resetStorage, __seedLocalStorage } from './mocks/zos/storage.mjs'
import { LEADERBOARD_STORAGE_KEYS } from '../zepp-app/shared/leaderboard-config.js'
import {
  decodeLeaderboardMessage,
  encodeLeaderboardMessage,
  LEADERBOARD_MESSAGE_TYPES,
} from '../zepp-app/shared/leaderboard-submit.js'
import { createLeaderboardDeviceBridge } from '../zepp-app/shared/leaderboard-device-bridge.js'

function createBleMock({ connected = true } = {}) {
  let connectedState = connected

  return {
    sent: [],
    messageHandler: null,
    statusListener: null,
    connectStatus() {
      return connectedState
    },
    send(payload, byteLength) {
      this.sent.push({
        byteLength,
        message: decodeLeaderboardMessage(payload),
      })
    },
    createConnect(handler) {
      this.messageHandler = handler
    },
    addListener(listener) {
      this.statusListener = listener
    },
    removeListener() {
      this.statusListener = null
    },
    disConnect() {
      connectedState = false
    },
    emitStatus(status) {
      connectedState = status
      this.statusListener?.(status)
    },
    emitMessage(message) {
      this.messageHandler?.(0, encodeLeaderboardMessage(message))
    },
  }
}

test('leaderboard bridge flush requests identity, submits queued scores and emits flush', () => {
  __resetStorage()
  __seedLocalStorage({
    [LEADERBOARD_STORAGE_KEYS.SUBMIT_QUEUE]: JSON.stringify([
      {
        submissionId: 'sub-watch-1',
        playerId: 'pilot-queue-1',
        nickname: 'Pilot Q001',
        score: 1234,
        survivedMs: 15000,
        playedAt: '2026-04-19T12:00:00Z',
        clientVersion: '2.4.5',
        deviceModel: 'balance-2',
      },
    ]),
  })
  const ble = createBleMock()
  const bridge = createLeaderboardDeviceBridge(ble)

  const flushed = bridge.flush()

  assert.equal(flushed, true)
  assert.deepEqual(
    ble.sent.map((entry) => entry.message.type),
    [
      LEADERBOARD_MESSAGE_TYPES.REQUEST_IDENTITY,
      LEADERBOARD_MESSAGE_TYPES.SUBMIT_SCORE,
      LEADERBOARD_MESSAGE_TYPES.FLUSH_QUEUE,
    ]
  )
  assert.equal(ble.sent[1].message.submission.submissionId, 'sub-watch-1')
})

test('leaderboard bridge connect registers callbacks and persists synced identity', () => {
  __resetStorage()
  const ble = createBleMock()
  const bridge = createLeaderboardDeviceBridge(ble)

  bridge.connect()

  assert.ok(ble.messageHandler)
  assert.ok(ble.statusListener)
  assert.deepEqual(
    ble.sent.map((entry) => entry.message.type),
    [
      LEADERBOARD_MESSAGE_TYPES.REQUEST_IDENTITY,
      LEADERBOARD_MESSAGE_TYPES.REQUEST_IDENTITY,
      LEADERBOARD_MESSAGE_TYPES.FLUSH_QUEUE,
    ]
  )

  ble.emitMessage({
    type: LEADERBOARD_MESSAGE_TYPES.SYNC_IDENTITY,
    identity: {
      playerId: 'pilot-sync-1',
      nickname: 'Pilot SY01',
    },
  })

  assert.equal(__readLocalStorage(LEADERBOARD_STORAGE_KEYS.PLAYER_ID), 'pilot-sync-1')
  assert.equal(__readLocalStorage(LEADERBOARD_STORAGE_KEYS.PLAYER_NICKNAME), 'Pilot SY01')

  ble.sent.length = 0
  ble.emitStatus(true)
  assert.deepEqual(
    ble.sent.map((entry) => entry.message.type),
    [
      LEADERBOARD_MESSAGE_TYPES.REQUEST_IDENTITY,
      LEADERBOARD_MESSAGE_TYPES.FLUSH_QUEUE,
    ]
  )
})

test('leaderboard bridge removes acknowledged submissions and disconnects cleanly', () => {
  __resetStorage()
  __seedLocalStorage({
    [LEADERBOARD_STORAGE_KEYS.PLAYER_ID]: 'pilot-existing-1',
    [LEADERBOARD_STORAGE_KEYS.PLAYER_NICKNAME]: 'Pilot E001',
    [LEADERBOARD_STORAGE_KEYS.SUBMIT_QUEUE]: JSON.stringify([
      {
        submissionId: 'sub-ack-1',
        playerId: 'pilot-existing-1',
        nickname: 'Pilot E001',
        score: 900,
        survivedMs: 11000,
        playedAt: '2026-04-19T12:10:00Z',
        clientVersion: '2.4.5',
        deviceModel: 'balance-2',
      },
    ]),
  })
  const ble = createBleMock()
  const bridge = createLeaderboardDeviceBridge(ble)

  bridge.connect()
  ble.emitMessage({
    type: LEADERBOARD_MESSAGE_TYPES.SUBMIT_ACK,
    submissionId: 'sub-ack-1',
    accepted: true,
  })

  assert.equal(__readLocalStorage(LEADERBOARD_STORAGE_KEYS.SUBMIT_QUEUE), '[]')
  assert.equal(__readLocalStorage(LEADERBOARD_STORAGE_KEYS.SUBMIT_QUEUE_SIZE), '0')

  bridge.disconnect()
  assert.equal(ble.statusListener, null)
  assert.equal(ble.connectStatus(), false)
})

test('leaderboard bridge flush is a no-op when BLE is disconnected', () => {
  __resetStorage()
  const ble = createBleMock({ connected: false })
  const bridge = createLeaderboardDeviceBridge(ble)

  const flushed = bridge.flush()

  assert.equal(flushed, false)
  assert.deepEqual(ble.sent, [])
})