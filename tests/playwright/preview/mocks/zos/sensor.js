export const FREQ_MODE_NORMAL = 'FREQ_MODE_NORMAL'
export const VIBRATOR_SCENE_SHORT_MIDDLE = 'VIBRATOR_SCENE_SHORT_MIDDLE'

export class Accelerometer {
  setFreqMode(_mode) {}
  start() {}
  stop() {}
  getCurrent() {
    return { y: 0 }
  }
}

export class Vibrator {
  start(_payload) {}
}
