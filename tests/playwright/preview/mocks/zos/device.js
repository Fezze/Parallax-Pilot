import { getDeviceInfoState } from './state.js'

export const SCREEN_SHAPE_ROUND = 'round'

export function getDeviceInfo() {
  return getDeviceInfoState()
}
