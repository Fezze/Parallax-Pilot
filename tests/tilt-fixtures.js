export function tiltProfile(wristSide = 'left') {
  return { version: 2, unit: 'cm/s^2', frame: 'wrist-y-positive-down', wristSide,
    offset: 20, deadzone: 2, negativeRange: 180, positiveRange: 100,
    responseExponent: 1, noisePeak: 0.5, timestamp: 1 }
}
