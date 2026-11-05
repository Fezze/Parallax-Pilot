// Presentation callbacks may be late; gameplay always consumes the same steps.
export const SIMULATION_STEP_MS = 10
export const MAX_SIMULATION_GAP_MS = 250

export function createSimulationClock(now) {
  return { lastFrameAt: now, elapsedMs: 0, pendingMs: 0, pausedMs: 0 }
}

export function advanceSimulationClock(clock, now, update) {
  // Keep the high-water mark on a wall-clock rollback; never replay time.
  if (!Number.isFinite(now) || now <= clock.lastFrameAt) {
    return 0
  }

  const gapMs = now - clock.lastFrameAt
  clock.lastFrameAt = now
  if (gapMs > MAX_SIMULATION_GAP_MS) {
    clock.pausedMs += gapMs
    return 0
  }

  clock.pendingMs += gapMs
  let steps = 0
  while (clock.pendingMs >= SIMULATION_STEP_MS) {
    clock.pendingMs -= SIMULATION_STEP_MS
    clock.elapsedMs += SIMULATION_STEP_MS
    steps += 1
    if (update(SIMULATION_STEP_MS / 1000, clock.elapsedMs) === false) {
      clock.pendingMs = 0
      break
    }
  }
  return steps
}

// Admit the same fixed steps as advanceSimulationClock, then let the caller
// process the admitted block while retaining the option to stop at a fatal step.
// Return the number of steps actually processed.
export function advanceSimulationClockBatched(clock, now, updateBlock) {
  // Keep the high-water mark on a wall-clock rollback; never replay time.
  if (!Number.isFinite(now) || now <= clock.lastFrameAt) return 0

  const gapMs = now - clock.lastFrameAt
  clock.lastFrameAt = now
  if (gapMs > MAX_SIMULATION_GAP_MS) {
    clock.pausedMs += gapMs
    return 0
  }

  clock.pendingMs += gapMs
  const admitted = Math.floor(clock.pendingMs / SIMULATION_STEP_MS)
  if (admitted === 0) return 0

  const fromElapsedMs = clock.elapsedMs
  clock.pendingMs -= admitted * SIMULATION_STEP_MS
  if (typeof updateBlock !== 'function') throw new TypeError('updateBlock must be a function')
  const result = updateBlock(admitted, fromElapsedMs)
  if (!result || typeof result !== 'object' || !Number.isInteger(result.steps) ||
      result.steps < 0 || result.steps > admitted || typeof result.stopped !== 'boolean' ||
      (!result.stopped && result.steps !== admitted)) {
    throw new TypeError('updateBlock must return { steps: integer from 0 through admitted, stopped: boolean } and stop if it processes fewer than admitted steps')
  }

  clock.elapsedMs = fromElapsedMs + result.steps * SIMULATION_STEP_MS
  if (result.stopped) clock.pendingMs = 0
  return result.steps
}
