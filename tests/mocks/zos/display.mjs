let lastBrightTime = null
let resetCount = 0

export function setPageBrightTime({ brightTime } = {}) {
  lastBrightTime = brightTime ?? null
}

export function resetPageBrightTime() {
  resetCount += 1
  lastBrightTime = null
}

export function __getLastBrightTime() {
  return lastBrightTime
}

export function __getResetCount() {
  return resetCount
}

export function __resetDisplay() {
  lastBrightTime = null
  resetCount = 0
}
