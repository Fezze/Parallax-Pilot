#!/usr/bin/env node

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRuntime, parseCliArgs, runHarnessCommand } from './simulator-harness-core.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

async function main() {
  const { command, options } = parseCliArgs(process.argv.slice(2))
  const runtime = createRuntime({ repoRoot })
  await runHarnessCommand(runtime, command, options)
}

try {
  await main()
} catch (error) {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
}