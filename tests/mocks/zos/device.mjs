export const SCREEN_SHAPE_ROUND = 'round'

const defaultDeviceInfo = {
  width: 480,
  height: 480,
  screenShape: SCREEN_SHAPE_ROUND,
  keyType: 'normal_21',
  keyNumber: 2,
}

let deviceInfo = { ...defaultDeviceInfo }

export function getDeviceInfo() {
  return { ...deviceInfo }
}

export function __setDeviceInfo(nextInfo = {}) {
  deviceInfo = {
    ...deviceInfo,
    ...nextInfo,
  }
}

export function __resetDeviceInfo() {
  deviceInfo = { ...defaultDeviceInfo }
}
