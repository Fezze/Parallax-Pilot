import { CONTROL_MODES } from './constants.js'

export function supportsDigitalCrown(deviceInfo = {}) {
  if (typeof deviceInfo.keyType !== 'string') {
    return false
  }

  const [, suffix = ''] = deviceInfo.keyType.split('_')
  return suffix.endsWith('1')
}

export function resolveTravelDirection(wristSide) {
  return wristSide === 'right' ? 'left' : 'right'
}

export function sanitizeControlMode(controlMode, crownSupported) {
  if (!CONTROL_MODES.includes(controlMode)) {
    return 'tilt'
  }

  if (controlMode === 'crown' && !crownSupported) {
    return 'tilt'
  }

  return controlMode
}
