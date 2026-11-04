import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

import {
  chooseInputDriver,
  chooseScreenshotDriver,
  cleanSimulatorEnv,
  createRuntime,
  executeScenario,
  hold,
  verifyDeployedApp,
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
    const driver = chooseInputDriver({ DISPLAY: ':0', ZEPP_SIMULATOR_ALLOW_HOST_INPUT: '1' }, (name) => name === 'xdotool')
    assert.equal(driver, 'xdotool')
  })

  test('falls back to ydotool when xdotool is unavailable', () => {
    const driver = chooseInputDriver({ WAYLAND_DISPLAY: 'wayland-1', ZEPP_SIMULATOR_ALLOW_HOST_INPUT: '1' }, (name) => name === 'ydotool')
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
    assert(lines.some((line) => line.includes('dry-run:{"action":"verify-app"}')))
    assert(lines.some((line) => line.includes('dry-run:{"action":"screenshot","name":"01-home"}')))
  })
})

test('native screenshot selection does not require desktop screenshot utilities', () => {
  assert.equal(chooseScreenshotDriver({ ZEPP_SIMULATOR_SCREENSHOT_DRIVER: 'native' }, () => false), 'native')
})

test('interrupted touch hold releases the pointer', async () => {
  const calls = []
  const runtime = createRuntime({ syncRunner: (command, args) => { calls.push([command, args]); return { status: 0 } },
    wait: async () => { throw new Error('interrupted') } })
  await assert.rejects(hold(runtime, 'xdotool', { x: 10, y: 20 }, 500), /interrupted/)
  assert.deepEqual(calls.at(-1), ['xdotool', ['mouseup', '1']])
})

test('invalid touch holds do not send input', async () => {
  const runtime = createRuntime({ syncRunner: () => { throw new Error('input sent') } })
  for (const duration of [0, -1, NaN, Infinity, 10001]) {
    await assert.rejects(hold(runtime, 'xdotool', { x: 0, y: 0 }, duration), /Hold duration/)
  }
})

test('native smoke targets the real game and defines every input target', () => {
  const scenario = JSON.parse(fs.readFileSync(path.join(repoRoot, '.test/simulator/scenarios/gameplay-smoke.json')))
  const calibration = JSON.parse(fs.readFileSync(path.join(repoRoot, '.test/simulator/calibration.example.json')))
  const firstInput = scenario.steps.findIndex((step) => ['tap', 'hold', 'swipe'].includes(step.action))
  assert.ok(scenario.steps.findIndex((step) => step.action === 'verify-app') < firstInput)
  for (const step of scenario.steps) if (step.target) assert.ok(calibration.targets[step.target], step.target)
  assert.ok(scenario.steps.some((step) => step.action === 'hold'))
  assert.ok(scenario.steps.some((step) => step.name === '10-replay'))
})

test('native validation checks the actual package even when project import metadata is old', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'parallax-smoke-'))
  try {
    const app = path.join(root, 'zepp-app')
    const simulator = path.join(root, 'simulator')
    const deployed = path.join(simulator, 'apps', 'pilot')
    fs.mkdirSync(app, { recursive: true })
    fs.mkdirSync(path.join(deployed, 'device'), { recursive: true })
    const manifest = { app: { appId: 1110694, version: { name: '2.3.22', code: 73 } } }
    fs.writeFileSync(path.join(app, 'app.json'), JSON.stringify(manifest))
    const nativeManifest = path.join(deployed, 'device', 'app.json')
    const nativePackage = path.join(deployed, 'device.zip')
    const metadataPath = path.join(simulator, 'last_app_info.json')
    const metadata = { app_id: 1110694, user_app_path: app, sim_app_path: deployed, last_updated: '2000-01-01' }
    const env = { ZEPP_SIMULATOR_ROOT: simulator }
    const writeMetadata = (patch) => fs.writeFileSync(metadataPath, JSON.stringify({ ...metadata, ...patch }))
    const refresh = () => {
      fs.writeFileSync(nativeManifest, JSON.stringify(manifest))
      fs.writeFileSync(nativePackage, 'native package fixture')
      const now = new Date(Date.now() + 1000)
      for (const file of [nativeManifest, nativePackage]) fs.utimesSync(file, now, now)
    }
    refresh()
    writeMetadata({ app_id: 20001 })
    assert.throws(() => verifyDeployedApp(root, env), /different application/)
    writeMetadata({ user_app_path: root })
    assert.throws(() => verifyDeployedApp(root, env), /different application/)
    writeMetadata({ sim_app_path: undefined })
    assert.throws(() => verifyDeployedApp(root, env), /path is missing/)
    writeMetadata({})
    fs.unlinkSync(nativePackage)
    assert.throws(() => verifyDeployedApp(root, env), /package is missing/)
    refresh()
    fs.writeFileSync(nativeManifest, JSON.stringify({ app: { ...manifest.app, version: { name: 'old', code: 1 } } }))
    assert.throws(() => verifyDeployedApp(root, env), /different application or version/)
    refresh()
    fs.utimesSync(nativePackage, new Date('2000-01-01'), new Date('2000-01-01'))
    assert.throws(() => verifyDeployedApp(root, env), /older/)
    refresh()
    const changedSource = path.join(app, 'game.js')
    fs.writeFileSync(changedSource, '// New source after deployment')
    const future = new Date(Date.now() + 2000)
    fs.utimesSync(changedSource, future, future)
    assert.throws(() => verifyDeployedApp(root, env), /older/)
    fs.unlinkSync(changedSource)
    refresh()
    const verified = verifyDeployedApp(root, env)
    assert.equal(verified.appId, 1110694)
    assert.equal(verified.verifiedPackage, nativePackage)
    assert.ok(Date.parse(verified.deployedAt) > Date.parse(metadata.last_updated))
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})

test('parses manual input mode without changing dry-run semantics', () => {
  const { options } = parseCliArgs(['smoke', '--manual-input'])
  assert.equal(options.manualInput, true)
  assert.equal(options.dryRun, false)
})

test('manual native actions require confirmation and never inject desktop input', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'parallax-manual-'))
  try {
    const scenarioPath = path.join(root, 'scenario.json')
    const calibrationPath = path.join(root, 'calibration.json')
    fs.writeFileSync(scenarioPath, JSON.stringify({ id: 'manual', requires: ['input'], steps: [
      { action: 'focus' }, { action: 'tap', target: 'start', instruction: 'Tap START RUN' },
      { action: 'hold', target: 'up', ms: 500, instruction: 'Hold upper half' },
    ] }))
    fs.writeFileSync(calibrationPath, JSON.stringify({ screen: { x: 0, y: 0, w: 480, h: 480 }, targets: {} }))
    const instructions = []
    const runtime = createRuntime({ repoRoot: root, env: {}, stdout: { write() {} },
      syncRunner: () => { throw new Error('Desktop input must not be injected') },
      confirm: async (instruction) => { instructions.push(instruction) },
    })
    const result = await executeScenario(runtime, { manualInput: true, scenarioPath, calibrationPath })
    assert.deepEqual(instructions, ['Tap START RUN', 'Hold upper half'])
    const evidence = JSON.parse(fs.readFileSync(path.join(result.outputDir, 'execution.json')))
    assert.equal(evidence.inputDriver, 'manual')
    assert.match(evidence.disposition, /require review/)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
})


test('automatic native input is selected without permission to use the host cursor', () => {
  assert.equal(chooseInputDriver({ ZEPP_SIMULATOR_QMP_SOCKET: '/tmp/qmp.sock' }, () => false), 'native')
  assert.throws(() => chooseInputDriver({ DISPLAY: ':0' }, () => true), /Host cursor input is disabled/)
})

test('explicitly allowed ydotool hold uses its supported press/release command', async () => {
  const calls = []
  const runtime = createRuntime({ syncRunner: (name, args) => { calls.push([name, args]); return { status: 0 } }, wait: async () => {} })
  await hold(runtime, 'ydotool', { x: 10, y: 20 }, 500)
  assert.deepEqual(calls.slice(-2), [['ydotool', ['click', '0x40']], ['ydotool', ['click', '0x80']]])
})
