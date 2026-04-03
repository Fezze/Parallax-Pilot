export const FREQ_MODE_NORMAL = 'FREQ_MODE_NORMAL'
export const VIBRATOR_SCENE_SHORT_MIDDLE = 'VIBRATOR_SCENE_SHORT_MIDDLE'

const accelerometers = []
const vibrators = []

export class Accelerometer {
  constructor() {
    this.current = { y: 0 }
    this.started = false
    this.freqMode = null
    accelerometers.push(this)
  }

  setFreqMode(mode) {
    this.freqMode = mode
  }

  start() {
    this.started = true
  }

  stop() {
    this.started = false
  }

  getCurrent() {
    return this.current
  }
}

export class Vibrator {
  constructor() {
    this.calls = []
    vibrators.push(this)
  }

  start(payload) {
    this.calls.push(payload)
  }
}

export function __getAccelerometers() {
  return [...accelerometers]
}

export function __getVibrators() {
  return [...vibrators]
}

export function __resetSensors() {
  accelerometers.length = 0
  vibrators.length = 0
}
