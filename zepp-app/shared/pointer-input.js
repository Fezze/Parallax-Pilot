import { MAX_SIMULATION_GAP_MS, SIMULATION_STEP_MS } from './simulation-clock.js'

const POINTER_BUCKET_COUNT = Math.ceil(MAX_SIMULATION_GAP_MS / SIMULATION_STEP_MS) + 1
export const MAX_POINTER_COMMANDS = 3 * POINTER_BUCKET_COUNT

export function createPointerCapture() {
  return { length: 0, down: false, y: null, downCount: 0, moveCount: 0, upCount: 0 }
}

export function recordPointerSample(capture, queue, clock, controlMode, halfHeight, kind, y, now = Date.now) {
  if (kind === 'move') {
    capture.moveCount += 1
    if (!capture.down || capture.y === y) return
  } else if (kind === 'down') {
    capture.downCount += 1
    capture.down = true
  } else {
    capture.upCount += 1
    capture.down = false
  }
  capture.y = kind === 'up' ? null : y
  capture.length += 1
  if (controlMode === 'tilt') return

  // The presentation callback owns the clock, which stays stable between frames.
  // Filter before compaction so a redundant touch move cannot replace a
  // crossing's timestamp during a long gap or a wall-clock rollback.
  if (kind === 'move' && controlMode === 'touch' &&
      (y < halfHeight) === (queue.y < halfHeight)) return
  enqueuePointerInput(queue, kind, y, now(), clock)
}

export function clearPointerCapture(capture) {
  capture.length = 0
  capture.down = false
  capture.y = null
  capture.downCount = 0
  capture.moveCount = 0
  capture.upCount = 0
}

export function createPointerInputQueue(keepSwipeTarget = false) {
  return {
    events: [], down: false, y: null, keepSwipeTarget,
    pool: Array.from({ length: (keepSwipeTarget ? 3 : 2) * POINTER_BUCKET_COUNT },
      () => ({ kind: '', y: 0, at: 0, bucket: 0 })),
  }
}

function writeCommand(command, kind, y, at, bucket) {
  command.kind = kind
  command.y = y
  command.at = at
  command.bucket = bucket
  return command
}

// Retain the newest anchor and position in a quantum. A swipe release also
// keeps its target, including a complete flick between two steps.
export function enqueuePointerInput(queue, kind, y, time, clock) {
  if (kind === 'move' && (!queue.down || queue.y === y)) return
  if (kind === 'up' && !queue.down) return
  if (kind === 'down') queue.down = true
  if (kind === 'up') queue.down = false
  queue.y = kind === 'up' ? null : y
  const events = queue.events
  const at = Number.isFinite(time) ? time : clock.lastFrameAt
  const paused = at - clock.lastFrameAt > MAX_SIMULATION_GAP_MS
  let bucket = paused ? Infinity : Math.max(0, Math.floor((at - clock.lastFrameAt + clock.pendingMs) / SIMULATION_STEP_MS))
  // A wall-clock rollback must not grow a new set of older buckets.
  if (events.length) bucket = Math.max(bucket, events[events.length - 1].bucket)
  if (paused && (kind === 'down' || events[events.length - 1]?.bucket !== Infinity)) {
    // The next frame will pause this entire gap. Only its final pointer state
    // and possible swipe anchor matter; waiting cannot grow the buffer.
    let downY, downAt, moveY, moveAt
    if (kind === 'move' || (queue.keepSwipeTarget && kind === 'up')) {
      const last = events[events.length - 1]
      if (kind === 'up' && last?.kind === 'move') {
        moveY = last.y
        moveAt = last.at
      }
      for (let i = events.length - 1; i >= 0; i--) {
        if (events[i].kind === 'up') break
        if (events[i].kind === 'down') { downY = events[i].y; downAt = events[i].at; break }
      }
    }
    events.length = 0
    if (downAt !== undefined) events.push(writeCommand(queue.pool[0], 'down', downY, downAt, bucket))
    if (moveAt !== undefined) events.push(writeCommand(queue.pool[events.length], 'move', moveY, moveAt, bucket))
  }
  const last = events[events.length - 1]
  if (kind === 'move' && last?.kind === 'move' && last.bucket === bucket) {
    last.y = y; last.at = at
    return
  }
  if (kind === 'down' || (kind === 'up' && !queue.keepSwipeTarget)) {
    while (events.length && events[events.length - 1].bucket === bucket) events.pop()
  }
  events.push(writeCommand(queue.pool[events.length], kind, y, at, bucket))
}
