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
