let nextTimerId = 1

export function createSysTimer(_repeat, _delay, callback) {
  const timerId = nextTimerId
  nextTimerId += 1
  callback?.()
  return timerId
}

export function stopTimer(_timerId) {}
