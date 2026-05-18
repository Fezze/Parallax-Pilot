let connectStatusValue = true
let sentPayloads = []
let messageHandler = null
let statusListener = null

export function connectStatus() {
  return connectStatusValue
}

export function send(payload, byteLength) {
  sentPayloads.push({ payload, byteLength })
}

export function createConnect(handler) {
  messageHandler = handler
}

export function addListener(listener) {
  statusListener = listener
}

export function removeListener() {
  statusListener = null
}

export function disConnect() {
  connectStatusValue = false
}

export function __resetBle() {
  connectStatusValue = true
  sentPayloads = []
  messageHandler = null
  statusListener = null
}

export function __getBleState() {
  return {
    connectStatusValue,
    sentPayloads: sentPayloads.slice(),
    messageHandler,
    statusListener,
  }
}

export function __setBleConnected(value) {
  connectStatusValue = value
}