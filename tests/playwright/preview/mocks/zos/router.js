import { recordRouterCall } from './state.js'

export function push(payload) {
  recordRouterCall('push', payload)
}

export function replace(payload) {
  recordRouterCall('replace', payload)
}

export function back(payload) {
  recordRouterCall('back', payload)
}
