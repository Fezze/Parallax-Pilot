let nextTimerId = 1

export function createSysTimer(_repeat, delay, callback) {
  const timerId = nextTimerId
  nextTimerId += 1
  window.setTimeout(() => {
    callback?.()
  }, delay || 0)
  return timerId
}

export function stopTimer(_timerId) {}
