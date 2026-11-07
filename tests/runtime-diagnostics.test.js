import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { RuntimeDiagnostics } from '../zepp-app/shared/runtime-diagnostics.js'
import { advanceSimulationClock, createSimulationClock } from '../zepp-app/shared/simulation-clock.js'
import { CONTROL_MODES, WRIST_SIDES, TIME_SCALE_OPTIONS, SPAWN_MULTIPLIER_OPTIONS } from '../zepp-app/shared/constants.js'

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

function compactReport(h) {
  assert.ok(h.lines.length > 0 && h.lines.length <= 25)
  return h.lines.map((line, index) => {
    assert.ok(line.startsWith('PP_METRIC '))
    assert.ok(line.length <= 160, `oversized compact record (${line.length}): ${line}`)
    assert.match(line, /^[\x20-\x7e]+$/)
    const record = JSON.parse(line.slice(10))
    assert.equal(record.r, h.diag.runId)
    assert.equal(record.p, index + 1)
    assert.equal(record.t, h.lines.length)
    return record
  })
}

test('compact export preserves summary measurements and bounded representative callback pairs', () => {
  const metadata = { version: '2.3.30', deviceSource: 9568513, runIndex: 2,
    phaseSampleEvery: 1, controlMode: 'touch', wristSide: 'right', timeScale: 1.5,
    spawnMultiplier: 1.25, width: 480, height: 480, modePersisted: true,
    fullMaterializations: 144, fullAsteroidVisits: 536, sensorReads: 0, skippedQuanta: 820, eventQuanta: 100 }
  const full = harness(metadata)
  const compact = harness({ ...metadata, compactExport: true })
  for (const h of [full, compact]) {
    h.diag.runId = '1762358400000-12'
    h.set(10)
    h.diag.beginFrame(10, h.clock, true, 7)
    sampleStep(h)
    h.diag.markUpdate(h.now())
    h.advance(4)
    h.diag.endFrame(h.now(), h.clock)
    for (const arrival of [3010, 4010, 4020, 4030]) emptyFrame(h, arrival)
    emptyFrame(h, 4040, false, true)
  }
  const expected = report(full)
  const records = compactReport(compact)
  assert.equal(records.length, 25)
  const one = kind => records.find(record => record.k === kind).d
  assert.deepEqual(one('meta'), [2, '2.3.30', 9568513, 2, 1, 'touch', 'right', 1.5, 1.25, 480, 480, true])
  assert.deepEqual(one('clock'), [4040, 6, 1, 0, 0, 0, 'terminal'])
  const names = ['gapMs', 'previousCallbackMs', 'residualMs', 'callbackMs', 'updateMs', 'drawSubmissionMs', 'bookkeepingMs']
  const metrics = records.filter(record => record.k === 'metric')
  assert.equal(metrics.length, names.length)
  metrics.forEach((record, index) => {
    const hist = expected.steady[names[index]]
    assert.deepEqual(record.d.slice(0, 5), [index, hist.count, hist.sum, hist.max, hist.invalid])
  })
  assert.equal(metrics[0].d[5], null, 'p95 overflow has no finite upper bound')
  assert.equal(metrics[3].d[5], 25)
  assert.deepEqual(one('work'), [5, 1, 1, 7, 3, 7, 4, 0, 144, 536, 0, 820, 100])
  const phases = records.filter(record => record.k === 'phase')
  assert.equal(phases.length, 6)
  phases.forEach((record, index) => assert.deepEqual(record.d, [index, 1, index + 1, index + 1, 0]))
  records.filter(record => record.k === 'group').forEach((record, index) => {
    const group = expected.groups[index]
    assert.deepEqual(record.d, [index, group.callbackMs.count, group.gapMs.count, group.gapMs.sum,
      group.gapMs.max, group.updateMs.sum, group.drawSubmissionMs.sum, group.callbackMs.sum])
  })
  assert.deepEqual(one('calibration'), [64, 0, 63, null, 0, 0, 0])
  assert.deepEqual(records.filter(record => record.k === 'pair').map(record => record.d[0]), [5, 6, 2, 3])
  const columns = ['frame', 'atMs', 'gapMs', 'previousCallbackMs', 'callbackMs', 'updateMs', 'drawSubmissionMs', 'steps', 'pausedMs']
  records.filter(record => record.k === 'pair').forEach(record => {
    const row = expected.trace.rows.find(row => row[0] === record.d[0])
    assert.deepEqual(record.d, columns.map(name => row[expected.trace.columns.indexOf(name)]))
  })
  assert.deepEqual(one('terminal'), [1, 0, 0, 0, 0, 0])
  assert.equal(compact.reads(), full.reads(), 'export choice adds no clock reads')
  const readCount = compact.reads()
  emptyFrame(compact, 5000)
  assert.equal(compact.reads(), readCount)
  assert.equal(compact.lines.length, 25)
})

test('compact records stay native-sized for all supported control, wrist and speed settings', () => {
  for (const controlMode of CONTROL_MODES) for (const wristSide of WRIST_SIDES) {
    for (const timeScale of TIME_SCALE_OPTIONS) for (const spawnMultiplier of SPAWN_MULTIPLIER_OPTIONS) {
      const h = harness({ compactExport: true, version: '2.3.30', deviceSource: 9568513,
        runIndex: 12345, phaseSampleEvery: 13, controlMode, wristSide, timeScale,
        spawnMultiplier, width: 480, height: 480, modePersisted: false,
        fullMaterializations: 144, fullAsteroidVisits: 536, sensorReads: 920,
        skippedQuanta: 820, eventQuanta: 100 })
      h.diag.runId = '1762358400000-12345'
      emptyFrame(h, 30000)
      const records = compactReport(h)
      assert.equal(records.length, 22)
      assert.equal(records.filter(record => record.k === 'pair').length, 1)
      assert.equal(records.find(record => record.k === 'metric' && record.d[0] === 0).d[5], null)
      assert.deepEqual(records.find(record => record.k === 'work').d.slice(8), [144, 536, 920, 820, 100])
    }
  }
})

test('compact export escapes Unicode and deduplicates latest and largest-gap rows', () => {
  const h = harness({ compactExport: true, version: 'Ω', phaseSampleEvery: 0 })
  emptyFrame(h, 10)
  emptyFrame(h, 20)
  h.diag.requestFinish('done')
  const records = compactReport(h)
  assert.equal(records.find(record => record.k === 'meta').d[1], 'Ω')
  assert.equal(records.filter(record => record.k === 'pair').length, 2)
})

test('deferred export keeps the terminal callback timestamp and includes later result timings', () => {
  const h = harness({ compactExport: true, measureDamage: true, phaseSampleEvery: 0 })
  emptyFrame(h, 10)
  h.set(20)
  h.diag.beginFrame(20, h.clock, false, 0)
  h.diag.meta.deferExport = true
  h.diag.requestFinish('game-over')
  h.set(23)
  h.diag.markUpdate(23)
  h.set(24)
  h.diag.endFrame(24, h.clock, true)
  h.diag.requestFinish('destroy')
  const reads = h.reads()
  emptyFrame(h, 500)
  assert.equal(h.diag.enabled, true)
  assert.equal(h.lines.length, 0)
  h.diag.meta.scoreSaveMs = 7
  h.diag.meta.resultsRouteMs = 12
  h.diag.finishDeferred()
  assert.equal(h.diag.enabled, false)
  assert.equal(h.reads(), reads)
  const records = compactReport(h)
  const one = kind => records.find(record => record.k === kind).d
  assert.deepEqual(one('clock'), [24, 2, 0, 0, 0, 0, 'game-over'])
  assert.deepEqual(one('terminal'), [1, 4, 4, 3, 1, 0])
  assert.deepEqual(one('impact').slice(6), [7, 12, 0])
  h.diag.finishDeferred()
  assert.equal(h.lines.length, records.length)
})

test('releasing a deferred export during a callback still includes the complete terminal frame', () => {
  const h = harness({ measureDamage: true, phaseSampleEvery: 0 })
  h.set(20)
  h.diag.beginFrame(20, h.clock, false, 0)
  h.diag.meta.deferExport = true
  h.diag.requestFinish('game-over')
  h.diag.requestFinish('destroy')
  h.diag.meta.scoreSaveMs = 5
  h.diag.finishDeferred()
  assert.equal(h.lines.length, 0)
  h.set(30)
  h.diag.markUpdate(30)
  h.diag.endFrame(30, h.clock, true)
  const result = report(h)
  assert.equal(result.reason, 'game-over')
  assert.equal(result.wallMs, 30)
  assert.equal(result.terminal.callbackMs.sum, 10)
  assert.equal(result.damage.scoreSaveMs, 5)
  assert.equal(result.damage.resultsRouteMs, null)
})

test('skipped logical quanta preserve work totals while compact phases follow executed steps', () => {
  const full = harness({ phaseSampleEvery: 3 })
  const compact = harness({ phaseSampleEvery: 3, compactExport: true })
  for (const h of [full, compact]) {
    const initialReads = h.reads()
    h.diag.recordSkippedSteps(10)
    assert.equal(h.diag.stepCount, 0, 'inactive skips are ignored')
    h.set(10)
    h.diag.beginFrame(10, h.clock, false, 7)
    for (const invalid of [0, -1, NaN, Infinity, 1.5]) h.diag.recordSkippedSteps(invalid)
    assert.equal(h.diag.stepCount, 0)
    h.diag.recordSkippedSteps(3)
    assert.equal(h.reads(), initialReads, 'skipping makes no clock observations')
    assert.equal(h.diag.sampleCount, 0)
    assert.equal(sampleStep(h), true, 'the first executed compact step and logical legacy step 4 are sampled')
    h.diag.recordSkippedSteps(2)
    assert.equal(sampleStep(h), h === full, 'compact execution 2 is unsampled; legacy logical step 7 is sampled')
    h.clock.elapsedMs = 70
    h.diag.markUpdate(h.now())
    h.diag.endFrame(h.now(), h.clock)
    h.set(500)
    h.diag.beginFrame(500, h.clock, false, 7)
    h.clock.pausedMs = 430
    h.diag.markUpdate(500)
    h.diag.endFrame(500, h.clock)
    h.set(510)
    h.diag.beginFrame(510, h.clock, true, 7)
    h.diag.recordSkippedSteps(3)
    h.clock.elapsedMs = 100
    h.diag.markUpdate(510)
    h.diag.endFrame(510, h.clock, true)
    h.diag.recordSkippedSteps(10)
    assert.equal(h.diag.stepCount, 10, 'disabled skips are ignored')
    assert.equal(h.diag.sampleCount, h === full ? 2 : 1, 'compact samples are independent of skipped logical quanta')
    assert.equal(h.diag.executedStepCount, 2)
  }
  const expected = report(full)
  const records = compactReport(compact)
  assert.equal(expected.steps, 10)
  assert.equal(expected.clock.elapsedMs, 100)
  assert.deepEqual(expected.trace.rows.map(row => row[expected.trace.columns.indexOf('steps')]), [7, 0, 3])
  assert.deepEqual(records.find(record => record.k === 'clock').d.slice(1, 6), [3, 10, 100, 430, 0])
  assert.deepEqual(records.find(record => record.k === 'work').d, [2, 7, 7, 14, 6, 7, 1, 1, 0, 0, 0, 0, 0])
  assert.deepEqual(records.find(record => record.k === 'terminal').d, [1, 0, 0, 0, 0, 3])
  for (const collection of ['steady', 'terminal']) {
    for (const name of Object.keys(compact.diag[collection])) {
      for (const field of ['count', 'sum', 'max', 'invalid']) {
        assert.equal(compact.diag[collection][name][field], full.diag[collection][name][field], `${collection}.${name}.${field}`)
      }
    }
  }
  records.filter(record => record.k === 'phase').forEach((record, index) => {
    assert.deepEqual(record.d, [index, 1, index + 1, index + 1, 0])
  })
  assert.deepEqual(compact.diag.steady.callbackMs.counts, full.diag.steady.callbackMs.counts, 'timing p95 retains full bins')
  assert.equal(full.diag.steady.steps.counts.reduce((sum, count) => sum + count, 0), 2, 'legacy work bins remain complete')
  assert.equal(compact.diag.steady.steps.counts[0], 1, 'compact work retains exact zero counts')
  assert.equal(compact.diag.steady.steps.counts.length, 1, 'compact work stores only the zero bin')
  assert.equal(compact.diag.steady.elapsedMs, undefined)
  assert.equal(compact.diag.groups[0].callbackMs.counts, null)
  assert.equal(compact.diag.phases[0].counts, undefined)
  assert.equal(compact.diag.trace.length, 9)
})

test('compact scalar accumulation preserves invalid observations without creating zero counts', () => {
  const full = harness()
  const compact = harness({ compactExport: true })
  for (const h of [full, compact]) {
    h.set(10)
    h.diag.beginFrame(10, h.clock, false, 0)
    h.clock.elapsedMs = NaN
    h.clock.pausedMs = NaN
    h.diag.markUpdate(10)
    h.diag.endFrame(10, h.clock)
    h.diag.requestFinish('invalid-clock')
  }
  for (const name of ['elapsedMs', 'pausedMs', 'admittedMs']) {
    for (const target of [full.diag.steady, full.diag.groups[0]]) {
      assert.equal(target[name].invalid, 1)
      assert.equal(target[name].count, 0)
      assert.equal(target[name].counts[0], 0)
    }
  }
  const paused = compact.diag.steady.pausedMs
  assert.equal(paused.invalid, 1)
  assert.equal(paused.count, 0)
  assert.equal(paused.counts[0], 0)
  assert.equal(compact.diag.steady.elapsedMs, undefined)
  assert.equal(compact.diag.steady.admittedMs, undefined)
  assert.equal(compact.diag.groups[0].pausedMs, undefined)
  const records = compactReport(compact)
  assert.equal(records.find(record => record.k === 'work').d[7], 0)
})

test('compact phase cadence samples rare canonical events even when logical indices all miss modulo 13', () => {
  const h = harness({ compactExport: true, phaseSampleEvery: 13 })
  h.set(10)
  h.diag.beginFrame(10, h.clock, false, 7)
  const sampledEvents = []
  for (let executed = 1; executed <= 14; executed += 1) {
    const reads = h.reads()
    h.diag.recordSkippedSteps(12)
    assert.equal(h.reads(), reads)
    assert.equal(h.diag.stepCount % 13, 12, 'legacy logical cadence would miss every event after incrementing stepCount')
    if (sampleStep(h, [0, 0, 0, 0, 0, 0])) sampledEvents.push(executed)
  }
  h.clock.elapsedMs = 1820
  h.diag.markUpdate(10)
  h.diag.endFrame(10, h.clock)
  h.diag.requestFinish('event-cadence')
  assert.deepEqual(sampledEvents, [1, 14])
  assert.equal(h.diag.stepCount, 182)
  assert.equal(h.diag.executedStepCount, 14)
  assert.equal(h.diag.sampleCount, 2)
  const records = compactReport(h)
  assert.equal(records.find(record => record.k === 'clock').d[2], 182)
  assert.deepEqual(records.find(record => record.k === 'work').d.slice(0, 8), [1, 182, 182, 98, 42, 7, 0, 0])
  records.filter(record => record.k === 'phase').forEach((record, index) => assert.deepEqual(record.d, [index, 2, 0, 0, 0]))
  assert.equal(records.find(record => record.k === 'pair').d[7], 182)
})
