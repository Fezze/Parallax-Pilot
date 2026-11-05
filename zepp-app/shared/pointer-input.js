import { MAX_SIMULATION_GAP_MS, SIMULATION_STEP_MS } from './simulation-clock.js'

export const MAX_POINTER_COMMANDS = 2 * (Math.ceil(MAX_SIMULATION_GAP_MS / SIMULATION_STEP_MS) + 1)

export function createPointerInputQueue() {
  return {
    events: [], down: false, y: null,
    pool: Array.from({ length: MAX_POINTER_COMMANDS }, () => ({ kind: '', y: 0, at: 0, bucket: 0 })),
  }
}

function writeCommand(command, kind, y, at, bucket) {
  command.kind = kind
  command.y = y
  command.at = at
  command.bucket = bucket
  return command
}

// Input handlers record commands only. Commands within one simulation quantum
// can be folded: no world step occurs between them. Keep the last down anchor
// and the last move, or the final release. At most two commands per quantum.
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
  if (paused) {
    // The next frame will pause this entire gap. Only its final pointer state
    // and possible swipe anchor matter; waiting cannot grow the buffer.
    let downY, downAt
    if (kind === 'move') {
      for (let i = events.length - 1; i >= 0; i--) {
        if (events[i].kind === 'up') break
        if (events[i].kind === 'down') { downY = events[i].y; downAt = events[i].at; break }
      }
    }
    events.length = 0
    if (downAt !== undefined) events.push(writeCommand(queue.pool[0], 'down', downY, downAt, bucket))
  }
  const last = events[events.length - 1]
  if (kind === 'move' && last?.kind === 'move' && last.bucket === bucket) {
    last.y = y; last.at = at
    return
  }
  if (kind !== 'move') {
    while (events.length && events[events.length - 1].bucket === bucket) events.pop()
  }
  events.push(writeCommand(queue.pool[events.length], kind, y, at, bucket))
}
