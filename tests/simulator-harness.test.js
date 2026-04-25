import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  chooseInputDriver,
  chooseScreenshotDriver,
  cleanSimulatorEnv,
  createRuntime,
  executeScenario,
  parseCliArgs,
  resolveTargetPoint,
  validateCalibration,
  validateScenario,
} from '../scripts/simulator-harness-core.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

describe('Simulator Harness', () => {
  test('parses scenario JSON contract', () => {
    const scenarioPath = path.join(repoRoot, '.test/simulator/scenarios/gameplay-smoke.json')
    const scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf8'))
    assert.equal(validateScenario(scenario).id, 'gameplay-smoke')
  })

  test('validates calibration contract', () => {
    const calibrationPath = path.join(repoRoot, '.test/simulator/calibration.example.json')
    const calibration = JSON.parse(fs.readFileSync(calibrationPath, 'utf8'))
    assert.equal(validateCalibration(calibration).screen.w, 480)
  })

  test('maps relative targets to absolute coordinates', () => {
    const point = resolveTargetPoint({
      screen: { x: 24, y: 40, w: 480, h: 480 },
      targets: { center: { x: 0.5, y: 0.5 } },
    }, 'center')

    assert.deepEqual(point, { x: 264, y: 280 })
  })

  test('selects xdotool on X11 when available', () => {
    const driver = chooseInputDriver({ DISPLAY: ':0' }, (name) => name === 'xdotool')
    assert.equal(driver, 'xdotool')
  })

  test('falls back to ydotool when xdotool is unavailable', () => {
    const driver = chooseInputDriver({ WAYLAND_DISPLAY: 'wayland-1' }, (name) => name === 'ydotool')
    assert.equal(driver, 'ydotool')
  })

  test('prefers grim screenshots on Wayland', () => {
    const driver = chooseScreenshotDriver({ WAYLAND_DISPLAY: 'wayland-1' }, (name) => name === 'grim')
    assert.equal(driver, 'grim')
  })

  test('removes electron flags from simulator environment', () => {
    const env = cleanSimulatorEnv({
      ELECTRON_RUN_AS_NODE: '1',
      ELECTRON_NO_ATTACH_CONSOLE: '1',
      PATH: '/bin',
    })

    assert.equal(env.PATH, '/bin')
    assert.equal('ELECTRON_RUN_AS_NODE' in env, false)
    assert.equal('ELECTRON_NO_ATTACH_CONSOLE' in env, false)
  })

  test('parses CLI flags for run command', () => {
    const parsed = parseCliArgs(['run', '--dry-run', '--scenario', '.test/simulator/scenarios/gameplay-smoke.json'])
    assert.equal(parsed.command, 'run')
    assert.equal(parsed.options.dryRun, true)
    assert.equal(parsed.options.scenarioPath, '.test/simulator/scenarios/gameplay-smoke.json')
  })

  test('dry-run scenario does not require real simulator binaries', async () => {
    const lines = []
    const runtime = createRuntime({
      repoRoot,
      stdout: { write: (line) => lines.push(line.trim()) },
      stderr: { write: () => {} },
      syncRunner: () => ({ status: 0, stdout: '' }),
      asyncRunner: () => ({ unref() {} }),
    })

    const result = await executeScenario(runtime, {
      dryRun: true,
      scenarioPath: '.test/simulator/scenarios/gameplay-smoke.json',
      simulatorPath: '/missing/simulator',
      bridgeHost: '127.0.0.1',
      bridgePort: 7650,
    })

    assert.equal(result.scenarioId, 'gameplay-smoke')
    assert(lines.some((line) => line.includes('dry-run:{"action":"launch"}')))
    assert(lines.some((line) => line.includes('dry-run:{"action":"screenshot","name":"round-board"}')))
  })
})