import {
  buildFlushMessage,
  buildIdentityRequestMessage,
  buildSubmitMessage,
  decodeLeaderboardMessage,
  encodeLeaderboardMessage,
  LEADERBOARD_MESSAGE_TYPES,
} from './leaderboard-submit.js'
import {
  loadLeaderboardIdentity,
  loadLeaderboardSubmitQueue,
  removeLeaderboardSubmission,
  saveLeaderboardIdentity,
} from './storage.js'

function sendJson(ble, message) {
  const payload = encodeLeaderboardMessage(message)
  ble.send(payload, payload.byteLength)
}

export function createLeaderboardDeviceBridge(ble) {
  const connected = () => {
    try {
      return ble.connectStatus()
    } catch (_error) {
      return false
    }
  }

  const flush = () => {
    if (!connected()) {
      return false
    }

    if (!loadLeaderboardIdentity()) {
      sendJson(ble, buildIdentityRequestMessage())
    }

    const queue = loadLeaderboardSubmitQueue()
    for (let index = 0; index < queue.length; index += 1) {
      sendJson(ble, buildSubmitMessage(queue[index]))
    }
    sendJson(ble, buildFlushMessage())
    return true
  }

  const onMessage = (_index, data) => {
    const message = decodeLeaderboardMessage(data)
    if (message?.type === LEADERBOARD_MESSAGE_TYPES.SYNC_IDENTITY && message.identity) {
      saveLeaderboardIdentity(message.identity)
      return
    }

    if (message?.type !== LEADERBOARD_MESSAGE_TYPES.SUBMIT_ACK) {
      return
    }

    if (message.submissionId) {
      removeLeaderboardSubmission(message.submissionId)
    }
  }

  return {
    connect() {
      try {
        ble.createConnect(onMessage)
        ble.addListener?.((status) => {
          if (status) {
            sendJson(ble, buildIdentityRequestMessage())
            flush()
          }
        })
        sendJson(ble, buildIdentityRequestMessage())
        flush()
      } catch (_error) {}
    },
    disconnect() {
      try {
        ble.disConnect()
      } catch (_error) {}
      try {
        ble.removeListener?.()
      } catch (_error) {}
    },
    flush,
  }
}
