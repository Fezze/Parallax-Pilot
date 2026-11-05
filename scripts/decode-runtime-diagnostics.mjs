import { readFile, mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const MARKER = 'PP_DIAG '
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

function markerPayloads(text) {
  const found = []
  let from = 0
  while (from < text.length) {
    const at = text.indexOf(MARKER, from)
    if (at < 0) break
    const parsed = decodeJsonAt(text, at + MARKER.length)
    if (parsed) found.push(parsed.value)
    from = at + MARKER.length
  }
  return found
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

  function receive(chunk) {
    if (!chunk || typeof chunk !== 'object' || Array.isArray(chunk)) return
    const { runId, part, total, data } = chunk
    if ((typeof runId !== 'string' && typeof runId !== 'number') || String(runId).length === 0 ||
        !Number.isInteger(part) || !Number.isInteger(total) || total < 1 || total > MAX_CHUNK_PARTS ||
        part < 1 || part > total || typeof data !== 'string') {
      recordError('Invalid diagnostic chunk envelope', runId ?? null)
      return
    }
    const key = String(runId)
    let state = partsByRun.get(key)
    if (!state) {
      state = { total, chunks: new Map(), conflict: false }
      partsByRun.set(key, state)
    }
    if (state.total !== total) {
      if (!state.conflict) recordError('Conflicting total for run', key)
      state.conflict = true
      return
    }
    const prior = state.chunks.get(part)
    if (prior !== undefined && prior !== data) {
      if (!state.conflict) recordError(`Conflicting data for part ${part}`, key)
      state.conflict = true
      return
    }
    if (prior === undefined) state.chunks.set(part, data)
  }

  function visit(value, depth = 0) {
    nodes += 1
    if (nodes > MAX_SCAN_NODES) {
      if (nodes === MAX_SCAN_NODES + 1) recordError('Input exceeded JSON traversal limit')
      return
    }
    if (typeof value === 'string') {
      for (const payload of markerPayloads(value)) receive(payload)
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
  return { runId: report.runId ?? null, frames: report.frames ?? null, steps: report.steps ?? null,
    observedClock: report.clock ? { elapsedMs: report.clock.observedElapsedMs, pausedMs: report.clock.observedPausedMs } : null,
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
