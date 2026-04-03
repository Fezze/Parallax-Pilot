export const KEY_DOWN = 'KEY_DOWN'
export const KEY_EVENT_CLICK = 'KEY_EVENT_CLICK'
export const KEY_EVENT_DOUBLE_CLICK = 'KEY_EVENT_DOUBLE_CLICK'
export const KEY_EVENT_LONG_PRESS = 'KEY_EVENT_LONG_PRESS'
export const KEY_EVENT_PRESS = 'KEY_EVENT_PRESS'
export const KEY_EVENT_RELEASE = 'KEY_EVENT_RELEASE'
export const KEY_HOME = 'KEY_HOME'
export const KEY_SHORTCUT = 'KEY_SHORTCUT'

let crownCallback = null
let gestureCallback = null
let keyCallback = null

export function onDigitalCrown({ callback }) {
  crownCallback = callback
}

export function offDigitalCrown() {
  crownCallback = null
}

export function onGesture({ callback }) {
  gestureCallback = callback
}

export function offGesture() {
  gestureCallback = null
}

export function onKey({ callback }) {
  keyCallback = callback
}

export function offKey() {
  keyCallback = null
}

export function __emitDigitalCrown(key, degree) {
  return crownCallback?.(key, degree)
}

export function __emitGesture(...args) {
  return gestureCallback?.(...args)
}

export function __emitKey(key, keyEvent) {
  return keyCallback?.(key, keyEvent)
}

export function __resetInteraction() {
  crownCallback = null
  gestureCallback = null
  keyCallback = null
}
