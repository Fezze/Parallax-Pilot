import {
  CONTROL_MODE_LABELS,
  CONTROL_MODES,
  RESULTS_PAGE_SIZE,
  WRIST_SIDE_LABELS,
} from './constants.js'

export function getAvailableControlModes(crownSupported) {
  return CONTROL_MODES
}

export function cycleOption(options, currentValue) {
  const currentIndex = Math.max(options.indexOf(currentValue), 0)
  return options[(currentIndex + 1) % options.length]
}

export function paginateScores(scores, pageIndex = 0, pageSize = RESULTS_PAGE_SIZE) {
  const safeScores = Array.isArray(scores) ? scores : []
  const pageCount = Math.max(1, Math.ceil(safeScores.length / pageSize))
  const clampedPageIndex = Math.min(Math.max(pageIndex, 0), pageCount - 1)
  const start = clampedPageIndex * pageSize
  const items = safeScores.slice(start, start + pageSize)

  return {
    pageCount,
    pageIndex: clampedPageIndex,
    items,
  }
}

export function formatDurationMs(durationMs) {
  const seconds = durationMs / 1000
  if (seconds >= 100) {
    return `${seconds.toFixed(0)}s`
  }

  if (seconds >= 10) {
    return `${seconds.toFixed(1)}s`
  }

  return `${seconds.toFixed(2)}s`
}

export function formatSettingValue(key, value) {
  switch (key) {
    case 'controlMode':
      return CONTROL_MODE_LABELS[value]
    case 'wristSide':
      return WRIST_SIDE_LABELS[value]
    case 'timeScale':
    case 'spawnMultiplier':
    case 'tiltSensitivity':
      return `${value}x`
    default:
      return String(value)
  }
}

export function buildScoreRow(entry, index) {
  return `${String(index + 1).padStart(2, '0')}  ${entry.score}  ${formatDurationMs(entry.survivedMs)}`
}
