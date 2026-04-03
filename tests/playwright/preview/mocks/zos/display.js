let lastBrightTime = null

export function setPageBrightTime({ brightTime } = {}) {
  lastBrightTime = brightTime ?? null
}

export function resetPageBrightTime() {
  lastBrightTime = null
}

export function getLastBrightTime() {
  return lastBrightTime
}
