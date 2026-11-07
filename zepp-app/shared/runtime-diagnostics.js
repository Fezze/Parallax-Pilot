// Opt-in wall-clock observation only: never adjusts the game's clock or timer.
const BINS = [0, 1, 2, 4, 8, 12, 16, 20, 25, 33, 50, 100, 250, 1000]
const TRACE_LIMIT = 64
const METRICS = ['gapMs', 'previousCallbackMs', 'residualMs', 'callbackMs', 'updateMs',
  'drawSubmissionMs', 'bookkeepingMs', 'steps', 'elapsedMs', 'pausedMs', 'admittedMs',
  'pendingMs', 'objectVisits', 'candidates', 'asteroids']
const PHASES = ['controlGeometryDifficulty', 'spawn', 'moveGrid', 'candidates', 'collisionDamage', 'hud']
const TRACE_COLUMNS = ['frame', 'atMs', 'group', 'terminal', ...METRICS,
  'down', 'move', 'up', 'cancel', 'other', 'startElapsedMs', 'startPausedMs', 'startPendingMs']
const COMPACT_STEADY_WORK = [7, 9, 12, 13, 14]
const COMPACT_TERMINAL_TIMING = [3, 4, 5]
const COMPACT_GROUP_TIMING = [0, 3, 4, 5]
const COMPACT_TRACE_COLUMNS = ['frame', 'atMs', 'gapMs', 'previousCallbackMs', 'callbackMs',
  'updateMs', 'drawSubmissionMs', 'steps', 'pausedMs']
const STALL_WORK_FIELDS = ['inputMs', 'scanMs', 'windowsMs', 'quietMs', 'stepsMs', 'spawnMs',
  'contactMs', 'materializeMs', 'inbox', 'commands', 'blocks', 'eventSteps', 'contactChecks']
export const SLOW_UPDATE_FIELDS = ['frame', 'incomingGapMs', 'updateMs', 'drawSubmissionMs',
  'nextGapMs', 'logicalQuanta', ...STALL_WORK_FIELDS, 'hit']
let nextRun = 0

function numericArray(length) {
  const values = new Array(length)
  for (let i = 0; i < length; i += 1) values[i] = 0
  return values
}

function slowUpdateRow() {
  const row = {}
  for (const field of SLOW_UPDATE_FIELDS) row[field] = 0
  row.updateMs = -1
  return row
}

function histogram() {
  return { bins: BINS, counts: numericArray(BINS.length + 1), count: 0, sum: 0, max: 0, invalid: 0 }
}

function add(hist, value) {
  if (!Number.isFinite(value) || value < 0) {
    hist.invalid += 1
    return
  }
  let bin = 0
  while (bin < BINS.length && value > BINS[bin]) bin += 1
  hist.counts[bin] += 1
  hist.count += 1
  hist.sum += value
  if (value > hist.max) hist.max = value
}

function addScalar(hist, value) {
  if (!Number.isFinite(value) || value < 0) {
    hist.invalid += 1
    return
  }
  // Compact work summaries export zero-step and nonzero-pause frame counts.
  if (hist.counts && value === 0) hist.counts[0] += 1
  hist.count += 1
  hist.sum += value
  if (value > hist.max) hist.max = value
}

function durationSummary() {
  return { count: 0, sum: 0, max: 0 }
}

function recordDuration(summary, value) {
  if (!Number.isFinite(value) || value < 0) return
  summary.count += 1
  summary.sum += value
  if (value > summary.max) summary.max = value
}

function durationTuple({ count, sum, max }) {
  return [count, sum, max]
}

function metrics() {
  const result = {}
  for (let i = 0; i < METRICS.length; i += 1) result[METRICS[i]] = histogram()
  return result
}

function scalarMetrics(indices, trackZeros = false) {
  const result = {}
  for (let i = 0; i < indices.length; i += 1) {
    const index = indices[i]
    result[METRICS[index]] = { count: 0, sum: 0, max: 0, invalid: 0,
      counts: trackZeros && (index === 7 || index === 9) ? [0] : null }
  }
  return result
}

function phaseMetrics(compact = false) {
  const result = new Array(PHASES.length + (compact ? 0 : 2))
  for (let i = 0; i < result.length; i += 1) {
    result[i] = compact ? { count: 0, sum: 0, max: 0, invalid: 0 } : histogram()
  }
  return result
}

function mergeAndClear(target, source) {
  for (let i = 0; i < source.length; i += 1) {
    const from = source[i]
    const to = target[i]
    to.count += from.count
    to.sum += from.sum
    to.invalid += from.invalid
    if (from.max > to.max) to.max = from.max
    if (from.counts) {
      for (let bin = 0; bin < from.counts.length; bin += 1) {
        to.counts[bin] += from.counts[bin]
        from.counts[bin] = 0
      }
    }
    from.count = 0
    from.sum = 0
    from.max = 0
    from.invalid = 0
  }
}

// Three base-36 digits per value keep each stall record within the native line
// limit. Reserve zzz for unavailable values and use four digits for the frame.
function encodeSlowUpdate(row) {
  let packed = Math.min(row.frame, 36 ** 4 - 1).toString(36).padStart(4, '0')
  for (let i = 1; i < SLOW_UPDATE_FIELDS.length - 1; i += 1) {
    const value = row[SLOW_UPDATE_FIELDS[i]]
    packed += Number.isFinite(value) && value >= 0
      ? Math.min(Math.round(value), 36 ** 3 - 2).toString(36).padStart(3, '0') : 'zzz'
  }
  return packed + (row.hit ? '1' : '0')
}

// Allocate serialized records after measurement.
function compactRecords(report) {
  const records = []
  const record = (kind, data) => records.push({ k: kind, d: data })
  const meta = report.meta
  record('meta', [2, meta.version, meta.deviceSource, meta.runIndex, report.sampling.every,
    meta.controlMode, meta.wristSide, meta.timeScale, meta.spawnMultiplier,
    meta.width, meta.height, meta.modePersisted])
  record('clock', [report.wallMs, report.frames, report.steps, report.clock.elapsedMs,
    report.clock.pausedMs, report.clock.pendingMs, report.reason])
  for (let index = 0; index < 7; index += 1) {
    const hist = report.steady[METRICS[index]]
    let p95 = null
    let cumulative = 0
    for (let bin = 0; hist.count && bin < BINS.length; bin += 1) {
      cumulative += hist.counts[bin]
      if (cumulative >= Math.ceil(hist.count * 0.95)) {
        p95 = BINS[bin]
        break
      }
    }
    record('metric', [index, hist.count, hist.sum, hist.max, hist.invalid, p95])
  }
  const steady = report.steady
  record('work', [steady.steps.count, steady.steps.sum, steady.steps.max,
    steady.objectVisits.sum, steady.candidates.sum, steady.asteroids.max,
    steady.steps.counts[0], steady.pausedMs.count - steady.pausedMs.counts[0],
    meta.fullMaterializations || 0, meta.fullAsteroidVisits || 0, meta.sensorReads || 0,
    meta.skippedQuanta || 0, meta.eventQuanta || 0])
  for (let index = 0; index < PHASES.length; index += 1) {
    const hist = report.sampling.steady[index]
    record('phase', [index, hist.count, hist.sum, hist.max, hist.invalid])
  }
  for (let index = 0; index < report.groups.length; index += 1) {
    const group = report.groups[index]
    record('group', [index, group.callbackMs.count, group.gapMs.count, group.gapMs.sum,
      group.gapMs.max, group.updateMs.sum, group.drawSubmissionMs.sum, group.callbackMs.sum])
  }
  const calibration = report.calibration
  record('calibration', [calibration.reads, calibration.spanMs, calibration.zeroDeltas,
    calibration.minPositiveMs, calibration.rollbacks, calibration.invalidReads,
    report.anomalies.invalidFrames])
  const rows = report.trace.rows
  const selected = rows.slice(-2)
  const gapColumn = 2
  const largest = rows.filter(row => Number.isFinite(row[gapColumn]))
    .sort((left, right) => right[gapColumn] - left[gapColumn] || right[0] - left[0]).slice(0, 2)
  for (let index = 0; index < largest.length; index += 1) {
    if (selected.indexOf(largest[index]) < 0) selected.push(largest[index])
  }
  for (let index = 0; index < selected.length; index += 1) {
    record('pair', selected[index])
  }
  const terminal = report.terminal
  record('terminal', [terminal.callbackMs.count, terminal.callbackMs.sum, terminal.callbackMs.max,
    terminal.updateMs.sum, terminal.drawSubmissionMs.sum, terminal.steps.sum])
  if (report.damage) {
    const { hitUpdateMs, afterHitGapMs, afterHitResidualMs, hudDrawMs, hapticMs } = report.damage
    record('damage', [...durationTuple(hitUpdateMs), ...durationTuple(afterHitGapMs), ...durationTuple(afterHitResidualMs)])
    record('impact', [...durationTuple(hudDrawMs), ...durationTuple(hapticMs),
      report.damage.scoreSaveMs, report.damage.resultsRouteMs, meta.foldedSwipeMoves || 0])
  }
  if (report.slowUpdates) {
    for (const row of report.slowUpdates) {
      if (row.frame !== 0) record('stall', [encodeSlowUpdate(row)])
    }
  }
  return records
}

export class RuntimeDiagnostics {
  constructor(meta, { now = () => Date.now(), emit = line => console.log(line) } = {}) {
    this.meta = meta
    this.compactExport = meta.compactExport === true
    this.now = now
    this.emit = emit
    this.enabled = true
    this.active = false
    this.reason = ''
    this.exportPending = false
    this.finishWallMs = undefined
    this.frameCount = 0
    this.stepCount = 0
    this.executedStepCount = 0
    this.sampleCount = 0
    this.sampleEvery = Number.isFinite(meta.phaseSampleEvery) ? meta.phaseSampleEvery : 13
    if (this.sampleEvery < 1) this.sampleEvery = 0
    this.sampleActive = false
    this.anomalies = { rollbackReads: 0, invalidReads: 0, invalidFrames: 0, invalidClockDeltas: 0 }
    this.pointerCounts = numericArray(5)
    this.pendingPointers = numericArray(5)
    this.framePointers = numericArray(5)
    if (this.compactExport) {
      this.steady = scalarMetrics(COMPACT_STEADY_WORK, true)
      for (let i = 0; i < 7; i += 1) this.steady[METRICS[i]] = histogram()
      this.terminal = scalarMetrics([...COMPACT_TERMINAL_TIMING, 7])
      this.groups = [scalarMetrics(COMPACT_GROUP_TIMING), scalarMetrics(COMPACT_GROUP_TIMING),
        scalarMetrics(COMPACT_GROUP_TIMING)]
    } else {
      this.steady = metrics()
      this.terminal = metrics()
      this.groups = [metrics(), metrics(), metrics()]
    }
    this.phases = phaseMetrics(this.compactExport)
    this.terminalPhases = this.compactExport ? null : phaseMetrics()
    this.framePhases = phaseMetrics(this.compactExport)
    this.sampleDurations = numericArray(PHASES.length)
    this.values = numericArray(METRICS.length)
    this.traceColumns = this.compactExport ? COMPACT_TRACE_COLUMNS : TRACE_COLUMNS
    this.trace = new Array(this.traceColumns.length)
    for (let i = 0; i < this.trace.length; i += 1) this.trace[i] = numericArray(TRACE_LIMIT)
    this.previousArrival = NaN
    this.previousCallback = NaN
    this.previousCallbackValid = false
    this.previousFrameHit = false
    this.slowUpdates = this.compactExport && meta.stallFrame ? [slowUpdateRow(), slowUpdateRow()] : null
    this.pendingSlowUpdate = null
    this.damage = meta.measureDamage === true ? {
      hitUpdateMs: durationSummary(),
      afterHitGapMs: durationSummary(),
      afterHitResidualMs: durationSummary(),
      hudDrawMs: durationSummary(),
      hapticMs: durationSummary(),
    } : null
    this.finalElapsed = 0
    this.finalPaused = 0
    this.finalPending = 0
    this.initialElapsed = 0
    this.initialPaused = 0

    // Fixed read count; no spin waiting for a coarse Date.now clock to tick.
    let first = NaN
    let previous = NaN
    let last = NaN
    let zeroDeltas = 0
    let positiveDeltas = 0
    let minPositiveMs = Infinity
    let maxDeltaMs = 0
    let rollbacks = 0
    let invalidReads = 0
    for (let i = 0; i < 64; i += 1) {
      last = now()
      if (!Number.isFinite(last)) invalidReads += 1
      if (i === 0) first = last
      if (i > 0 && Number.isFinite(last) && Number.isFinite(previous)) {
        const delta = last - previous
        if (delta === 0) zeroDeltas += 1
        else if (delta < 0) rollbacks += 1
        else {
          positiveDeltas += 1
          if (delta < minPositiveMs) minPositiveMs = delta
          if (delta > maxDeltaMs) maxDeltaMs = delta
        }
      }
      previous = last
    }
    this.calibration = { reads: 64, zeroDeltas, positiveDeltas,
      minPositiveMs: positiveDeltas ? minPositiveMs : null, maxDeltaMs, rollbacks, invalidReads,
      spanMs: rollbacks || invalidReads ? null : last - first }
    this.startedAt = last
    this.lastObserved = Number.isFinite(last) ? last : -Infinity
    this.runId = `${last}-${++nextRun}`
  }

  observe(at) {
    if (!Number.isFinite(at)) {
      this.anomalies.invalidReads += 1
      if (this.active) this.timingInvalid = true
      if (this.sampleActive) this.sampleInvalid = true
      return false
    }
    if (at < this.lastObserved) {
      this.anomalies.rollbackReads += 1
      if (this.active) this.timingInvalid = true
      if (this.sampleActive) this.sampleInvalid = true
      return false
    }
    this.lastObserved = at
    return true
  }

  beginFrame(at, clock, held, asteroidCount) {
    if (!this.enabled || this.active || this.exportPending) return
    this.active = true
    this.timingInvalid = false
    const validArrival = this.observe(at)
    if (this.pendingSlowUpdate) {
      if (validArrival) this.pendingSlowUpdate.nextGapMs = at - this.previousArrival
      this.pendingSlowUpdate = null
    }
    this.frameAt = at
    this.updateAt = NaN
    if (this.damage || this.slowUpdates) this.meta.frameHit = false
    if (this.damage) this.meta.frameHud = false
    this.startElapsed = clock.elapsedMs
    this.startPaused = clock.pausedMs
    this.startPending = clock.pendingMs
    if (this.frameCount === 0) {
      this.initialElapsed = clock.elapsedMs
      this.initialPaused = clock.pausedMs
    }
    this.finalElapsed = clock.elapsedMs
    this.finalPaused = clock.pausedMs
    this.finalPending = clock.pendingMs
    this.frameSteps = 0
    this.frameSamples = 0
    this.frameVisits = 0
    this.frameCandidates = 0
    this.frameAsteroids = asteroidCount
    for (let i = 0; i < 5; i += 1) {
      this.framePointers[i] = this.pendingPointers[i]
      this.pendingPointers[i] = 0
    }
    this.group = this.framePointers[1] > 0 ? 2 :
      held || this.framePointers[0] || this.framePointers[2] || this.framePointers[3] ? 1 : 0
  }

  markUpdate(at) {
    if (!this.enabled || !this.active) return
    this.observe(at)
    this.updateAt = at
  }

  recordHaptic(startedAt, endedAt) {
    if (!this.enabled || !this.active || !this.damage) return
    recordDuration(this.damage.hapticMs, endedAt - startedAt)
  }

  pointer(kind, count = 1) {
    if (!this.enabled) return
    const index = kind === 'down' ? 0 : kind === 'move' ? 1 : kind === 'up' ? 2 : kind === 'cancel' ? 3 : 4
    this.pointerCounts[index] += count
    this.pendingPointers[index] += count
  }

  beginStep(asteroidCount) {
    if (!this.enabled || !this.active) return false
    this.stepCount += 1
    this.executedStepCount += 1
    this.frameSteps += 1
    this.frameVisits += asteroidCount
    const samplingStep = this.compactExport ? this.executedStepCount : this.stepCount
    this.sampleActive = this.sampleEvery > 0 && (samplingStep - 1) % this.sampleEvery === 0
    if (!this.sampleActive) return false
    this.sampleCount += 1
    this.frameSamples += 1
    this.sampleInvalid = this.timingInvalid
    this.sampleStart = this.now()
    this.observe(this.sampleStart)
    this.phaseAt = this.sampleStart
    this.nextPhase = 0
    for (let i = 0; i < PHASES.length; i += 1) this.sampleDurations[i] = NaN
    return true
  }

  recordSkippedSteps(count) {
    if (!this.enabled || !this.active || !Number.isFinite(count) || count <= 0 || Math.floor(count) !== count) return
    // Skips affect logical work totals only. Compact phase sampling follows
    // executed canonical steps, so analytic spans cannot hide event costs.
    this.stepCount += count
    this.frameSteps += count
  }

  markStepPhase(index) {
    if (!this.enabled || !this.sampleActive) return
    const at = this.now()
    this.observe(at)
    if (index !== this.nextPhase || index < 0 || index >= PHASES.length) this.sampleInvalid = true
    else this.sampleDurations[index] = at - this.phaseAt
    this.phaseAt = at
    this.nextPhase = index + 1
  }

  endStep(candidateCount) {
    if (!this.enabled || !this.active) return
    this.frameCandidates += candidateCount
    if (!this.sampleActive) return
    const at = this.now()
    this.observe(at)
    const valid = !this.sampleInvalid && this.nextPhase === PHASES.length
    const accumulate = this.compactExport ? addScalar : add
    for (let i = 0; i < PHASES.length; i += 1) {
      accumulate(this.framePhases[i], valid ? this.sampleDurations[i] : NaN)
    }
    if (!this.compactExport) {
      add(this.framePhases[6], valid ? at - this.sampleStart : NaN)
      add(this.framePhases[7], valid ? at - this.phaseAt : NaN)
    }
    this.sampleActive = false
  }

  retainSlowUpdate(values) {
    const rows = this.slowUpdates
    const updateMs = values[4]
    if (!Number.isFinite(updateMs) || updateMs < 0 || updateMs <= rows[1].updateMs) return
    const row = rows[1]
    row.frame = this.frameCount + 1
    row.incomingGapMs = values[0]
    row.updateMs = updateMs
    row.drawSubmissionMs = values[5]
    row.nextGapMs = NaN
    row.logicalQuanta = this.frameSteps
    row.hit = this.meta.frameHit === true
    const work = this.meta.stallFrame
    for (let i = 0; i < STALL_WORK_FIELDS.length; i += 1) {
      const field = STALL_WORK_FIELDS[i]
      row[field] = work[field]
    }
    if (updateMs > rows[0].updateMs) {
      rows[1] = rows[0]
      rows[0] = row
    }
    this.pendingSlowUpdate = row
  }

  endFrame(at, clock, terminal = false) {
    if (!this.enabled || !this.active) return
    // A synchronous route may request teardown before the caller can mark it.
    terminal = terminal || this.reason !== ''
    this.observe(at)
    const paused = clock.pausedMs - this.startPaused
    this.finalElapsed = clock.elapsedMs
    this.finalPaused = clock.pausedMs
    this.finalPending = clock.pendingMs
    const values = this.values
    values[0] = this.frameAt - this.previousArrival
    values[1] = this.previousCallbackValid ? this.previousCallback : NaN
    values[2] = values[0] - values[1]
    values[7] = this.frameSteps
    values[9] = paused
    values[12] = this.frameVisits
    values[13] = this.frameCandidates
    values[14] = this.frameAsteroids
    const target = terminal ? this.terminal : this.steady
    const group = this.groups[this.group]
    const slot = this.frameCount % TRACE_LIMIT
    this.trace[0][slot] = this.frameCount + 1
    this.trace[1][slot] = this.frameAt - this.startedAt
    // Bulk count bookkeeping occurs before the final wall-clock read.
    if (this.compactExport) {
      if (terminal) addScalar(target.steps, this.frameSteps)
      else {
        for (let i = 0; i < COMPACT_STEADY_WORK.length; i += 1) {
          const index = COMPACT_STEADY_WORK[i]
          addScalar(target[METRICS[index]], values[index])
        }
        if (this.frameSamples > 0) mergeAndClear(this.phases, this.framePhases)
      }
      this.trace[7][slot] = this.frameSteps
      this.trace[8][slot] = paused
    } else {
      const elapsed = clock.elapsedMs - this.startElapsed
      const admitted = elapsed + clock.pendingMs - this.startPending
      if (!Number.isFinite(elapsed) || !Number.isFinite(paused) || !Number.isFinite(admitted) ||
          elapsed < 0 || paused < 0 || admitted < 0) this.anomalies.invalidClockDeltas += 1
      values[8] = elapsed
      values[10] = admitted
      values[11] = clock.pendingMs
      this.trace[2][slot] = this.group
      this.trace[3][slot] = terminal ? 1 : 0
      for (let i = 7; i < METRICS.length; i += 1) {
        add(target[METRICS[i]], values[i])
        if (!terminal) add(group[METRICS[i]], values[i])
        this.trace[i + 4][slot] = values[i]
      }
      if (this.frameSamples > 0) mergeAndClear(terminal ? this.terminalPhases : this.phases, this.framePhases)
      for (let i = 0; i < 5; i += 1) this.trace[METRICS.length + 4 + i][slot] = this.framePointers[i]
      this.trace[METRICS.length + 9][slot] = this.startElapsed
      this.trace[METRICS.length + 10][slot] = this.startPaused
      this.trace[METRICS.length + 11][slot] = this.startPending
    }

    const completedAt = this.now()
    this.observe(completedAt)
    const valid = !this.timingInvalid
    values[3] = valid ? completedAt - this.frameAt : NaN
    values[4] = valid ? this.updateAt - this.frameAt : NaN
    values[5] = valid ? at - this.updateAt : NaN
    values[6] = valid ? completedAt - at : NaN
    if (!valid) {
      this.anomalies.invalidFrames += 1
      values[0] = NaN
      values[1] = NaN
      values[2] = NaN
    }
    if (this.slowUpdates && !terminal) this.retainSlowUpdate(values)
    if (this.damage) {
      if (this.previousFrameHit) {
        recordDuration(this.damage.afterHitGapMs, values[0])
        recordDuration(this.damage.afterHitResidualMs, values[2])
      }
      this.previousFrameHit = !terminal && this.meta.frameHit === true
      if (this.previousFrameHit) recordDuration(this.damage.hitUpdateMs, values[4])
      if (!terminal && this.meta.frameHud) recordDuration(this.damage.hudDrawMs, values[5])
    }
    if (this.compactExport) {
      if (terminal) {
        for (let i = 0; i < COMPACT_TERMINAL_TIMING.length; i += 1) {
          const index = COMPACT_TERMINAL_TIMING[i]
          addScalar(target[METRICS[index]], values[index])
        }
      } else {
        for (let i = 0; i < 7; i += 1) add(target[METRICS[i]], values[i])
        for (let i = 0; i < COMPACT_GROUP_TIMING.length; i += 1) {
          const index = COMPACT_GROUP_TIMING[i]
          addScalar(group[METRICS[index]], values[index])
        }
      }
      this.trace[2][slot] = values[0]
      this.trace[3][slot] = values[1]
      this.trace[4][slot] = values[3]
      this.trace[5][slot] = values[4]
      this.trace[6][slot] = values[5]
    } else {
      for (let i = 0; i < 7; i += 1) {
        add(target[METRICS[i]], values[i])
        if (!terminal) add(group[METRICS[i]], values[i])
        this.trace[i + 4][slot] = values[i]
      }
    }
    this.previousArrival = this.frameAt
    this.previousCallback = values[3]
    this.previousCallbackValid = valid
    this.frameCount += 1
    this.active = false
    if (terminal && !this.reason) this.reason = 'terminal'
    if (!this.reason && completedAt - this.startedAt >= 30000) this.reason = 'wall-time-limit'
    if (this.reason) this.finish(completedAt)
  }

  requestFinish(reason) {
    if (!this.enabled || this.reason) return
    this.reason = reason || 'requested'
    this.exportPending = this.meta.deferExport === true
    if (!this.active) this.finish(this.now())
  }

  finishDeferred() {
    if (!this.enabled || !this.exportPending) return
    this.exportPending = false
    // Synchronous teardown can release the hold while the terminal frame is active.
    // In that case endFrame captures the final timestamp and emits the report.
    if (!this.active) this.finish()
  }

  finish(at) {
    if (!this.enabled || this.active) return
    if (this.finishWallMs === undefined) {
      const validWallTime = this.observe(at)
      const wallMs = at - this.startedAt
      this.finishWallMs = validWallTime && Number.isFinite(wallMs) && wallMs >= 0 ? wallMs : null
    }
    if (this.exportPending) return
    this.enabled = false
    const rows = []
    const count = this.frameCount < TRACE_LIMIT ? this.frameCount : TRACE_LIMIT
    const first = this.frameCount - count
    for (let frame = first; frame < this.frameCount; frame += 1) {
      const row = new Array(this.traceColumns.length)
      for (let col = 0; col < row.length; col += 1) row[col] = this.trace[col][frame % TRACE_LIMIT]
      rows.push(row)
    }
    const report = {
      schema: 1, runId: this.runId, meta: this.meta, reason: this.reason,
      wallMs: this.finishWallMs,
      frames: this.frameCount, steps: this.stepCount,
      clock: { elapsedMs: this.finalElapsed, pausedMs: this.finalPaused, pendingMs: this.finalPending,
        observedElapsedMs: this.finalElapsed - this.initialElapsed, observedPausedMs: this.finalPaused - this.initialPaused },
      input: { names: ['down', 'move', 'up', 'cancel', 'other'], counts: this.pointerCounts },
      histogramBins: BINS,
      groupNames: ['idle', 'heldOrTransition', 'moving'], groups: this.groups,
      steady: this.steady, terminal: this.terminal,
      sampling: { every: this.sampleEvery, count: this.sampleCount,
        names: this.compactExport ? PHASES : [...PHASES, 'sampledStep', 'afterHud'],
        steady: this.phases, terminal: this.terminalPhases },
      calibration: this.calibration, anomalies: this.anomalies,
      trace: { limit: TRACE_LIMIT, columns: this.traceColumns, rows },
      caveats: [
        'Both frame-only and phased modes are instrumented; compare matching input/workload runs to assess overhead.',
        'Date.now calibration is 64 bounded reads; span includes loop/read overhead and does not establish resolution when all reads are equal.',
        'Draw timing measures widget submission, not display completion or GPU work.',
        'Callback timing includes bulk diagnostics bookkeeping; final timing histogram/scalar writes and report emission are outside that measurement.',
        'Report emission occurs after the final measured frame; instrumentation disables before emitting and allocates no timer.',
        'Object visits count the caller-supplied per-step work set, not CPU instructions; candidate count is supplied by the caller.',
        'Clock rollback invalidates affected wall timings without changing simulation time; null trace values denote invalid or unavailable measurements.'
      ]
    }
    if (this.damage) {
      const { scoreSaveMs, resultsRouteMs } = this.meta
      report.damage = {
        ...this.damage,
        scoreSaveMs: Number.isFinite(scoreSaveMs) && scoreSaveMs >= 0 ? scoreSaveMs : null,
        resultsRouteMs: Number.isFinite(resultsRouteMs) && resultsRouteMs >= 0 ? resultsRouteMs : null,
      }
    }
    if (this.compactExport) {
      report.slowUpdates = this.slowUpdates
      report.caveats.push('Phase sampling follows executed canonical steps, independently of logical step totals; analytically skipped quanta have no phase sample or object/candidate visits.')
      const records = compactRecords(report)
      for (let part = 0; part < records.length; part += 1) {
        const entry = records[part]
        const data = JSON.stringify({ r: this.runId, p: part + 1, t: records.length, k: entry.k, d: entry.d })
          .replace(/[\u007f-\uffff]/g, character => `\\u${(`0000${character.charCodeAt(0).toString(16)}`).slice(-4)}`)
        this.emit(`PP_METRIC ${data}`)
      }
      return
    }
    // Native SBEngine transport truncates long console messages. Escape Unicode
    // before chunking so the limit applies equally to ASCII bytes and characters.
    const data = JSON.stringify(report, (key, value) => key === 'bins' && value === BINS ? undefined : value)
      .replace(/[\u007f-\uffff]/g, character => `\\u${(`0000${character.charCodeAt(0).toString(16)}`).slice(-4)}`)
    let sliceSize = 32
    let total = Math.ceil(data.length / sliceSize)
    // Allow two output characters per payload character (quote/backslash
    // escaping), using the largest part number to bound every envelope.
    while (true) {
      const envelopeLength = 8 + JSON.stringify({ runId: this.runId, part: total, total, data: '' }).length
      const boundedSize = Math.min(32, Math.floor((160 - envelopeLength) / 2))
      if (boundedSize >= sliceSize) break
      sliceSize = boundedSize
      total = Math.ceil(data.length / sliceSize)
    }
    for (let part = 0; part < total; part += 1) {
      this.emit(`PP_DIAG ${JSON.stringify({ runId: this.runId, part: part + 1, total, data: data.slice(part * sliceSize, (part + 1) * sliceSize) })}`)
    }
  }
}
