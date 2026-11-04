import fs from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import os from 'node:os'
import { createInterface } from 'node:readline/promises'
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
    manualInput: false,
    scenarioPath: undefined,
    calibrationPath: undefined,
    simulatorPath: DEFAULT_SIMULATOR_PATH,
    bridgeHost: DEFAULT_BRIDGE_HOST,
    bridgePort: DEFAULT_BRIDGE_PORT,
    outputDir: undefined,
  }

  while (args.length > 0) {
    const token = args.shift()
    if (token === '--manual-input') {
      options.manualInput = true
      continue
    }
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
      options.bridgePort = Number.parseInt(args.shift(), 10)
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
  if (env.ZEPP_SIMULATOR_QMP_SOCKET) return 'native'
  if (env.ZEPP_SIMULATOR_ALLOW_HOST_INPUT !== '1') {
    throw new Error('Configure native input with npm run sim:input or use --manual-input. Host cursor input is disabled by default.')
  }
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
  if (env.ZEPP_SIMULATOR_SCREENSHOT_DRIVER === 'native') {
    return 'native'
  }
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
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  confirm = async (instruction) => {
    if (!process.stdin.isTTY) throw new Error('Manual native input requires an interactive terminal.')
    const prompt = createInterface({ input: process.stdin, output: stdout })
    try { await prompt.question(`${instruction}\nPress Enter after completing this action in the native simulator: `) }
    finally { prompt.close() }
  },
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

  return { repoRoot, env, stdout, stderr, log, fail, runSync, runLogged, asyncRunner, wait, confirm }
}

export function verifyDeployedApp(repoRoot, env = process.env) {
  const root = env.ZEPP_SIMULATOR_ROOT || path.join(env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'simulator')
  const metadata = loadJsonFile(path.join(root, 'last_app_info.json'))
  const appRoot = path.join(repoRoot, 'zepp-app')
  const manifest = loadJsonFile(path.join(appRoot, 'app.json'))
  if (Number(metadata.app_id) !== manifest.app.appId || path.resolve(metadata.user_app_path || '') !== appRoot) {
    throw new Error('Simulator deployment is a different application. Deploy this project with npm run dev first.')
  }
  // Zeus can retain the project's original import date in last_app_info.json
  // across successful redeploys. Verify the actual native package instead.
  if (!metadata.sim_app_path) throw new Error('Native simulator package path is missing. Redeploy with npm run dev first.')
  const nativeManifestPath = path.join(metadata.sim_app_path, 'device', 'app.json')
  const nativePackagePath = path.join(metadata.sim_app_path, 'device.zip')
  if (!fs.existsSync(nativeManifestPath) || !fs.existsSync(nativePackagePath)) {
    throw new Error('Native simulator package is missing. Redeploy with npm run dev first.')
  }
  const nativeManifest = loadJsonFile(nativeManifestPath)
  if (nativeManifest.app?.appId !== manifest.app.appId ||
      nativeManifest.app?.version?.name !== manifest.app.version.name ||
      nativeManifest.app?.version?.code !== manifest.app.version.code) {
    throw new Error('Native simulator package has a different application or version. Redeploy with npm run dev first.')
  }
  const deployedAt = Math.min(fs.statSync(nativeManifestPath).mtimeMs, fs.statSync(nativePackagePath).mtimeMs)
  let latestSource = 0
  function inspect(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'dist' || entry.name === 'node_modules') continue
      const source = path.join(directory, entry.name)
      if (entry.isDirectory()) inspect(source)
      else latestSource = Math.max(latestSource, fs.statSync(source).mtimeMs)
    }
  }
  inspect(appRoot)
  if (!Number.isFinite(deployedAt) || deployedAt < latestSource) {
    throw new Error('Simulator deployment is older than application sources. Redeploy with npm run dev first.')
  }
  return { appId: manifest.app.appId, version: manifest.app.version,
    deployedAt: new Date(deployedAt).toISOString(), verifiedPackage: nativePackagePath }
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

export function inspectSimulatorLibraries(simulatorPath, runner = spawnSync) {
  if (!fs.existsSync(simulatorPath)) {
    return []
  }
  const result = runner('ldd', [simulatorPath], { stdio: 'pipe', encoding: 'utf8' })
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
  const nativeScreenshots = env.ZEPP_SIMULATOR_SCREENSHOT_DRIVER === 'native'
  const missingLibraries = inspectSimulatorLibraries(options.simulatorPath, runtime.runSync)

  const lines = [
    `zeus: ${zeusExists ? 'ok' : 'missing'}`,
    `simulator: ${simulatorExists ? 'ok' : 'missing'} (${options.simulatorPath})`,
    `bridge: ${bridgeOpen ? 'open' : 'closed'} (${options.bridgeHost}:${options.bridgePort})`,
    `display: ${env.WAYLAND_DISPLAY ? 'wayland' : env.DISPLAY ? 'x11' : 'missing'}`,
    `input: xdotool=${xdotoolExists ? 'ok' : 'missing'}, ydotool=${ydotoolExists ? 'ok' : 'missing'}`,
    `native-screenshot: ${nativeScreenshots ? 'configured; firmware capture verifies service availability' : 'set ZEPP_SIMULATOR_SCREENSHOT_DRIVER=native to use firmware capture'}`,
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
  if (!nativeScreenshots && !scrotExists && !gnomeScreenshotExists && !grimExists) {
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
  if (driver === 'native') return nativePointerAction(runtime, 'tap', point)
  if (driver === 'xdotool') {
    performInputAction(runtime, driver, ['mousemove', String(point.x), String(point.y), 'click', '1'])
    return
  }
  performInputAction(runtime, driver, ['mousemove', '--absolute', String(point.x), String(point.y)])
  performInputAction(runtime, driver, ['click', '0xC0'])
}

export function swipe(runtime, driver, point, step) {
  if (driver === 'native') return nativePointerAction(runtime, 'swipe', point, { ms: step.durationMs || 350, dx: step.dx, dy: step.dy })
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

export async function hold(runtime, driver, point, ms) {
  if (driver === 'native') return nativePointerAction(runtime, 'hold', point, { ms })
  if (!Number.isFinite(ms) || ms <= 0 || ms > 10000) throw new Error('Hold duration must be between 1 and 10000 ms.')
  const button = driver === 'xdotool' ? '1' : undefined
  const moveArgs = driver === 'xdotool'
    ? ['mousemove', String(point.x), String(point.y)]
    : ['mousemove', '--absolute', String(point.x), String(point.y)]
  performInputAction(runtime, driver, moveArgs)
  performInputAction(runtime, driver, button ? ['mousedown', button] : ['click', '0x40'])
  try {
    await runtime.wait(ms)
  } finally {
    performInputAction(runtime, driver, button ? ['mouseup', button] : ['click', '0x80'])
  }
}

export function pressKey(runtime, driver, key) {
  if (driver === 'native') throw new Error('This native adapter supports pointer actions only; keyboard injection is not enabled.')
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

export function focusWindow(runtime, titlePattern, windowClass) {
  if (runtime.env.ZEPP_SIMULATOR_QMP_SOCKET) return
  runtime.runLogged('xdotool', ['search', '--onlyvisible', windowClass ? '--class' : '--name', windowClass || titlePattern, 'windowactivate'])
}

export function saveScreenshot(runtime, driver, calibration, outputFile) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true })
  if (driver === 'native') {
    runtime.runLogged(process.execPath, [path.join(runtime.repoRoot, 'scripts/simulator-native-screenshot.mjs'), outputFile], { env: runtime.env })
    return
  }
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

function nativePointerAction(runtime, action, point, options = {}) {
  runtime.runLogged(process.execPath, [path.join(runtime.repoRoot, 'scripts/simulator-native-input.mjs'), action, JSON.stringify({ point, options })], { env: runtime.env })
}

export async function executeScenario(runtime, options) {
  const { scenario } = loadScenario(runtime.repoRoot, options.scenarioPath)
  const { calibration, calibrationPath } = loadCalibration(runtime.repoRoot, options.calibrationPath)
  if (!options.dryRun && !options.manualInput && !runtime.env.ZEPP_SIMULATOR_QMP_SOCKET && calibrationPath === path.join(runtime.repoRoot, '.test/simulator/calibration.example.json')) {
    throw new Error('Create calibration.local.json with the actual firmware screen bounds before running native input.')
  }
  const inputDriver = !options.dryRun && scenario.requires?.includes('input')
    ? options.manualInput ? 'manual' : chooseInputDriver(runtime.env)
    : undefined
  const screenshotDriver = !options.dryRun && scenario.requires?.includes('screenshot')
    ? chooseScreenshotDriver(runtime.env)
    : undefined
  const outputDir = options.outputDir
    ? path.resolve(runtime.repoRoot, options.outputDir)
    : path.join(runtime.repoRoot, 'output', 'simulator', scenario.id)
  const targetPoint = (name) => inputDriver === 'native'
    ? resolveTargetPoint({ ...calibration, screen: { ...calibration.screen, x: 0, y: 0 } }, name)
    : resolveTargetPoint(calibration, name)

  for (const step of scenario.steps) {
    runtime.log(`step:${step.action}`)
    if (options.dryRun) {
      runtime.log(`dry-run:${JSON.stringify(step)}`)
      continue
    }

    if (options.manualInput && ['tap', 'hold', 'swipe', 'key'].includes(step.action)) {
      await runtime.confirm(step.instruction || `Native ${step.action}: ${step.target || step.key}${step.ms ? ` for ${step.ms} ms` : ''}`)
      continue
    }

    if (step.action === 'wait') {
      await runtime.wait(step.ms ?? 0)
      continue
    }

    if (step.action === 'verify-app') {
      runtime.log(`deployed:${JSON.stringify(verifyDeployedApp(runtime.repoRoot, runtime.env))}`)
      continue
    }

    if (step.action === 'launch') {
      launchSimulator(runtime, options)
      continue
    }

    if (step.action === 'focus') {
      if (options.manualInput) continue
      focusWindow(runtime, step.title ?? calibration.deviceWindowTitle, calibration.deviceWindowClass)
      continue
    }

    if (step.action === 'key') {
      pressKey(runtime, inputDriver, step.key)
      continue
    }

    if (step.action === 'tap') {
      tap(runtime, inputDriver, targetPoint(step.target))
      continue
    }

    if (step.action === 'swipe') {
      swipe(runtime, inputDriver, targetPoint(step.target), step)
      continue
    }

    if (step.action === 'hold') {
      await hold(runtime, inputDriver, targetPoint(step.target), step.ms)
      continue
    }

    if (step.action === 'screenshot') {
      const outputFile = path.join(outputDir, `${step.name}.png`)
      saveScreenshot(runtime, screenshotDriver, calibration, outputFile)
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

  if (!options.dryRun) {
    fs.mkdirSync(outputDir, { recursive: true })
    fs.writeFileSync(path.join(outputDir, 'execution.json'), JSON.stringify({
      scenarioId: scenario.id, calibrationPath, inputDriver, screenshotDriver,
      completedAt: new Date().toISOString(), disposition: 'Native screenshots and runtime logs require review before declaring validation passed.',
    }, null, 2) + '\n')
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
