import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import { spawn, spawnSync } from 'node:child_process'

export const DEFAULT_SCENARIO = '.test/simulator/scenarios/gameplay-smoke.json'
export const DEFAULT_SIMULATOR_PATH = '/opt/simulator/simulator'
export const DEFAULT_BRIDGE_HOST = '127.0.0.1'
export const DEFAULT_BRIDGE_PORT = 7650

export function parseCliArgs(argv) {
  const args = [...argv]
  const command = args.shift()
  const options = {
    dryRun: false,
    scenarioPath: undefined,
    calibrationPath: undefined,
    simulatorPath: DEFAULT_SIMULATOR_PATH,
    bridgeHost: DEFAULT_BRIDGE_HOST,
    bridgePort: DEFAULT_BRIDGE_PORT,
    outputDir: undefined,
  }

  while (args.length > 0) {
    const token = args.shift()
    if (token === '--dry-run') {
      options.dryRun = true
      continue
    }
    if (token === '--scenario') {
      options.scenarioPath = args.shift()
      continue
    }
    if (token === '--calibration') {
      options.calibrationPath = args.shift()
      continue
    }
    if (token === '--simulator-path') {
      options.simulatorPath = args.shift()
      continue
    }
    if (token === '--bridge-host') {
      options.bridgeHost = args.shift()
      continue
    }
    if (token === '--bridge-port') {
      const bridgePortValue = args.shift()
      const bridgePort = Number(bridgePortValue)
      if (!bridgePortValue || !Number.isInteger(bridgePort) || bridgePort < 1 || bridgePort > 65535) {
        throw new Error('--bridge-port requires an integer between 1 and 65535.')
      }
      options.bridgePort = bridgePort
      continue
    }
    if (token === '--output-dir') {
      options.outputDir = args.shift()
      continue
    }
    if (!options.scenarioPath) {
      options.scenarioPath = token
      continue
    }
    throw new Error(`Unknown argument: ${token}`)
  }

  return { command, options }
}

export function commandExists(commandName, runner = spawnSync) {
  const lookupCommand = process.platform === 'win32' ? 'where' : 'which'
  const result = runner(lookupCommand, [commandName], { stdio: 'pipe' })
  return result.status === 0
}

export function cleanSimulatorEnv(env) {
  const nextEnv = { ...env }
  delete nextEnv.ELECTRON_RUN_AS_NODE
  delete nextEnv.ELECTRON_NO_ATTACH_CONSOLE
  return nextEnv
}

export function chooseInputDriver(env, exists = commandExists) {
  if (env.DISPLAY && exists('xdotool')) {
    return 'xdotool'
  }
  if (exists('ydotool')) {
    return 'ydotool'
  }
  if (exists('xdotool')) {
    return 'xdotool'
  }
  throw new Error('No supported input driver found. Install xdotool for X11 or ydotool for Wayland.')
}

export function chooseScreenshotDriver(env, exists = commandExists) {
  if (env.WAYLAND_DISPLAY && exists('grim')) {
    return 'grim'
  }
  if (exists('scrot')) {
    return 'scrot'
  }
  if (exists('gnome-screenshot')) {
    return 'gnome-screenshot'
  }
  if (exists('grim')) {
    return 'grim'
  }
  throw new Error('No supported screenshot driver found. Install scrot, gnome-screenshot, or grim.')
}

export function chooseFocusDriver(env, exists = commandExists) {
  if (exists('xdotool')) {
    return 'xdotool'
  }
  throw new Error('Scenario uses a focus step, but xdotool is not available. Install xdotool or remove the focus step.')
}

export function resolveLocalBin(repoRoot, binaryName) {
  const extension = process.platform === 'win32' ? '.cmd' : ''
  const localPath = path.join(repoRoot, 'node_modules', '.bin', `${binaryName}${extension}`)
  return fs.existsSync(localPath) ? localPath : binaryName
}

export function resolveCalibrationPath(repoRoot, overridePath) {
  if (overridePath) {
    return path.resolve(repoRoot, overridePath)
  }
  const localCalibration = path.join(repoRoot, '.test/simulator/calibration.local.json')
  if (fs.existsSync(localCalibration)) {
    return localCalibration
  }
  return path.join(repoRoot, '.test/simulator/calibration.example.json')
}

export function loadJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

export function validateCalibration(calibration) {
  if (!calibration || typeof calibration !== 'object') {
    throw new Error('Calibration must be a JSON object.')
  }
  if (!calibration.screen || typeof calibration.screen !== 'object') {
    throw new Error('Calibration must include screen bounds.')
  }
  for (const key of ['x', 'y', 'w', 'h']) {
    if (typeof calibration.screen[key] !== 'number') {
      throw new Error(`Calibration screen.${key} must be a number.`)
    }
  }
  if (!calibration.targets || typeof calibration.targets !== 'object') {
    throw new Error('Calibration must include targets.')
  }
  return calibration
}

export function validateScenario(scenario) {
  if (!scenario || typeof scenario !== 'object') {
    throw new Error('Scenario must be a JSON object.')
  }
  if (typeof scenario.id !== 'string' || scenario.id.length === 0) {
    throw new Error('Scenario id is required.')
  }
  if (!Array.isArray(scenario.steps) || scenario.steps.length === 0) {
    throw new Error('Scenario steps are required.')
  }

  for (const step of scenario.steps) {
    if (!step || typeof step !== 'object' || typeof step.action !== 'string') {
      throw new Error('Each scenario step must include an action.')
    }
  }

  return scenario
}

export function resolveTargetPoint(calibration, targetName) {
  const target = calibration.targets[targetName]
  if (!target) {
    throw new Error(`Unknown calibration target: ${targetName}`)
  }
  return {
    x: Math.round(calibration.screen.x + target.x * calibration.screen.w),
    y: Math.round(calibration.screen.y + target.y * calibration.screen.h),
  }
}

export function formatAreaArgument(calibration) {
  const { x, y, w, h } = calibration.screen
  return `${x},${y},${w},${h}`
}

export function createRuntime({
  repoRoot,
  env = process.env,
  stdout = process.stdout,
  stderr = process.stderr,
  syncRunner = spawnSync,
  asyncRunner = spawn,
} = {}) {
  function log(message) {
    stdout.write(`${message}\n`)
  }

  function fail(message) {
    stderr.write(`${message}\n`)
  }

  function runSync(commandName, args, options = {}) {
    const result = syncRunner(commandName, args, { stdio: 'pipe', ...options })
    if (result.error) {
      throw result.error
    }
    return result
  }

  function runLogged(commandName, args, options = {}) {
    const result = syncRunner(commandName, args, { stdio: 'inherit', ...options })
    if (result.error) {
      throw result.error
    }
    if (result.status !== 0) {
      throw new Error(`Command failed: ${commandName} ${args.join(' ')}`)
    }
  }

  return { repoRoot, env, stdout, stderr, log, fail, runSync, runLogged, asyncRunner }
}

export async function probePort(host, port, timeoutMs = 1000) {
  return new Promise((resolve) => {
    const socket = net.createConnection(port, host)
    const onDone = (result) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(result)
    }

    socket.once('connect', () => onDone(true))
    socket.once('error', () => onDone(false))
    socket.setTimeout(timeoutMs, () => onDone(false))
  })
}

export function inspectSimulatorLibraries(simulatorPath, runner = spawnSync, platform = process.platform) {
  if (platform !== 'linux' || !fs.existsSync(simulatorPath)) {
    return []
  }
  let result
  try {
    result = runner('ldd', [simulatorPath], { stdio: 'pipe', encoding: 'utf8' })
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return []
    }
    throw error
  }
  if (result.error?.code === 'ENOENT') {
    return []
  }
  if (result.status !== 0 || typeof result.stdout !== 'string') {
    return []
  }
  return result.stdout
    .split('\n')
    .filter((line) => line.includes('not found'))
    .map((line) => line.trim())
}

export async function runDoctor(runtime, options) {
  const { env, log } = runtime
  const bridgeOpen = await probePort(options.bridgeHost, options.bridgePort)
  const hasDisplay = Boolean(env.DISPLAY || env.WAYLAND_DISPLAY)
  const simulatorExists = fs.existsSync(options.simulatorPath)
  const zeusExists = commandExists(resolveLocalBin(runtime.repoRoot, 'zeus'), runtime.runSync)
  const xdotoolExists = commandExists('xdotool', runtime.runSync)
  const ydotoolExists = commandExists('ydotool', runtime.runSync)
  const scrotExists = commandExists('scrot', runtime.runSync)
  const gnomeScreenshotExists = commandExists('gnome-screenshot', runtime.runSync)
  const grimExists = commandExists('grim', runtime.runSync)
  const missingLibraries = inspectSimulatorLibraries(options.simulatorPath, runtime.runSync)

  const lines = [
    `zeus: ${zeusExists ? 'ok' : 'missing'}`,
    `simulator: ${simulatorExists ? 'ok' : 'missing'} (${options.simulatorPath})`,
    `bridge: ${bridgeOpen ? 'open' : 'closed'} (${options.bridgeHost}:${options.bridgePort})`,
    `display: ${env.WAYLAND_DISPLAY ? 'wayland' : env.DISPLAY ? 'x11' : 'missing'}`,
    `input: xdotool=${xdotoolExists ? 'ok' : 'missing'}, ydotool=${ydotoolExists ? 'ok' : 'missing'}`,
    `screenshot: scrot=${scrotExists ? 'ok' : 'missing'}, gnome-screenshot=${gnomeScreenshotExists ? 'ok' : 'missing'}, grim=${grimExists ? 'ok' : 'missing'}`,
  ]

  if (missingLibraries.length > 0) {
    lines.push('missing-libraries:')
    for (const entry of missingLibraries) {
      lines.push(`- ${entry}`)
    }
  }

  lines.push('recommendations:')
  if (!simulatorExists) {
    lines.push(`- install Zepp Simulator to ${options.simulatorPath}`)
  }
  if (!hasDisplay) {
    lines.push('- run inside a graphical X11 or Wayland session')
  }
  if (!xdotoolExists && !ydotoolExists) {
    lines.push('- install xdotool for X11 or ydotool for Wayland input automation')
  }
  if (!scrotExists && !gnomeScreenshotExists && !grimExists) {
    lines.push('- install scrot, gnome-screenshot, or grim for screenshots')
  }
  if (env.WAYLAND_DISPLAY && !ydotoolExists) {
    lines.push('- on Wayland prefer ydotool if compositor blocks synthetic input')
  }
  if (missingLibraries.length > 0) {
    lines.push('- install the missing simulator shared libraries before launching QEMU-based devices')
  }
  if (bridgeOpen) {
    lines.push('- bridge port is already reachable; you can attach instead of relaunching bridge')
  }

  for (const line of lines) {
    log(line)
  }

  return {
    bridgeOpen,
    simulatorExists,
    missingLibraries,
  }
}

export function loadCalibration(repoRoot, overridePath) {
  const calibrationPath = resolveCalibrationPath(repoRoot, overridePath)
  if (!fs.existsSync(calibrationPath)) {
    throw new Error(`Calibration file not found: ${calibrationPath}`)
  }
  return {
    calibrationPath,
    calibration: validateCalibration(loadJsonFile(calibrationPath)),
  }
}

export function loadScenario(repoRoot, scenarioPath) {
  const resolvedScenarioPath = path.resolve(repoRoot, scenarioPath || DEFAULT_SCENARIO)
  if (!fs.existsSync(resolvedScenarioPath)) {
    throw new Error(`Scenario file not found: ${resolvedScenarioPath}`)
  }
  return {
    scenarioPath: resolvedScenarioPath,
    scenario: validateScenario(loadJsonFile(resolvedScenarioPath)),
  }
}

export function launchSimulator(runtime, options) {
  if (!fs.existsSync(options.simulatorPath)) {
    throw new Error(`Simulator binary not found: ${options.simulatorPath}`)
  }
  const child = runtime.asyncRunner(options.simulatorPath, [], {
    detached: true,
    stdio: 'ignore',
    env: cleanSimulatorEnv(runtime.env),
  })
  child.unref()
}

export function runZeus(runtime, repoRoot, zeusArgs, stdio = 'inherit') {
  const zeusCommand = resolveLocalBin(repoRoot, 'zeus')
  const result = runtime.runSync(zeusCommand, zeusArgs, {
    cwd: path.join(repoRoot, 'zepp-app'),
    stdio,
  })
  if (result.status !== 0) {
    throw new Error(`zeus ${zeusArgs.join(' ')} failed with status ${result.status ?? 1}`)
  }
  return result
}

export async function waitForBridge(host, port, timeoutMs = 15000, intervalMs = 500) {
  const startedAt = Date.now()
  while (Date.now() - startedAt <= timeoutMs) {
    if (await probePort(host, port, Math.min(intervalMs, 1000))) {
      return true
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
  return false
}

export function performInputAction(runtime, driver, args) {
  runtime.runLogged(driver, args)
}

export function tap(runtime, driver, point) {
  if (driver === 'xdotool') {
    performInputAction(runtime, driver, ['mousemove', String(point.x), String(point.y), 'click', '1'])
    return
  }
  performInputAction(runtime, driver, ['mousemove', '--absolute', String(point.x), String(point.y)])
  performInputAction(runtime, driver, ['click', '0xC0'])
}

export function swipe(runtime, driver, point, step) {
  const targetX = point.x + step.dx
  const targetY = point.y + step.dy
  if (driver === 'xdotool') {
    performInputAction(runtime, driver, [
      'mousemove',
      String(point.x),
      String(point.y),
      'mousedown',
      '1',
      'mousemove',
      '--sync',
      '--polar',
      '0',
      '0',
    ])
    performInputAction(runtime, driver, ['mousemove', '--sync', String(targetX), String(targetY)])
    performInputAction(runtime, driver, ['mouseup', '1'])
    return
  }
  performInputAction(runtime, driver, ['mousemove', '--absolute', String(point.x), String(point.y)])
  performInputAction(runtime, driver, ['mousedown', '0xC0'])
  performInputAction(runtime, driver, ['mousemove', '--absolute', String(targetX), String(targetY)])
  performInputAction(runtime, driver, ['mouseup', '0xC0'])
}

export function pressKey(runtime, driver, key) {
  if (driver === 'xdotool') {
    performInputAction(runtime, driver, ['key', key])
    return
  }
  const keyMap = {
    Home: '102:1',
    BackSpace: '14:1',
    Return: '28:1',
    Left: '105:1',
    Right: '106:1',
    Up: '103:1',
    Down: '108:1',
  }
  const keyCode = keyMap[key]
  if (!keyCode) {
    throw new Error(`Unsupported key for ydotool: ${key}`)
  }
  performInputAction(runtime, driver, ['key', keyCode, keyCode.replace(':1', ':0')])
}

export function focusWindow(runtime, driver, titlePattern) {
  runtime.runLogged(driver, ['search', '--name', titlePattern, 'windowactivate'])
}

function requireInputDriver(driver, action) {
  if (!driver) {
    throw new Error(`Scenario action "${action}" requires an input driver. Add "input" to scenario.requires or run with --dry-run.`)
  }
  return driver
}

function requireScreenshotDriver(driver, action) {
  if (!driver) {
    throw new Error(`Scenario action "${action}" requires a screenshot driver. Add "screenshot" to scenario.requires or run with --dry-run.`)
  }
  return driver
}

function requireFocusDriver(driver) {
  if (!driver) {
    throw new Error('Scenario action "focus" requires xdotool. Install xdotool or remove the focus step.')
  }
  return driver
}

export function saveScreenshot(runtime, driver, calibration, outputFile) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true })
  if (driver === 'scrot') {
    runtime.runLogged('scrot', ['-a', formatAreaArgument(calibration), outputFile])
    return
  }
  if (driver === 'grim') {
    runtime.runLogged('grim', ['-g', `${calibration.screen.x},${calibration.screen.y} ${calibration.screen.w}x${calibration.screen.h}`, outputFile])
    return
  }
  runtime.runLogged('gnome-screenshot', ['-f', outputFile])
}

export async function executeScenario(runtime, options) {
  const { scenario } = loadScenario(runtime.repoRoot, options.scenarioPath)
  const { calibration } = loadCalibration(runtime.repoRoot, options.calibrationPath)
  const commandAvailable = (name) => commandExists(name, runtime.runSync)
  const usesFocus = scenario.steps.some((step) => step.action === 'focus')
  const inputDriver = !options.dryRun && scenario.requires?.includes('input')
    ? chooseInputDriver(runtime.env, commandAvailable)
    : undefined
  const screenshotDriver = !options.dryRun && scenario.requires?.includes('screenshot')
    ? chooseScreenshotDriver(runtime.env, commandAvailable)
    : undefined
  const focusDriver = !options.dryRun && usesFocus
    ? chooseFocusDriver(runtime.env, commandAvailable)
    : undefined
  const outputDir = options.outputDir
    ? path.resolve(runtime.repoRoot, options.outputDir)
    : path.join(runtime.repoRoot, 'output', 'simulator', scenario.id)

  for (const step of scenario.steps) {
    runtime.log(`step:${step.action}`)
    if (options.dryRun) {
      runtime.log(`dry-run:${JSON.stringify(step)}`)
      continue
    }

    if (step.action === 'wait') {
      await new Promise((resolve) => setTimeout(resolve, step.ms ?? 0))
      continue
    }

    if (step.action === 'launch') {
      launchSimulator(runtime, options)
      continue
    }

    if (step.action === 'focus') {
      focusWindow(runtime, requireFocusDriver(focusDriver), step.title ?? calibration.deviceWindowTitle)
      continue
    }

    if (step.action === 'key') {
      pressKey(runtime, requireInputDriver(inputDriver, step.action), step.key)
      continue
    }

    if (step.action === 'tap') {
      tap(runtime, requireInputDriver(inputDriver, step.action), resolveTargetPoint(calibration, step.target))
      continue
    }

    if (step.action === 'swipe') {
      swipe(runtime, requireInputDriver(inputDriver, step.action), resolveTargetPoint(calibration, step.target), step)
      continue
    }

    if (step.action === 'screenshot') {
      const outputFile = path.join(outputDir, `${step.name}.png`)
      saveScreenshot(runtime, requireScreenshotDriver(screenshotDriver, step.action), calibration, outputFile)
      runtime.log(`saved:${outputFile}`)
      continue
    }

    if (step.action === 'bridge') {
      runZeus(runtime, runtime.repoRoot, ['bridge'])
      continue
    }

    if (step.action === 'connect') {
      const connected = await waitForBridge(options.bridgeHost, options.bridgePort, step.timeoutMs ?? 15000)
      if (!connected) {
        throw new Error(`Bridge was not reachable on ${options.bridgeHost}:${options.bridgePort}`)
      }
      continue
    }

    if (step.action === 'install') {
      runZeus(runtime, runtime.repoRoot, ['install'])
      continue
    }

    throw new Error(`Unsupported scenario action: ${step.action}`)
  }

  return { scenarioId: scenario.id, outputDir }
}

export async function runHarnessCommand(runtime, command, options) {
  if (command === 'doctor') {
    await runDoctor(runtime, options)
    return
  }
  if (command === 'run') {
    await executeScenario(runtime, options)
    return
  }
  if (command === 'smoke') {
    await executeScenario(runtime, {
      ...options,
      scenarioPath: options.scenarioPath || DEFAULT_SCENARIO,
    })
    return
  }
  throw new Error('Usage: node scripts/simulator-harness.mjs <doctor|run|smoke> [scenario.json] [--dry-run]')
}
