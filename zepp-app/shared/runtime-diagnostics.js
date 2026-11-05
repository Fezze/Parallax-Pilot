// Opt-in wall-clock observation only: never adjusts the game's clock or timer.
const BINS = [0, 1, 2, 4, 8, 12, 16, 20, 25, 33, 50, 100, 250, 1000]
const TRACE_LIMIT = 64
const METRICS = ['gapMs', 'previousCallbackMs', 'residualMs', 'callbackMs', 'updateMs',
  'drawSubmissionMs', 'bookkeepingMs', 'steps', 'elapsedMs', 'pausedMs', 'admittedMs',
  'pendingMs', 'objectVisits', 'candidates', 'asteroids']
const PHASES = ['controlGeometryDifficulty', 'spawn', 'moveGrid', 'candidates', 'collisionDamage', 'hud']
const TRACE_COLUMNS = ['frame', 'atMs', 'group', 'terminal', ...METRICS,
  'down', 'move', 'up', 'cancel', 'other', 'startElapsedMs', 'startPausedMs', 'startPendingMs']
let nextRun = 0

function numericArray(length) {
  const values = new Array(length)
  for (let i = 0; i < length; i += 1) values[i] = 0
  return values
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

function metrics() {
  const result = {}
  for (let i = 0; i < METRICS.length; i += 1) result[METRICS[i]] = histogram()
  return result
}

function phaseMetrics() {
  const result = new Array(PHASES.length + 2)
  for (let i = 0; i < result.length; i += 1) result[i] = histogram()
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
    for (let bin = 0; bin < from.counts.length; bin += 1) {
      to.counts[bin] += from.counts[bin]
      from.counts[bin] = 0
    }
    from.count = 0
    from.sum = 0
    from.max = 0
    from.invalid = 0
  }
}

// Export-only summaries: all selection and allocation happens after measurement.
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
    meta.fullMaterializations || 0, meta.fullAsteroidVisits || 0, meta.sensorReads || 0])
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
  const gapColumn = TRACE_COLUMNS.indexOf('gapMs')
  const largest = rows.filter(row => Number.isFinite(row[gapColumn]))
    .sort((left, right) => right[gapColumn] - left[gapColumn] || right[0] - left[0]).slice(0, 2)
  for (let index = 0; index < largest.length; index += 1) {
    if (selected.indexOf(largest[index]) < 0) selected.push(largest[index])
  }
  const pairColumns = ['frame', 'atMs', 'gapMs', 'previousCallbackMs', 'callbackMs',
    'updateMs', 'drawSubmissionMs', 'steps', 'pausedMs'].map(name => TRACE_COLUMNS.indexOf(name))
  for (let index = 0; index < selected.length; index += 1) {
    record('pair', pairColumns.map(column => selected[index][column]))
  }
  const terminal = report.terminal
  record('terminal', [terminal.callbackMs.count, terminal.callbackMs.sum, terminal.callbackMs.max,
    terminal.updateMs.sum, terminal.drawSubmissionMs.sum, terminal.steps.sum])
  return records
}

export class RuntimeDiagnostics {
  constructor(meta, { now = () => Date.now(), emit = line => console.log(line) } = {}) {
    this.meta = meta
    this.now = now
    this.emit = emit
    this.enabled = true
    this.active = false
    this.reason = ''
    this.frameCount = 0
    this.stepCount = 0
    this.sampleCount = 0
    this.sampleEvery = Number.isFinite(meta.phaseSampleEvery) ? meta.phaseSampleEvery : 13
    if (this.sampleEvery < 1) this.sampleEvery = 0
    this.sampleActive = false
    this.anomalies = { rollbackReads: 0, invalidReads: 0, invalidFrames: 0, invalidClockDeltas: 0 }
    this.pointerCounts = numericArray(5)
    this.pendingPointers = numericArray(5)
    this.framePointers = numericArray(5)
    this.steady = metrics()
    this.terminal = metrics()
    this.groups = [metrics(), metrics(), metrics()]
    this.phases = phaseMetrics()
    this.terminalPhases = phaseMetrics()
    this.framePhases = phaseMetrics()
    this.sampleDurations = numericArray(PHASES.length)
    this.values = numericArray(METRICS.length)
    this.trace = new Array(TRACE_COLUMNS.length)
    for (let i = 0; i < this.trace.length; i += 1) this.trace[i] = numericArray(TRACE_LIMIT)
    this.previousArrival = NaN
    this.previousCallback = NaN
    this.previousCallbackValid = false
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
    if (!this.enabled || this.active) return
    this.active = true
    this.timingInvalid = false
    this.observe(at)
    this.frameAt = at
    this.updateAt = NaN
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

  pointer(kind) {
    if (!this.enabled) return
    const index = kind === 'down' ? 0 : kind === 'move' ? 1 : kind === 'up' ? 2 : kind === 'cancel' ? 3 : 4
    this.pointerCounts[index] += 1
    this.pendingPointers[index] += 1
  }

  beginStep(asteroidCount) {
    if (!this.enabled || !this.active) return false
    this.stepCount += 1
    this.frameSteps += 1
    this.frameVisits += asteroidCount
    this.sampleActive = this.sampleEvery > 0 && (this.stepCount - 1) % this.sampleEvery === 0
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
    for (let i = 0; i < PHASES.length; i += 1) {
      add(this.framePhases[i], valid ? this.sampleDurations[i] : NaN)
    }
    add(this.framePhases[6], valid ? at - this.sampleStart : NaN)
    add(this.framePhases[7], valid ? at - this.phaseAt : NaN)
    this.sampleActive = false
  }

  endFrame(at, clock, terminal = false) {
    if (!this.enabled || !this.active) return
    // A synchronous route may request teardown before the caller can mark it.
    terminal = terminal || this.reason !== ''
    this.observe(at)
    const elapsed = clock.elapsedMs - this.startElapsed
    const paused = clock.pausedMs - this.startPaused
    const admitted = elapsed + clock.pendingMs - this.startPending
    if (!Number.isFinite(elapsed) || !Number.isFinite(paused) || !Number.isFinite(admitted) ||
        elapsed < 0 || paused < 0 || admitted < 0) this.anomalies.invalidClockDeltas += 1
    this.finalElapsed = clock.elapsedMs
    this.finalPaused = clock.pausedMs
    this.finalPending = clock.pendingMs
    const values = this.values
    values[0] = this.frameAt - this.previousArrival
    values[1] = this.previousCallbackValid ? this.previousCallback : NaN
    values[2] = values[0] - values[1]
    values[7] = this.frameSteps
    values[8] = elapsed
    values[9] = paused
    values[10] = admitted
    values[11] = clock.pendingMs
    values[12] = this.frameVisits
    values[13] = this.frameCandidates
    values[14] = this.frameAsteroids
    const target = terminal ? this.terminal : this.steady
    const group = this.groups[this.group]
    // Bulk count bookkeeping occurs before the final wall-clock read.
    for (let i = 7; i < METRICS.length; i += 1) {
      add(target[METRICS[i]], values[i])
      if (!terminal) add(group[METRICS[i]], values[i])
    }
    if (this.frameSamples > 0) mergeAndClear(terminal ? this.terminalPhases : this.phases, this.framePhases)
    const slot = this.frameCount % TRACE_LIMIT
    this.trace[0][slot] = this.frameCount + 1
    this.trace[1][slot] = this.frameAt - this.startedAt
    this.trace[2][slot] = this.group
    this.trace[3][slot] = terminal ? 1 : 0
    for (let i = 7; i < METRICS.length; i += 1) this.trace[i + 4][slot] = values[i]
    for (let i = 0; i < 5; i += 1) this.trace[METRICS.length + 4 + i][slot] = this.framePointers[i]
    this.trace[METRICS.length + 9][slot] = this.startElapsed
    this.trace[METRICS.length + 10][slot] = this.startPaused
    this.trace[METRICS.length + 11][slot] = this.startPending

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
    for (let i = 0; i < 7; i += 1) {
      add(target[METRICS[i]], values[i])
      if (!terminal) add(group[METRICS[i]], values[i])
      this.trace[i + 4][slot] = values[i]
    }
    this.previousArrival = this.frameAt
    this.previousCallback = values[3]
    this.previousCallbackValid = valid
    this.frameCount += 1
    this.active = false
    this.lastCompletedAt = completedAt
    if (terminal && !this.reason) this.reason = 'terminal'
    if (!this.reason && completedAt - this.startedAt >= 30000) this.reason = 'wall-time-limit'
    if (this.reason) this.finish(completedAt)
  }

  requestFinish(reason) {
    if (!this.enabled) return
    if (!this.reason) this.reason = reason || 'requested'
    if (!this.active) this.finish(this.now())
  }

  finish(at) {
    if (!this.enabled || this.active) return
    const validWallTime = this.observe(at)
    this.enabled = false
    const rows = []
    const count = this.frameCount < TRACE_LIMIT ? this.frameCount : TRACE_LIMIT
    const first = this.frameCount - count
    for (let frame = first; frame < this.frameCount; frame += 1) {
      const row = new Array(TRACE_COLUMNS.length)
      for (let col = 0; col < row.length; col += 1) row[col] = this.trace[col][frame % TRACE_LIMIT]
      rows.push(row)
    }
    const report = {
      schema: 1, runId: this.runId, meta: this.meta, reason: this.reason,
      wallMs: validWallTime && Number.isFinite(at - this.startedAt) && at >= this.startedAt ? at - this.startedAt : null,
      frames: this.frameCount, steps: this.stepCount,
      clock: { elapsedMs: this.finalElapsed, pausedMs: this.finalPaused, pendingMs: this.finalPending,
        observedElapsedMs: this.finalElapsed - this.initialElapsed, observedPausedMs: this.finalPaused - this.initialPaused },
      input: { names: ['down', 'move', 'up', 'cancel', 'other'], counts: this.pointerCounts },
      histogramBins: BINS,
      groupNames: ['idle', 'heldOrTransition', 'moving'], groups: this.groups,
      steady: this.steady, terminal: this.terminal,
      sampling: { every: this.sampleEvery, count: this.sampleCount,
        names: [...PHASES, 'sampledStep', 'afterHud'], steady: this.phases, terminal: this.terminalPhases },
      calibration: this.calibration, anomalies: this.anomalies,
      trace: { limit: TRACE_LIMIT, columns: TRACE_COLUMNS, rows },
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
    if (this.meta.compactExport === true) {
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
