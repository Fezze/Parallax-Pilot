import test from 'node:test'
import assert from 'node:assert/strict'
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
