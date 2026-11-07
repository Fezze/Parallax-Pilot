import test from 'node:test'
import assert from 'node:assert/strict'
import { RuntimeDiagnostics } from '../zepp-app/shared/runtime-diagnostics.js'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { decodeDiagnostics, traceCsv, writeDecodedDiagnostics } from '../scripts/decode-runtime-diagnostics.mjs'

const report = {
  schema: 1, runId: 'safe-run', frames: 2, steps: 4,
  clock: { observedElapsedMs: 31, observedPausedMs: 8 },
  steady: { callbackMs: { count: 2, sum: 10, max: 7 }, updateMs: { count: 2, sum: 6, max: 4 } },
  terminal: { drawSubmissionMs: { count: 1, sum: 2, max: 2 } },
  trace: { columns: ['frame', 'atMs', 'group', 'terminal', 'callbackMs'],
    rows: [[1, 10, 0, 0, 4], [2, 20, 1, 0, 6]] }
}

function linesFor(value, runId = 'r-1', size = 17) {
  const data = JSON.stringify(value)
  const pieces = []
  for (let i = 0; i < data.length; i += size) pieces.push(data.slice(i, i + size))
  return pieces.map((piece, i) => `PP_DIAG ${JSON.stringify({ runId, part: i + 1, total: pieces.length, data: piece })}`)
}

function compactRecords() {
  return [
    ['meta', [2, '2.3.28', 'native', 1, 13, 'motion', 'left', 1, 1, 390, 450, 1]],
    ['clock', [1250, 12, 36, 400, 850, 0, 'watch']],
    ...[[0, 12, 120, 30, 0, 25], [1, 11, 110, 28, 0, 25], [2, 11, 10, 3, 0, 2],
      [3, 12, 240, 40, 0, 50], [4, 12, 180, 35, 0, 50], [5, 12, 30, 8, 0, 12],
      [6, 12, 2, 1, 0, 2]].map(row => ['metric', row]),
    ['work', [12, 36, 5, 90, 20, 9, 1, 2]],
    ...[[0, 3, 8, 5, 0], [1, 3, 9, 6, 0], [2, 3, 10, 6, 0],
      [3, 3, 12, 7, 0], [4, 3, 15, 8, 0], [5, 3, 5, 3, 0]].map(row => ['phase', row]),
    ...[[0, 4, 4, 30, 12, 80, 15, 120], [1, 4, 4, 31, 13, 82, 16, 124],
      [2, 4, 4, 29, 11, 78, 14, 116]].map(row => ['group', row]),
    ['calibration', [64, 63, 63, null, 0, 0, 0]],
    ['terminal', [1, 12, 12, 5, 2, 3]],
    ['pair', [10, 100, 20, 18, 25, 15, 2, 3, 0]],
    ['pair', [11, 125, 25, 25, 30, 16, 3, 4, 0]]
  ]
}

function compactLines(records, runId = 'compact-run') {
  return records.map(([kind, data], index) => `PP_METRIC ${JSON.stringify({ r: runId, p: index + 1, t: records.length, k: kind, d: data })}`)
}

test('decodes plain and ANSI-decorated chunks with out-of-order delivery and duplicates', () => {
  const lines = linesFor(report)
  const ordered = [lines.at(-1), lines[0], lines[0], ...lines.slice(1, -1)]
  const transcript = ordered.map((line, i) => `${i % 2 ? '\u001b[36m' : ''}[DEBUG] ${line}${i % 2 ? '\u001b[0m' : ''}`).join('\n')
  const result = decodeDiagnostics(transcript)
  assert.deepEqual(result.reports, [report])
  assert.deepEqual(result.incomplete, [])
  assert.deepEqual(result.errors, [])
})

test('finds diagnostics inside nested escaped JSON-RPC messages', () => {
  const chunks = linesFor(report, 'rpc-run', 35)
  const transcript = JSON.stringify({ jsonrpc: '2.0', method: 'log', params: { message: chunks.join('\n') } })
  const result = decodeDiagnostics(`bridge: ${transcript}\n`)
  assert.deepEqual(result.reports, [report])
  assert.deepEqual(result.errors, [])
})

test('reports missing parts and rejects conflicting duplicate content or totals', () => {
  const chunks = linesFor(report, 'missing-run', 20)
  const partial = decodeDiagnostics(chunks.filter((_, i) => i !== 1).join('\n'))
  assert.equal(partial.reports.length, 0)
  assert.deepEqual(partial.incomplete[0], { runId: 'missing-run', received: chunks.length - 1,
    total: chunks.length, missing: [2] })

  const original = JSON.parse(chunks[0].slice('PP_DIAG '.length))
  const conflict = `PP_DIAG ${JSON.stringify({ ...original, data: `${original.data}x` })}`
  const conflictingData = decodeDiagnostics(`${chunks.join('\n')}\n${conflict}`)
  assert.equal(conflictingData.reports.length, 0)
  assert.match(conflictingData.errors[0].message, /Conflicting data/)

  const conflictingTotal = `PP_DIAG ${JSON.stringify({ ...original, total: original.total + 1 })}`
  const conflictingCount = decodeDiagnostics(`${chunks.join('\n')}\n${conflictingTotal}`)
  assert.equal(conflictingCount.reports.length, 0)
  assert.match(conflictingCount.errors[0].message, /Conflicting total/)
})

test('brace-like text and escaped quotes inside JSON strings do not truncate chunk payloads', () => {
  const weird = { ...report, caveat: 'literal } { and \\" quote plus PP_DIAG {"not":"a chunk"}' }
  const result = decodeDiagnostics(linesFor(weird, 'strings-run', 13).join('\n'))
  assert.deepEqual(result.reports, [weird])
})

test('writes safe filenames, numeric trace CSV, and observed timing summaries', async () => {
  const unsafe = { ...report, runId: '../../escape/name' }
  const decoded = { reports: [unsafe], incomplete: [{ runId: 'lost', received: 1, total: 2, missing: [2] }], errors: [] }
  const csv = traceCsv(unsafe)
  assert.equal(csv, 'frame,atMs,group,terminal,callbackMs\n1,10,0,0,4\n2,20,1,0,6\n')

  const dir = await mkdtemp(path.join(os.tmpdir(), 'pp-diag-decoder-'))
  try {
    const summary = await writeDecodedDiagnostics(decoded, dir)
    assert.equal(summary.counts.reports, 1)
    assert.equal(summary.counts.incomplete, 1)
    assert.ok(summary.files.every(file => !file.includes('/') && !file.includes('..')))
    assert.equal(await readFile(path.join(dir, summary.files.find(file => file.endsWith('.csv'))), 'utf8'), csv)
    assert.deepEqual(summary.reports[0].timings.steady.callbackMs,
      { count: 2, meanMs: 5, maxMs: 7 })
    assert.equal(summary.reports[0].observedClock.elapsedMs, 31)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('decodes compact records mixed with legacy reports inside escaped bridge output', () => {
  const compact = compactLines(compactRecords())
  const legacy = linesFor(report, 'legacy-run', 41)
  const ordered = [compact.at(-1), compact[0], compact[0], ...compact.slice(1, -1), ...legacy]
  const wrapper = JSON.stringify({ method: 'log', params: { message: ordered.join('\n') } })
  const result = decodeDiagnostics(`bridge ${wrapper}`)
  assert.deepEqual(result.errors, [])
  assert.deepEqual(result.incomplete, [])
  assert.equal(result.reports.length, 2)
  const compactReport = result.reports[0]
  assert.equal(compactReport.schema, 2)
  assert.deepEqual(compactReport.meta, { version: '2.3.28', deviceSource: 'native', runIndex: 1,
    phaseSampleEvery: 13, controlMode: 'motion', wristSide: 'left', timeScale: 1,
    spawnMultiplier: 1, width: 390, height: 450, modePersisted: 1 })
  assert.deepEqual(compactReport.steady.gapMs, { count: 12, sum: 120, max: 30, invalid: 0, p95UpperBin: 25 })
  assert.equal(compactReport.work.pausedFrameCount, 2)
  assert.equal(compactReport.sampling.steady[0].sum, 8)
  assert.equal(compactReport.groups[2].callbackSum, 116)
  assert.equal(compactReport.groups[2].callbackMean, 29)
  assert.equal(compactReport.groups[2].gapMean, 7.25)
  assert.deepEqual(compactReport.trace.columns,
    ['frame', 'atMs', 'gapMs', 'previousCallbackMs', 'callbackMs', 'updateMs', 'drawSubmissionMs', 'steps', 'pausedMs'])
  assert.deepEqual(compactReport.trace.rows, [[10, 100, 20, 18, 25, 15, 2, 3, 0], [11, 125, 25, 25, 30, 16, 3, 4, 0]])
  assert.equal('bins' in compactReport.steady.gapMs, false)
  assert.equal('damage' in compactReport, false)
  assert.equal('slowUpdates' in compactReport, false)
  assert.match(compactReport.caveats[0], /does not include full histograms/)
  assert.equal(result.reports[1].schema, 1)
})

test('keeps compact streams incomplete when chunks or required record kinds are missing', () => {
  const lines = compactLines(compactRecords(), 'compact-missing')
  const missingPart = decodeDiagnostics(lines.filter((_, index) => index !== 3).join('\n'))
  assert.equal(missingPart.reports.length, 0)
  assert.deepEqual(missingPart.incomplete[0], { runId: 'compact-missing', received: lines.length - 1,
    total: lines.length, missing: [4] })

  const noPhase = compactRecords().filter(([kind]) => kind !== 'phase')
  const missingRequired = decodeDiagnostics(compactLines(noPhase, 'no-required-phase').join('\n'))
  assert.equal(missingRequired.reports.length, 0)
  assert.match(missingRequired.errors[0].message, /Missing required phase:0/)
})

test('rejects compact conflicting chunks, totals, and invalid kind indexes without producing reports', () => {
  const lines = compactLines(compactRecords(), 'compact-conflict')
  const first = JSON.parse(lines[0].slice('PP_METRIC '.length))
  const altered = `PP_METRIC ${JSON.stringify({ ...first, d: [...first.d.slice(0, -1), 0] })}`
  const conflict = decodeDiagnostics(`${lines.join('\n')}\n${altered}`)
  assert.equal(conflict.reports.length, 0)
  assert.match(conflict.errors[0].message, /Conflicting compact record/)

  const changedTotal = `PP_METRIC ${JSON.stringify({ ...first, t: first.t + 1 })}`
  const totalConflict = decodeDiagnostics(`${lines.join('\n')}\n${changedTotal}`)
  assert.equal(totalConflict.reports.length, 0)
  assert.match(totalConflict.errors[0].message, /Conflicting total/)

  const invalidRecords = compactRecords()
  invalidRecords[2] = ['metric', [7, 1, 0, 0, 0, null]]
  const invalidIndex = decodeDiagnostics(compactLines(invalidRecords, 'bad-index').join('\n'))
  assert.equal(invalidIndex.reports.length, 0)
  assert.match(invalidIndex.errors[0].message, /Out-of-range metric index/)
})

test('compact trace exports only the paired numeric measurements', () => {
  const [line] = compactLines(compactRecords())
  const allLines = compactLines(compactRecords())
  const result = decodeDiagnostics(allLines.join('\n'))
  assert.equal(line.startsWith('PP_METRIC '), true)
  assert.equal(traceCsv(result.reports[0]),
    'frame,atMs,gapMs,previousCallbackMs,callbackMs,updateMs,drawSubmissionMs,steps,pausedMs\n10,100,20,18,25,15,2,3,0\n11,125,25,25,30,16,3,4,0\n')
})

test('compact slow updates keep the two worst valid steady updates across the run', () => {
  const lines = []
  let now = 1794046955289
  let reads = 0
  const stallFrame = {
    inputMs: 1, scanMs: 2, windowsMs: 3, quietMs: 4, stepsMs: 20, spawnMs: 6,
    contactMs: 7, materializeMs: 8, inbox: 9, commands: 10, blocks: 11,
    eventSteps: 12, contactChecks: 13, probeMs: 8, probeSteps: 5,
  }
  const meta = {
    compactExport: true, measureDamage: true, stallFrame, version: '2.3.37', deviceSource: 9568513,
    runIndex: 22, phaseSampleEvery: 0, controlMode: 'touch', wristSide: 'left',
    timeScale: 1, spawnMultiplier: 1.1, width: 480, height: 480, modePersisted: true,
  }
  const diagnostic = new RuntimeDiagnostics(meta, {
    now: () => { reads += 1; return now }, emit: line => lines.push(line),
  })
  const clock = { elapsedMs: 0, pausedMs: 0, pendingMs: 0 }
  for (let frame = 1; frame <= 71; frame += 1) {
    const arrival = now
    diagnostic.beginFrame(arrival, clock, false, 0)
    if (frame === 1) {
      meta.frameHit = true
      diagnostic.beginStep(0)
      diagnostic.recordSkippedSteps(5)
      for (let i = 0; i < 5; i += 1) diagnostic.recordContactProbe(4, 1)
      meta.clearWindows = 3
      meta.clearWindowQuanta = 24
    }
    if (frame === 70) {
      stallFrame.contactMs = -1
      stallFrame.contactChecks = 1e100
      stallFrame.probeMs = NaN
      stallFrame.probeSteps = 1e100
    }
    const update = frame === 1 ? 41 : frame === 2 ? 40 : frame === 3 ? 52 :
      frame === 70 ? 45 : frame === 71 ? 80 : 1
    now += update
    diagnostic.markUpdate(now)
    now += 4
    const drawComplete = frame === 3 ? NaN : now
    diagnostic.endFrame(drawComplete, clock, frame === 71)
    now = arrival + (frame === 20 || frame === 21 ? 65 : 60 + frame % 2)
  }

  assert.equal(reads, 64 + 71, 'retaining rows adds no clock reads')
  assert.equal(lines.length, 29)
  assert.ok(lines.every(line => line.length < 160 && /^[\x20-\x7e]+$/.test(line)))
  const result = decodeDiagnostics(lines.join('\n'))
  assert.deepEqual(result.errors, [])
  assert.deepEqual(result.incomplete, [])
  assert.ok(result.reports[0].trace.rows.every(row => row[0] !== 1))
  assert.equal(result.reports[0].work.probeQuanta, 5)
  assert.equal(result.reports[0].work.clearWindows, 3)
  assert.equal(result.reports[0].work.clearWindowQuanta, 24)
  assert.ok(result.reports[0].caveats.some(caveat => caveat.includes('including overlaps')))
  assert.equal(result.reports[0].work.objectVisitsSum, 20)
  assert.equal(result.reports[0].work.candidatesSum, 5)
  assert.deepEqual(result.reports[0].slowUpdates, [
    { frame: 70, incomingGapMs: 61, updateMs: 45, drawSubmissionMs: 4, nextGapMs: 60, logicalQuanta: 0,
      ...stallFrame, contactMs: null, contactChecks: 46654, probeMs: null, probeSteps: 46654, hit: false },
    { frame: 1, incomingGapMs: null, updateMs: 41, drawSubmissionMs: 4, nextGapMs: 61, logicalQuanta: 6,
      ...stallFrame, contactMs: 7, contactChecks: 13, probeMs: 8, probeSteps: 5, hit: true },
  ])
})

test('compact slow updates use null for a missing next arrival and reject malformed records', () => {
  const records = compactRecords()
  records[0][1][1] = '2.3.39'
  records.find(([kind]) => kind === 'work')[1].push(2, 8, 0, 20, 2)
  const packed = '0001' + 'zzz005002zzz000' + '000'.repeat(13) + '0'
  records.push(['stall', [packed]])
  const result = decodeDiagnostics(compactLines(records).join('\n'))
  assert.deepEqual(result.errors, [])
  assert.equal(result.reports[0].slowUpdates[0].nextGapMs, null)
  assert.equal('probeMs' in result.reports[0].slowUpdates[0], false)
  assert.equal('probeSteps' in result.reports[0].slowUpdates[0], false)
  assert.equal(result.reports[0].work.eventQuanta, 2)
  assert.equal('probeQuanta' in result.reports[0].work, false)

  records.push(['stall', [packed.slice(1)]])
  const malformed = decodeDiagnostics(compactLines(records).join('\n'))
  assert.equal(malformed.reports.length, 0)
  assert.match(malformed.errors[0].message, /Invalid stall record/)
})

test('compact work retains all earlier tuple lengths and rejects partial sweep counters', () => {
  const records = compactRecords()
  const work = records.find(([kind]) => kind === 'work')
  const complete = [...work[1], 2, 8, 3, 20, 2, 5, 7, 36]
  for (const length of [8, 11, 13, 14, 16]) {
    work[1] = complete.slice(0, length)
    const result = decodeDiagnostics(compactLines(records).join('\n'))
    assert.deepEqual(result.errors, [])
    const { work: decoded } = result.reports[0]
    assert.equal(decoded.fullMaterializations, length >= 11 ? 2 : undefined)
    assert.equal(decoded.skippedQuanta, length >= 13 ? 20 : undefined)
    assert.equal(decoded.probeQuanta, length >= 14 ? 5 : undefined)
    assert.equal('clearWindows' in decoded, length === 16)
    assert.equal('clearWindowQuanta' in decoded, length === 16)
    if (length === 16) {
      assert.equal(decoded.clearWindows, 7)
      assert.equal(decoded.clearWindowQuanta, 36)
    }
  }

  work[1] = complete.slice(0, 15)
  const malformed = decodeDiagnostics(compactLines(records).join('\n'))
  assert.equal(malformed.reports.length, 0)
  assert.match(malformed.errors[0].message, /Invalid work record/)
})

test('the real compact exporter round-trips boolean metadata, first-frame null timings and batching counts', () => {
  const lines = []
  let now = 1000
  const diagnostic = new RuntimeDiagnostics({
    compactExport: true, version: '2.3.32', deviceSource: 9568513, runIndex: 1,
    phaseSampleEvery: 0, controlMode: 'touch', wristSide: 'left',
    timeScale: 1, spawnMultiplier: 1.1, width: 480, height: 480,
    modePersisted: true, fullMaterializations: 2, fullAsteroidVisits: 8, sensorReads: 0,
    skippedQuanta: 20, eventQuanta: 2,
  }, { now: () => now, emit: line => lines.push(line) })
  const clock = { elapsedMs: 0, pausedMs: 0, pendingMs: 0 }
  diagnostic.beginFrame(now, clock, false, 4)
  now += 2; diagnostic.markUpdate(now)
  now += 3; diagnostic.endFrame(now, clock)
  diagnostic.requestFinish('test')
  assert.ok(lines.length <= 25)
  assert.ok(lines.every(line => line.length <= 160))
  const result = decodeDiagnostics(lines.join('\n'))
  assert.deepEqual(result.errors, [])
  assert.deepEqual(result.incomplete, [])
  assert.equal(result.reports.length, 1)
  const decoded = result.reports[0]
  assert.equal(decoded.meta.modePersisted, true)
  assert.equal(decoded.meta.deviceSource, 9568513)
  assert.equal(decoded.work.fullMaterializations, 2)
  assert.equal(decoded.work.fullAsteroidVisits, 8)
  assert.equal(decoded.work.skippedQuanta, 20)
  assert.equal(decoded.work.eventQuanta, 2)
  assert.equal(decoded.work.probeQuanta, 0)
  assert.equal(decoded.work.clearWindows, 0)
  assert.equal(decoded.work.clearWindowQuanta, 0)
  assert.match(decoded.caveats[1], /Analytic skips contribute logical steps only/)
  assert.equal(decoded.trace.rows[0][2], null)
})

test('compact collision timings distinguish the hit, next arrival, HUD draw and terminal work', () => {
  const lines = []
  let now = 1794046955289
  const meta = {
    compactExport: true, measureDamage: true, version: '2.3.37', deviceSource: 9568513, runIndex: 22,
    phaseSampleEvery: 0, controlMode: 'touch', wristSide: 'left',
    timeScale: 1, spawnMultiplier: 1.1, width: 480, height: 480, modePersisted: true,
  }
  const diagnostic = new RuntimeDiagnostics(meta, { now: () => now, emit: line => lines.push(line) })
  const clock = { elapsedMs: 0, pausedMs: 0, pendingMs: 0 }

  diagnostic.beginFrame(now, clock, false, 4)
  meta.frameHit = true
  meta.frameHud = true
  diagnostic.recordHaptic(now + 3, now + 28)
  now += 40
  diagnostic.markUpdate(now)
  now += 9
  diagnostic.endFrame(now, clock)

  now += 51
  diagnostic.beginFrame(now, clock, false, 4)
  assert.equal(meta.frameHit, false)
  assert.equal(meta.frameHud, false)
  meta.frameHud = true
  now += 7
  diagnostic.markUpdate(now)
  now += 5
  diagnostic.endFrame(now, clock)

  now += 8
  diagnostic.beginFrame(now, clock, false, 4)
  meta.frameHit = true
  diagnostic.recordHaptic(now + 2, now + 10)
  diagnostic.requestFinish('game-over')
  meta.scoreSaveMs = 78
  meta.resultsRouteMs = 114
  meta.foldedSwipeMoves = 32
  now += 207
  diagnostic.markUpdate(now)
  diagnostic.endFrame(now, clock)

  assert.ok(lines.length <= 27)
  assert.ok(lines.every(line => line.length <= 160))
  const result = decodeDiagnostics(lines.join('\n'))
  assert.deepEqual(result.errors, [])
  assert.deepEqual(result.incomplete, [])
  assert.equal(result.reports[0].work.foldedSwipeMoves, 32)
  assert.deepEqual(result.reports[0].damage, {
    hitUpdateMs: { count: 1, sum: 40, max: 40 },
    afterHitGapMs: { count: 1, sum: 100, max: 100 },
    afterHitResidualMs: { count: 1, sum: 51, max: 51 },
    hudDrawMs: { count: 2, sum: 14, max: 9 },
    hapticMs: { count: 2, sum: 33, max: 25 },
    scoreSaveMs: 78,
    resultsRouteMs: 114,
  })
})
