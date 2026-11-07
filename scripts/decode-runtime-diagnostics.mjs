import { readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { SLOW_UPDATE_FIELDS } from '../zepp-app/shared/runtime-diagnostics.js'

const MARKER = 'PP_DIAG '
const METRIC_MARKER = 'PP_METRIC '
const MAX_SCAN_DEPTH = 12
const MAX_SCAN_NODES = 20000
const MAX_CHUNK_PARTS = 100000

function decodeJsonAt(text, start) {
  let depth = 0
  let inString = false
  let escaped = false
  let began = false
  for (let i = start; i < text.length; i += 1) {
    const char = text[i]
    if (!began) {
      if (/\s/.test(char)) continue
      if (char !== '{') return null
      began = true
      depth = 1
      continue
    }
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        const raw = text.slice(start, i + 1)
        try { return { value: JSON.parse(raw), end: i + 1 } } catch { return null }
      }
    }
  }
  return null
}

function scanMarkerPayloads(text, receiveLegacy, receiveCompact) {
  let from = 0
  while (from < text.length) {
    const legacyAt = text.indexOf(MARKER, from)
    const compactAt = text.indexOf(METRIC_MARKER, from)
    if (legacyAt < 0 && compactAt < 0) break
    const isCompact = compactAt >= 0 && (legacyAt < 0 || compactAt < legacyAt)
    const at = isCompact ? compactAt : legacyAt
    const marker = isCompact ? METRIC_MARKER : MARKER
    const parsed = decodeJsonAt(text, at + marker.length)
    if (parsed) (isCompact ? receiveCompact : receiveLegacy)(parsed.value)
    from = at + marker.length
  }
}

/** Decode complete reports from console, ANSI-decorated, or nested JSON-RPC logs. */
export function decodeDiagnostics(text) {
  const partsByRun = new Map()
  const errors = []
  const visited = new WeakSet()
  let nodes = 0

  function recordError(message, runId = null) {
    errors.push({ runId, message })
  }

  function stateFor(runId, format, total) {
    const key = String(runId)
    let state = partsByRun.get(key)
    if (!state) {
      state = { format, total, chunks: new Map(), conflict: false }
      partsByRun.set(key, state)
    }
    if (state.format !== format) {
      if (!state.conflict) recordError('Conflicting diagnostic formats for run', key)
      state.conflict = true
      return null
    }
    if (state.total !== total) {
      if (!state.conflict) recordError('Conflicting total for run', key)
      state.conflict = true
      return null
    }
    return state
  }

  function receiveLegacy(chunk) {
    if (!chunk || typeof chunk !== 'object' || Array.isArray(chunk)) return
    const { runId, part, total, data } = chunk
    if ((typeof runId !== 'string' && typeof runId !== 'number') || String(runId).length === 0 ||
        !Number.isInteger(part) || !Number.isInteger(total) || total < 1 || total > MAX_CHUNK_PARTS ||
        part < 1 || part > total || typeof data !== 'string') {
      recordError('Invalid diagnostic chunk envelope', runId ?? null)
      return
    }
    const key = String(runId)
    const state = stateFor(runId, 'legacy', total)
    if (!state) return
    const prior = state.chunks.get(part)
    if (prior !== undefined && prior !== data) {
      if (!state.conflict) recordError(`Conflicting data for part ${part}`, key)
      state.conflict = true
      return
    }
    if (prior === undefined) state.chunks.set(part, data)
  }

  function receiveCompact(chunk) {
    if (!chunk || typeof chunk !== 'object' || Array.isArray(chunk)) return
    const { r: runId, p: part, t: total, k: kind, d: data } = chunk
    if ((typeof runId !== 'string' && typeof runId !== 'number') || String(runId).length === 0 ||
        !Number.isInteger(part) || !Number.isInteger(total) || total < 1 || total > MAX_CHUNK_PARTS ||
        part < 1 || part > total || typeof kind !== 'string' || !Array.isArray(data)) {
      recordError('Invalid compact diagnostic record', runId ?? null)
      if ((typeof runId === 'string' || typeof runId === 'number') && String(runId).length > 0 &&
          Number.isInteger(total) && total > 0 && total <= MAX_CHUNK_PARTS) {
        const state = stateFor(runId, 'compact', total)
        if (state) state.conflict = true
      }
      return
    }
    const state = stateFor(runId, 'compact', total)
    if (!state) return
    const encoded = JSON.stringify({ kind, data })
    const prior = state.chunks.get(part)
    if (prior !== undefined && prior.encoded !== encoded) {
      if (!state.conflict) recordError(`Conflicting compact record ${part}`, String(runId))
      state.conflict = true
      return
    }
    if (prior === undefined) state.chunks.set(part, { kind, data, encoded })
  }

  function visit(value, depth = 0) {
    nodes += 1
    if (nodes > MAX_SCAN_NODES) {
      if (nodes === MAX_SCAN_NODES + 1) recordError('Input exceeded JSON traversal limit')
      return
    }
    if (typeof value === 'string') {
      scanMarkerPayloads(value, receiveLegacy, receiveCompact)
      if (depth < MAX_SCAN_DEPTH) {
        // Bridge transcripts often prefix or suffix a JSON-RPC object with log text.
        // Parse complete object spans so escaped message strings can be inspected
        // after JSON has unescaped them.
        for (let i = 0; i < value.length && nodes < MAX_SCAN_NODES; i += 1) {
          if (value[i] !== '{') continue
          const embedded = decodeJsonAt(value, i)
          if (embedded) {
            visit(embedded.value, depth + 1)
            i = embedded.end - 1
          }
        }
        try {
          const nested = JSON.parse(value)
          if (nested !== value) visit(nested, depth + 1)
        } catch { /* Ordinary log strings are expected. */ }
      }
      return
    }
    if (!value || typeof value !== 'object' || depth >= MAX_SCAN_DEPTH || visited.has(value)) return
    visited.add(value)
    for (const child of Array.isArray(value) ? value : Object.values(value)) visit(child, depth + 1)
  }

  visit(String(text))
  const reports = []
  const incomplete = []
  for (const [runId, state] of partsByRun) {
    if (state.conflict) continue
    const missing = []
    for (let part = 1; part <= state.total; part += 1) if (!state.chunks.has(part)) missing.push(part)
    if (missing.length) {
      incomplete.push({ runId, received: state.chunks.size, total: state.total, missing })
      continue
    }
    if (state.format === 'compact') {
      try {
        reports.push(assembleCompact(runId, state.chunks))
      } catch (error) {
        recordError(`Invalid compact report: ${error.message}`, runId)
      }
      continue
    }
    const data = Array.from({ length: state.total }, (_, i) => state.chunks.get(i + 1)).join('')
    try {
      const report = JSON.parse(data)
      if (!report || typeof report !== 'object' || Array.isArray(report)) throw new Error('Report is not an object')
      reports.push(report)
    } catch (error) {
      recordError(`Could not parse assembled report: ${error.message}`, runId)
    }
  }
  return { reports, incomplete, errors }
}

const METRIC_NAMES = ['gapMs', 'previousCallbackMs', 'residualMs', 'callbackMs', 'updateMs', 'drawSubmissionMs', 'bookkeepingMs']
const PHASE_NAMES = ['controlGeometryDifficulty', 'spawn', 'moveGrid', 'candidates', 'collisionDamage', 'hud']
const GROUP_NAMES = ['idle', 'heldOrTransition', 'moving']
const TRACE_COLUMNS = ['frame', 'atMs', 'gapMs', 'previousCallbackMs', 'callbackMs', 'updateMs', 'drawSubmissionMs', 'steps', 'pausedMs']

function isFiniteNumber(value) { return typeof value === 'number' && Number.isFinite(value) }

function requireRecord(records, kind) {
  if (!records.has(kind)) throw new Error(`Missing required ${kind} record`)
  return records.get(kind)
}

function validateTuple(tuple, length, label, nullable = []) {
  if (!Array.isArray(tuple) || tuple.length !== length) throw new Error(`Invalid ${label} record length`)
  for (let i = 0; i < tuple.length; i += 1) {
    if (nullable.includes(i) && tuple[i] === null) continue
    if (label === 'meta' && i === 11 && typeof tuple[i] === 'boolean') continue
    if (typeof tuple[i] !== 'string' && !isFiniteNumber(tuple[i])) throw new Error(`Invalid ${label} value at ${i}`)
  }
}

function decodeSlowUpdate(data) {
  const [packed] = data
  const expectedLength = 4 + (SLOW_UPDATE_FIELDS.length - 2) * 3 + 1
  if (data.length !== 1 || typeof packed !== 'string' || packed.length !== expectedLength ||
      !/^[0-9a-z]+[01]$/.test(packed)) throw new Error('Invalid stall record')
  const row = { frame: Number.parseInt(packed.slice(0, 4), 36) }
  for (let i = 1; i < SLOW_UPDATE_FIELDS.length - 1; i += 1) {
    const offset = 4 + (i - 1) * 3
    const digits = packed.slice(offset, offset + 3)
    row[SLOW_UPDATE_FIELDS[i]] = digits === 'zzz' ? null : Number.parseInt(digits, 36)
  }
  if (row.frame === 0 || row.updateMs === null || row.logicalQuanta === null) {
    throw new Error('Missing stall frame, update or logical quanta')
  }
  row.hit = packed[packed.length - 1] === '1'
  return row
}

function assembleCompact(runId, chunks) {
  const records = new Map()
  const pairs = []
  const slowUpdates = []
  const putIndexed = (kind, data, limit, length) => {
    validateTuple(data, length, kind, kind === 'metric' ? [5] : [])
    const index = data[0]
    if (!Number.isInteger(index) || index < 0 || index >= limit) throw new Error(`Out-of-range ${kind} index`)
    const key = `${kind}:${index}`
    if (records.has(key)) throw new Error(`Duplicate ${kind} index ${index}`)
    records.set(key, data)
  }
  for (let part = 1; part <= chunks.size; part += 1) {
    const record = chunks.get(part)
    if (!record) throw new Error(`Missing compact record ${part}`)
    const { kind, data } = record
    if (kind === 'meta') {
      validateTuple(data, 12, kind, [2])
      if (records.has(kind)) throw new Error('Duplicate meta record')
      records.set(kind, data)
    } else if (kind === 'clock') {
      validateTuple(data, 7, kind, [0])
      if (records.has(kind)) throw new Error('Duplicate clock record')
      records.set(kind, data)
    } else if (kind === 'metric') putIndexed(kind, data, METRIC_NAMES.length, 6)
    else if (kind === 'phase') putIndexed(kind, data, PHASE_NAMES.length, 5)
    else if (kind === 'group') putIndexed(kind, data, GROUP_NAMES.length, 8)
    else if (kind === 'work' || kind === 'calibration' || kind === 'terminal') {
      const expected = { work: [8, 11, 13].includes(data.length) ? data.length : 8, calibration: 7, terminal: 6 }[kind]
      validateTuple(data, expected, kind, kind === 'calibration' ? [1, 3] : [])
      if (records.has(kind)) throw new Error(`Duplicate ${kind} record`)
      records.set(kind, data)
    } else if (kind === 'pair') {
      validateTuple(data, 9, kind, [1, 2, 3, 4, 5, 6])
      if (pairs.length >= 4) throw new Error('Too many pair records')
      pairs.push(data)
    } else if (kind === 'stall') {
      if (slowUpdates.length >= 2) throw new Error('Too many stall records')
      slowUpdates.push(decodeSlowUpdate(data))
    } else if (kind === 'damage' || kind === 'impact') {
      const nullable = kind === 'impact' ? [6, 7] : []
      validateTuple(data, 9, kind, nullable)
      if (data.some((value, index) => !(value === null && nullable.includes(index)) &&
        (!isFiniteNumber(value) || value < 0))) throw new Error(`Invalid ${kind} duration`)
      if (records.has(kind)) throw new Error(`Duplicate ${kind} record`)
      records.set(kind, data)
    } else throw new Error(`Unknown compact record kind ${kind}`)
  }
  const meta = requireRecord(records, 'meta')
  if (meta[0] !== 2) throw new Error('Unsupported compact schema version')
  const clock = requireRecord(records, 'clock')
  const work = requireRecord(records, 'work')
  const calibration = requireRecord(records, 'calibration')
  const terminal = requireRecord(records, 'terminal')
  const damage = records.get('damage')
  const impact = records.get('impact')
  if (Boolean(damage) !== Boolean(impact)) throw new Error('Missing compact damage or impact record')
  const duration = (row, index) => ({ count: row[index], sum: row[index + 1], max: row[index + 2] })
  const metrics = METRIC_NAMES.map((_, index) => requireRecord(records, `metric:${index}`))
  const phases = PHASE_NAMES.map((_, index) => requireRecord(records, `phase:${index}`))
  const groups = GROUP_NAMES.map((_, index) => requireRecord(records, `group:${index}`))
  const histograms = Object.fromEntries(metrics.map((row, index) => [METRIC_NAMES[index],
    { count: row[1], sum: row[2], max: row[3], invalid: row[4], p95UpperBin: row[5] }]))
  const phaseSummaries = phases.map(row => ({ count: row[1], sum: row[2], max: row[3], invalid: row[4] }))
  const mean = (sum, count) => count > 0 ? sum / count : null
  const groupSummaries = groups.map(row => ({ name: GROUP_NAMES[row[0]], callbackCount: row[1], gapCount: row[2],
    gapSum: row[3], gapMean: mean(row[3], row[2]), gapMax: row[4], updateSum: row[5],
    updateMean: mean(row[5], row[1]), drawSubmissionSum: row[6], drawSubmissionMean: mean(row[6], row[1]),
    callbackSum: row[7], callbackMean: mean(row[7], row[1]) }))
  return {
    schema: 2, runId, meta: { version: meta[1], deviceSource: meta[2], runIndex: meta[3], phaseSampleEvery: meta[4],
      controlMode: meta[5], wristSide: meta[6], timeScale: meta[7], spawnMultiplier: meta[8],
      width: meta[9], height: meta[10], modePersisted: meta[11] },
    clock: { wallMs: clock[0], frames: clock[1], steps: clock[2], elapsedMs: clock[3], pausedMs: clock[4], pendingMs: clock[5], reason: clock[6] },
    steady: histograms,
    work: { stepCount: work[0], stepsSum: work[1], stepsMax: work[2], objectVisitsSum: work[3], candidatesSum: work[4],
      asteroidsMax: work[5], zeroStepFrames: work[6], pausedFrameCount: work[7],
      fullMaterializations: work[8], fullAsteroidVisits: work[9], sensorReads: work[10],
      skippedQuanta: work[11], eventQuanta: work[12], ...(impact ? { foldedSwipeMoves: impact[8] } : {}) },
    sampling: { names: PHASE_NAMES, steady: phaseSummaries },
    groups: groupSummaries,
    calibration: { reads: calibration[0], spanMs: calibration[1], zeroDeltas: calibration[2],
      minPositiveMs: calibration[3], rollbacks: calibration[4], invalidReads: calibration[5], invalidFrames: calibration[6] },
    terminal: { callbackCount: terminal[0], callbackSum: terminal[1], callbackMax: terminal[2],
      updateSum: terminal[3], drawSubmissionSum: terminal[4], stepsSum: terminal[5] },
    ...(damage ? { damage: {
      hitUpdateMs: duration(damage, 0),
      afterHitGapMs: duration(damage, 3),
      afterHitResidualMs: duration(damage, 6),
      hudDrawMs: duration(impact, 0),
      hapticMs: duration(impact, 3),
      scoreSaveMs: impact[6],
      resultsRouteMs: impact[7],
    } } : {}),
    ...(slowUpdates.length ? { slowUpdates } : {}),
    trace: { columns: TRACE_COLUMNS, rows: pairs.map(row => row.slice()) },
    caveats: ['Compact export contains selected aggregates and at most four paired trace rows; it does not include full histograms or the full trace.',
      ...(work.length >= 13 ? ['Phase samples describe executed canonical steps; skipped logical quanta produce no phase samples or object/candidate visits.'] : []),
      ...(slowUpdates.length ? ['Slow updates are the two highest valid steady update times available. Spawn and contact times are included in stepsMs. Values are rounded to integer milliseconds or counts and capped at 46654, except frame numbers which are capped at 1679615. Null indicates an invalid or unavailable value.'] : [])]
  }
}

function safeFilePart(value) {
  const safe = String(value).replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.{2,}/g, '_').replace(/^\.+/, '').slice(0, 100)
  return safe || 'run'
}

function csvCell(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'boolean') return value ? '1' : '0'
  return ''
}

export function traceCsv(report) {
  const trace = report?.trace
  if (!trace || !Array.isArray(trace.columns) || !Array.isArray(trace.rows)) return null
  const columns = trace.columns.map(column => String(column))
  const rows = trace.rows.map(row => Array.isArray(row) ? columns.map((_, i) => csvCell(row[i])).join(',') : columns.map(() => '').join(','))
  return `${columns.join(',')}\n${rows.join('\n')}${rows.length ? '\n' : ''}`
}

const TIMING_FIELDS = ['gapMs', 'previousCallbackMs', 'residualMs', 'callbackMs', 'updateMs',
  'drawSubmissionMs', 'bookkeepingMs', 'elapsedMs', 'pausedMs', 'admittedMs', 'pendingMs']

function reportSummary(report) {
  const timings = {}
  for (const scope of ['steady', 'terminal']) {
    const histograms = report?.[scope]
    if (!histograms || typeof histograms !== 'object') continue
    const scopeTiming = {}
    for (const name of TIMING_FIELDS) {
      const hist = histograms[name]
      if (!hist || !Number.isFinite(hist.count) || !Number.isFinite(hist.sum) || !Number.isFinite(hist.max)) continue
      scopeTiming[name] = { count: hist.count, meanMs: hist.count > 0 ? hist.sum / hist.count : null, maxMs: hist.max }
    }
    if (Object.keys(scopeTiming).length) timings[scope] = scopeTiming
  }
  return { runId: report.runId ?? null, frames: report.frames ?? report.clock?.frames ?? null, steps: report.steps ?? report.clock?.steps ?? null,
    observedClock: report.clock ? { elapsedMs: report.clock.observedElapsedMs ?? report.clock.elapsedMs,
      pausedMs: report.clock.observedPausedMs ?? report.clock.pausedMs } : null,
    timings }
}

export async function writeDecodedDiagnostics(decoded, outputDir) {
  await mkdir(outputDir, { recursive: true })
  const files = []
  const usedNames = new Set()
  for (let i = 0; i < decoded.reports.length; i += 1) {
    const report = decoded.reports[i]
    let base = safeFilePart(report.runId ?? `report-${i + 1}`)
    if (usedNames.has(base)) base = `${base}-${i + 1}`
    usedNames.add(base)
    const jsonName = `${base}.json`
    await writeFile(path.join(outputDir, jsonName), `${JSON.stringify(report, null, 2)}\n`)
    files.push(jsonName)
    const csv = traceCsv(report)
    if (csv !== null) {
      const csvName = `${base}-trace.csv`
      await writeFile(path.join(outputDir, csvName), csv)
      files.push(csvName)
    }
  }
  const summary = { counts: { reports: decoded.reports.length, incomplete: decoded.incomplete.length,
    errors: decoded.errors.length }, reports: decoded.reports.map(reportSummary),
  incomplete: decoded.incomplete, errors: decoded.errors, files }
  await writeFile(path.join(outputDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
  return summary
}

async function main(args) {
  let inputPath
  let outputDir
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--input') inputPath = args[++i]
    else if (args[i] === '--output-dir') outputDir = args[++i]
    else throw new Error(`Unknown argument: ${args[i]}`)
  }
  if (!inputPath || !outputDir) throw new Error('Usage: node scripts/decode-runtime-diagnostics.mjs --input PATH --output-dir PATH')
  const decoded = decodeDiagnostics(await readFile(inputPath, 'utf8'))
  await writeDecodedDiagnostics(decoded, outputDir)
  if (decoded.reports.length === 0 || decoded.errors.length > 0) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  })
}
