import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { RuntimeDiagnostics } from '../zepp-app/shared/runtime-diagnostics.js'
import { advanceSimulationClock, createSimulationClock } from '../zepp-app/shared/simulation-clock.js'

function harness(meta = {}) {
  let wall = 0
  let reads = 0
  const lines = []
  const diag = new RuntimeDiagnostics({ version: 'test', phaseSampleEvery: 13, ...meta }, {
    now: () => { reads += 1; return wall },
    emit: line => lines.push(line)
  })
  const clock = createSimulationClock(0)
  return { diag, clock, lines, set: at => { wall = at }, advance: ms => { wall += ms },
    reads: () => reads, now: () => wall }
}

function report(h) {
  const chunks = h.lines.map(line => {
    assert.ok(line.startsWith('PP_DIAG '))
    assert.ok(line.length <= 160, `oversized chunk: ${line.length}`)
    assert.match(line, /^[\x20-\x7e]+$/)
    return JSON.parse(line.slice(8))
  })
  assert.ok(chunks.length > 0)
  for (let i = 0; i < chunks.length; i += 1) {
    assert.equal(chunks[i].part, i + 1)
    assert.equal(chunks[i].total, chunks.length)
    assert.equal(chunks[i].runId, chunks[0].runId)
  }
  return JSON.parse(chunks.map(chunk => chunk.data).join(''))
}

function traceRow(result, index) {
  return Object.fromEntries(result.trace.columns.map((name, col) => [name, result.trace.rows[index][col]]))
}

function sampleStep(h, costs = [1, 2, 3, 4, 5, 6], asteroids = 7, candidates = 3) {
  const sampled = h.diag.beginStep(asteroids)
  for (let phase = 0; phase < costs.length; phase += 1) {
    h.advance(costs[phase])
    if (sampled) h.diag.markStepPhase(phase)
  }
  h.diag.endStep(candidates)
  return sampled
}

function emptyFrame(h, at, held = false, terminal = false) {
  h.set(at)
  h.diag.beginFrame(at, h.clock, held, 0)
  h.diag.markUpdate(at)
  h.diag.endFrame(at, h.clock, terminal)
}

test('bounded calibration takes exactly 64 reads without waiting for a tick', () => {
  const h = harness()
  assert.equal(h.reads(), 64)
  assert.equal(h.lines.length, 0)
  h.diag.requestFinish('calibration-only')
  const result = report(h)
  assert.deepEqual(result.calibration, { reads: 64, zeroDeltas: 63, positiveDeltas: 0,
    minPositiveMs: null, maxDeltaMs: 0, rollbacks: 0, invalidReads: 0, spanMs: 0 })
  assert.equal(result.frames, 0)
  assert.equal(result.reason, 'calibration-only')
})

test('records phased cost, paired callback gap/residual, step work and long-gap pause', () => {
  const h = harness()
  h.set(20)
  h.diag.beginFrame(20, h.clock, false, 7)
  advanceSimulationClock(h.clock, 20, () => { sampleStep(h) })
  h.diag.markUpdate(h.now())
  h.advance(5)
  h.diag.endFrame(h.now(), h.clock)
  // 20 arrival + 42 update + 5 submission = 67 callback end.
  h.set(100)
  h.diag.beginFrame(100, h.clock, false, 7)
  advanceSimulationClock(h.clock, 100, () => { sampleStep(h, [0, 0, 0, 0, 0, 0]) })
  h.diag.markUpdate(h.now())
  h.advance(3)
  h.diag.endFrame(h.now(), h.clock)
  h.set(500)
  h.diag.beginFrame(500, h.clock, false, 7)
  advanceSimulationClock(h.clock, 500, () => { throw new Error('paused gap ran a step') })
  h.diag.markUpdate(h.now())
  h.diag.endFrame(h.now(), h.clock)
  h.diag.requestFinish('test')
  const result = report(h)
  assert.equal(result.steps, 10)
  assert.equal(result.steady.updateMs.sum, 42)
  assert.equal(result.steady.drawSubmissionMs.sum, 8)
  assert.equal(result.steady.callbackMs.sum, 50)
  assert.equal(result.steady.objectVisits.sum, 70)
  assert.equal(result.steady.candidates.sum, 30)
  assert.equal(result.steady.elapsedMs.sum, 100)
  assert.equal(result.steady.admittedMs.sum, 100)
  assert.equal(result.steady.pausedMs.sum, 400)
  assert.deepEqual(result.clock, { elapsedMs: 100, pausedMs: 400, pendingMs: 0,
    observedElapsedMs: 100, observedPausedMs: 400 })
  assert.deepEqual(result.sampling.steady.slice(0, 6).map(hist => hist.sum), [1, 2, 3, 4, 5, 6])
  assert.equal(result.sampling.steady[6].sum, 21)
  assert.equal(result.sampling.count, 1)
  const second = traceRow(result, 1)
  assert.equal(second.gapMs, 80)
  assert.equal(second.previousCallbackMs, 47)
  assert.equal(second.residualMs, 33)
  assert.equal(traceRow(result, 2).pausedMs, 400)
})

test('final callback read includes diagnostics bookkeeping but submission ends at the supplied time', () => {
  const h = harness({ phaseSampleEvery: 0 })
  h.set(10)
  h.diag.beginFrame(10, h.clock, false, 0)
  h.set(12)
  h.diag.markUpdate(12)
  h.set(19)
  h.diag.endFrame(15, h.clock)
  h.diag.requestFinish('test')
  const result = report(h)
  assert.equal(result.steady.callbackMs.sum, 9)
  assert.equal(result.steady.updateMs.sum, 2)
  assert.equal(result.steady.drawSubmissionMs.sum, 3)
  assert.equal(result.steady.bookkeepingMs.sum, 4)
})

test('admitted time includes pending remainder and excludes a long paused gap', () => {
  const h = harness({ phaseSampleEvery: 0 })
  for (const at of [9, 19, 400]) {
    h.set(at)
    h.diag.beginFrame(at, h.clock, false, 1)
    advanceSimulationClock(h.clock, at, () => {
      h.diag.beginStep(1)
      h.diag.endStep(0)
    })
    h.diag.markUpdate(at)
    h.diag.endFrame(at, h.clock)
  }
  h.diag.requestFinish('test')
  const result = report(h)
  assert.equal(result.steady.admittedMs.sum, 19)
  assert.equal(result.steady.elapsedMs.sum, 10)
  assert.equal(result.steady.steps.sum, 1)
  assert.equal(result.steady.pausedMs.sum, 381)
  assert.deepEqual(result.trace.rows.map((_, i) => traceRow(result, i).admittedMs), [9, 10, 0])
  assert.equal(result.clock.pendingMs, 9)
})

test('fixed histogram bins preserve boundary counts, overflow, sum and maximum', () => {
  const h = harness({ phaseSampleEvery: 0 })
  const costs = [0, 1, 2, 3, 4, 8, 1001]
  for (let i = 0; i < costs.length; i += 1) {
    const arrival = (i + 1) * 1000
    h.set(arrival)
    h.diag.beginFrame(arrival, h.clock, false, 0)
    h.advance(costs[i])
    h.diag.markUpdate(h.now())
    h.diag.endFrame(h.now(), h.clock)
  }
  h.diag.requestFinish('test')
  const hist = report(h).steady.callbackMs
  assert.equal(hist.count, 7)
  assert.equal(hist.sum, 1019)
  assert.equal(hist.max, 1001)
  assert.equal(hist.invalid, 0)
  assert.deepEqual(hist.counts, [1, 1, 1, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1])
})

test('raw pointer activity groups short taps and moving input without altering gameplay', () => {
  const h = harness({ phaseSampleEvery: 0 })
  emptyFrame(h, 10)
  h.diag.pointer('down')
  h.diag.pointer('up')
  emptyFrame(h, 20)
  emptyFrame(h, 30, true)
  h.diag.pointer('move')
  h.diag.pointer('move')
  h.diag.pointer('cancel')
  h.diag.pointer('unknown')
  emptyFrame(h, 40)
  h.diag.requestFinish('test')
  const result = report(h)
  assert.deepEqual(result.input.counts, [1, 2, 1, 1, 1])
  assert.deepEqual(result.groups.map(group => group.callbackMs.count), [1, 2, 1])
  assert.deepEqual(result.trace.rows.map((_, i) => traceRow(result, i).group), [0, 1, 1, 2])
  assert.equal(traceRow(result, 1).down, 1)
  assert.equal(traceRow(result, 1).up, 1)
  assert.equal(traceRow(result, 3).move, 2)
  assert.equal(traceRow(result, 3).cancel, 1)
})

test('trace storage stays fixed and retains the last 64 chronological frames', () => {
  const h = harness({ phaseSampleEvery: 0 })
  const buffers = h.diag.trace.slice()
  for (let frame = 1; frame <= 130; frame += 1) emptyFrame(h, frame * 10)
  assert.equal(h.lines.length, 0)
  assert.equal(h.diag.trace.length, buffers.length)
  for (let col = 0; col < buffers.length; col += 1) {
    assert.equal(h.diag.trace[col], buffers[col])
    assert.equal(buffers[col].length, 64)
  }
  h.diag.requestFinish('test')
  const result = report(h)
  assert.equal(result.frames, 130)
  assert.equal(result.trace.rows.length, 64)
  assert.equal(traceRow(result, 0).frame, 67)
  assert.equal(traceRow(result, 63).frame, 130)
  assert.equal(result.steady.callbackMs.count, 130)
})

test('phase sampling starts on step 1 and repeats every 13 steps', () => {
  const h = harness()
  h.set(10)
  h.diag.beginFrame(10, h.clock, false, 1)
  const sampled = []
  for (let step = 1; step <= 40; step += 1) {
    if (sampleStep(h, [0, 0, 0, 0, 0, 0], 1, 2)) sampled.push(step)
  }
  h.diag.markUpdate(h.now())
  h.diag.endFrame(h.now(), h.clock)
  h.diag.requestFinish('test')
  assert.deepEqual(sampled, [1, 14, 27, 40])
  const result = report(h)
  assert.equal(result.sampling.count, 4)
  assert.equal(result.sampling.steady[0].count, 4)
  assert.equal(result.steady.objectVisits.sum, 40)
  assert.equal(result.steady.candidates.sum, 80)
})

test('frame-only mode makes no detailed step wall-clock reads', () => {
  const h = harness({ phaseSampleEvery: 0 })
  h.set(10)
  h.diag.beginFrame(10, h.clock, false, 1)
  const before = h.reads()
  for (let i = 0; i < 40; i += 1) assert.equal(sampleStep(h, [0, 0, 0, 0, 0, 0]), false)
  assert.equal(h.reads(), before)
  h.diag.markUpdate(h.now())
  h.diag.endFrame(h.now(), h.clock)
  h.diag.requestFinish('test')
  const result = report(h)
  assert.equal(result.sampling.every, 0)
  assert.equal(result.sampling.count, 0)
  assert.equal(result.sampling.steady[0].count, 0)
})

test('hot path avoids allocating helpers and retains preallocated measurement arrays', () => {
  const h = harness()
  const buffers = [h.diag.values, h.diag.sampleDurations, h.diag.framePointers, h.diag.pendingPointers]
  const saved = [Array.from, Object.assign, Math.round, Math.sqrt]
  const forbidden = () => { throw new Error('unexpected hot-path helper') }
  try {
    Array.from = forbidden
    Object.assign = forbidden
    Math.round = forbidden
    Math.sqrt = forbidden
    h.set(10)
    h.diag.pointer('down')
    h.diag.beginFrame(10, h.clock, true, 2)
    sampleStep(h)
    h.diag.markUpdate(h.now())
    h.diag.endFrame(h.now(), h.clock)
  } finally {
    ;[Array.from, Object.assign, Math.round, Math.sqrt] = saved
  }
  assert.equal(h.diag.values, buffers[0])
  assert.equal(h.diag.sampleDurations, buffers[1])
  assert.equal(h.diag.framePointers, buffers[2])
  assert.equal(h.diag.pendingPointers, buffers[3])
  const source = readFileSync(new URL('../zepp-app/shared/runtime-diagnostics.js', import.meta.url), 'utf8')
  const hot = source.slice(source.indexOf('  beginFrame('), source.indexOf('  requestFinish('))
  assert.doesNotMatch(hot, /new (?:Array|Object)|Array\.from|Object\.assign|Math\.(?:round|sqrt)|JSON\.|console\./)
  assert.equal(h.lines.length, 0)
})

test('terminal frame includes routing work and stays out of steady aggregates including phases', () => {
  const h = harness()
  emptyFrame(h, 10)
  h.set(20)
  h.diag.beginFrame(20, h.clock, true, 7)
  sampleStep(h)
  h.advance(100) // Synchronous storage / routing before markUpdate returns.
  h.diag.markUpdate(h.now())
  h.advance(10)
  h.diag.endFrame(h.now(), h.clock, true)
  const result = report(h)
  assert.equal(result.steady.callbackMs.count, 1)
  assert.equal(result.steady.callbackMs.sum, 0)
  assert.equal(result.terminal.callbackMs.count, 1)
  assert.equal(result.terminal.callbackMs.sum, 131)
  assert.equal(result.groups[1].callbackMs.count, 0)
  assert.equal(result.sampling.steady[0].count, 0)
  assert.equal(result.sampling.terminal[0].sum, 1)
  assert.equal(traceRow(result, 1).terminal, 1)
})

test('destroy during a callback defers export until endFrame and emits exactly once', () => {
  const h = harness()
  h.set(10)
  h.diag.beginFrame(10, h.clock, false, 0)
  h.diag.requestFinish('destroy')
  h.diag.requestFinish('later-reason')
  assert.equal(h.diag.enabled, true)
  assert.equal(h.lines.length, 0)
  h.advance(10)
  h.diag.markUpdate(h.now())
  h.diag.endFrame(h.now(), h.clock)
  const count = h.lines.length
  assert.equal(h.diag.enabled, false)
  h.diag.requestFinish('again')
  h.diag.endFrame(50, h.clock, true)
  h.diag.pointer('move')
  h.diag.beginFrame(60, h.clock, true, 4)
  assert.equal(h.diag.beginStep(4), false)
  assert.equal(h.lines.length, count)
  assert.equal(report(h).reason, 'destroy')
  assert.equal(report(h).terminal.callbackMs.sum, 10)
})

test('wall-clock rollback invalidates affected frame and phase timings without changing the game clock', () => {
  const h = harness()
  emptyFrame(h, 100)
  h.set(110)
  h.diag.beginFrame(110, h.clock, false, 2)
  assert.equal(h.diag.beginStep(2), true)
  h.set(109)
  h.diag.markStepPhase(0)
  for (let phase = 1; phase < 6; phase += 1) {
    h.set(110 + phase)
    h.diag.markStepPhase(phase)
  }
  h.diag.endStep(1)
  h.diag.markUpdate(h.now())
  h.diag.endFrame(h.now(), h.clock)
  emptyFrame(h, 120)
  h.diag.requestFinish('test')
  const result = report(h)
  assert.equal(result.anomalies.rollbackReads, 1)
  assert.equal(result.anomalies.invalidFrames, 1)
  assert.equal(result.steady.callbackMs.count, 2)
  assert.equal(result.steady.callbackMs.invalid, 1)
  assert.equal(result.sampling.steady[0].count, 0)
  assert.equal(result.sampling.steady[0].invalid, 1)
  assert.equal(traceRow(result, 1).callbackMs, null)
  assert.equal(traceRow(result, 2).previousCallbackMs, null)
  assert.deepEqual(h.clock, createSimulationClock(0))
})

test('calibration records clock rollback and invalid reads, and later invalid timestamps cannot corrupt histograms', () => {
  let reads = 0
  let wall = 10
  const lines = []
  const diag = new RuntimeDiagnostics({}, { now: () => {
    reads += 1
    if (reads === 2) return 9
    if (reads === 3) return NaN
    return wall
  }, emit: line => lines.push(line) })
  const clock = createSimulationClock(10)
  diag.beginFrame(NaN, clock, false, 0)
  diag.markUpdate(NaN)
  diag.endFrame(NaN, clock)
  wall = 20
  diag.requestFinish('test')
  const result = report({ lines })
  assert.equal(result.calibration.rollbacks, 1)
  assert.equal(result.calibration.invalidReads, 1)
  assert.equal(result.calibration.spanMs, null)
  assert.equal(result.anomalies.invalidFrames, 1)
  assert.equal(result.steady.callbackMs.count, 0)
  assert.equal(result.steady.callbackMs.invalid, 1)
  assert.equal(result.steady.callbackMs.sum, 0)
})

test('30-second wall limit exports after a complete frame, disables sampling, and reassembles metadata', () => {
  const h = harness({ phaseSampleEvery: 0, build: 'quoted " text \\ and unicode Ω',
    viewport: { width: 454, height: 454 }, timerRequestMs: 10, stepTimeMs: 10 })
  emptyFrame(h, 29999)
  assert.equal(h.lines.length, 0)
  emptyFrame(h, 30000)
  assert.equal(h.diag.enabled, false)
  const reads = h.reads()
  const count = h.lines.length
  emptyFrame(h, 40000)
  assert.equal(h.lines.length, count)
  assert.equal(h.reads(), reads)
  const result = report(h)
  assert.equal(result.reason, 'wall-time-limit')
  assert.equal(result.wallMs, 30000)
  assert.equal(result.frames, 2)
  assert.deepEqual(result.meta, h.diag.meta)
  assert.ok(h.lines.length > 1)
})

test('native-sized ASCII chunks round-trip quotes, backslashes and Unicode with histogram bins emitted once', () => {
  const special = '"\\'.repeat(200) + ' Ω 😀 \u007f '
  const h = harness({ phaseSampleEvery: 0, build: special, bins: ['metadata bins remain intact'] })
  emptyFrame(h, 10)
  emptyFrame(h, 20)
  h.diag.requestFinish('transport-test')
  const result = report(h)
  assert.equal(result.meta.build, special)
  assert.deepEqual(result.meta.bins, ['metadata bins remain intact'])
  assert.deepEqual(result.histogramBins, [0, 1, 2, 4, 8, 12, 16, 20, 25, 33, 50, 100, 250, 1000])
  assert.equal('bins' in result.steady.callbackMs, false)
  assert.equal('bins' in result.groups[0].callbackMs, false)
  assert.equal('bins' in result.sampling.steady[0], false)
  assert.equal(result.steady.callbackMs.counts.length, result.histogramBins.length + 1)
  assert.equal(result.steady.callbackMs.count, 2)
  assert.equal(result.steady.callbackMs.counts[0], 2)
  // The serializer must not mutate the in-memory histogram layout.
  assert.deepEqual(h.diag.steady.callbackMs.bins, result.histogramBins)
})
