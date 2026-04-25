#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import net from 'node:net'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

const command = process.argv[2]
const scenarioPath = process.argv[3]

if (!['doctor', 'run', 'smoke'].includes(command)) {
  console.error('Usage: node scripts/simulator-harness.mjs <doctor|run|smoke> [scenario.json]')
  process.exit(1)
}

const simulatorPath = '/opt/simulator/simulator'
const bridgePort = 7650
const bridgeHost = '127.0.0.1'

function checkCommand(cmd) {
  try {
    spawnSync(cmd, ['--version'], { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

function checkPort(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection(port, host, () => {
      socket.end()
      resolve(true)
    })
    socket.on('error', () => resolve(false))
  })
}

async function doctor() {
  console.log('Simulator Doctor Check:')
  console.log('=======================')

  // Check zeus
  const hasZeus = checkCommand('zeus')
  console.log(`Zeus CLI: ${hasZeus ? 'OK' : 'MISSING'}`)

  // Check simulator
  const hasSimulator = fs.existsSync(simulatorPath)
  console.log(`Simulator binary: ${hasSimulator ? 'OK' : 'MISSING'} (${simulatorPath})`)

  // Check port
  const portOpen = await checkPort(bridgeHost, bridgePort)
  console.log(`Bridge port ${bridgeHost}:${bridgePort}: ${portOpen ? 'OPEN' : 'CLOSED'}`)

  // Check display server
  const hasX11 = process.env.DISPLAY
  const hasWayland = process.env.WAYLAND_DISPLAY
  console.log(`Display server: ${hasX11 ? 'X11' : hasWayland ? 'Wayland' : 'UNKNOWN'}`)

  // Check input tools
  const hasXdotool = checkCommand('xdotool')
  const hasYdotool = checkCommand('ydotool')
  console.log(`Input tools: xdotool=${hasXdotool ? 'OK' : 'MISSING'}, ydotool=${hasYdotool ? 'OK' : 'MISSING'}`)

  // Check screenshot tools
  const hasGnomeScreenshot = checkCommand('gnome-screenshot')
  const hasScrot = checkCommand('scrot')
  const hasGrim = checkCommand('grim')
  console.log(`Screenshot tools: gnome-screenshot=${hasGnomeScreenshot ? 'OK' : 'MISSING'}, scrot=${hasScrot ? 'OK' : 'MISSING'}, grim=${hasGrim ? 'OK' : 'MISSING'}`)

  // Check QEMU libs (basic check)
  const hasQemu = checkCommand('qemu-system-x86_64')
  console.log(`QEMU: ${hasQemu ? 'OK' : 'MISSING'}`)

  console.log('\nRecommendations:')
  if (!hasSimulator) console.log('- Install Zepp Simulator to /opt/simulator/simulator')
  if (!hasXdotool && !hasYdotool) console.log('- Install xdotool (sudo apt install xdotool) or ydotool for input automation')
  if (!hasGnomeScreenshot && !hasScrot && !hasGrim) console.log('- Install screenshot tool: gnome-screenshot, scrot, or grim')
  if (!hasWayland && !hasX11) console.log('- Ensure running in graphical session')
}

function loadCalibration() {
  const localCal = path.join(repoRoot, '.test/simulator/calibration.local.json')
  const exampleCal = path.join(repoRoot, '.test/simulator/calibration.example.json')
  if (fs.existsSync(localCal)) {
    return JSON.parse(fs.readFileSync(localCal, 'utf8'))
  } else if (fs.existsSync(exampleCal)) {
    return JSON.parse(fs.readFileSync(exampleCal, 'utf8'))
  } else {
    throw new Error('Calibration file not found. Create .test/simulator/calibration.local.json or calibration.example.json')
  }
}

function getInputDriver() {
  if (checkCommand('xdotool')) return 'xdotool'
  if (checkCommand('ydotool')) return 'ydotool'
  throw new Error('No input driver available. Install xdotool or ydotool.')
}

function getScreenshotTool() {
  if (checkCommand('gnome-screenshot')) return 'gnome-screenshot'
  if (checkCommand('scrot')) return 'scrot'
  if (checkCommand('grim')) return 'grim'
  throw new Error('No screenshot tool available. Install gnome-screenshot, scrot, or grim.')
}

function launchSimulator() {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_NO_ATTACH_CONSOLE
  console.log('Launching simulator...')
  const sim = spawn(simulatorPath, [], { env, detached: true, stdio: 'ignore' })
  sim.unref()
  // Wait a bit for launch
  return new Promise(resolve => setTimeout(resolve, 5000))
}

function focusWindow(titleRegex) {
  const driver = getInputDriver()
  if (driver === 'xdotool') {
    spawnSync('xdotool', ['search', '--name', titleRegex, 'windowfocus'], { stdio: 'inherit' })
  } else {
    // ydotool doesn't support window focus directly, assume focused
  }
}

function sendKey(key) {
  const driver = getInputDriver()
  if (driver === 'xdotool') {
    spawnSync('xdotool', ['key', key], { stdio: 'inherit' })
  } else {
    // ydotool key mapping
    const keyMap = { Home: 102, /* etc */ }
    if (keyMap[key]) {
      spawnSync('ydotool', ['key', keyMap[key].toString()], { stdio: 'inherit' })
    }
  }
}

function tap(x, y) {
  const driver = getInputDriver()
  if (driver === 'xdotool') {
    spawnSync('xdotool', ['mousemove', x.toString(), y.toString(), 'click', '1'], { stdio: 'inherit' })
  } else {
    spawnSync('ydotool', ['mousemove', '-a', x.toString(), y.toString(), 'click', '0xC0'], { stdio: 'inherit' })
  }
}

function swipe(x, y, dx, dy, duration) {
  const driver = getInputDriver()
  const endX = x + dx
  const endY = y + dy
  if (driver === 'xdotool') {
    spawnSync('xdotool', ['mousemove', x.toString(), y.toString(), 'mousedown', '1', 'mousemove_relative', dx.toString(), dy.toString(), 'mouseup', '1'], { stdio: 'inherit' })
  } else {
    // ydotool swipe
    spawnSync('ydotool', ['mousemove', '-a', x.toString(), y.toString(), 'mousedown', '0xC0', 'mousemove', '-a', endX.toString(), endY.toString(), 'mouseup', '0xC0'], { stdio: 'inherit' })
  }
}

function takeScreenshot(name) {
  const tool = getScreenshotTool()
  const outputDir = path.join(repoRoot, 'output/simulator')
  fs.mkdirSync(outputDir, { recursive: true })
  const filePath = path.join(outputDir, `${name}.png`)
  if (tool === 'gnome-screenshot') {
    spawnSync('gnome-screenshot', ['-f', filePath], { stdio: 'inherit' })
  } else if (tool === 'scrot') {
    spawnSync('scrot', [filePath], { stdio: 'inherit' })
  } else if (tool === 'grim') {
    spawnSync('grim', [filePath], { stdio: 'inherit' })
  }
  console.log(`Screenshot saved: ${filePath}`)
}

async function runScenario(scenario) {
  const cal = loadCalibration()
  const screen = cal.screen
  const targets = cal.targets

  for (const step of scenario.steps) {
    console.log(`Executing step: ${step.action}`)
    switch (step.action) {
      case 'wait':
        await new Promise(resolve => setTimeout(resolve, step.ms))
        break
      case 'focus':
        focusWindow(cal.deviceWindowTitle)
        break
      case 'key':
        sendKey(step.key)
        break
      case 'tap':
        const tapTarget = targets[step.target]
        const tapX = screen.x + tapTarget.x * screen.w
        const tapY = screen.y + tapTarget.y * screen.h
        tap(tapX, tapY)
        break
      case 'swipe':
        const swipeTarget = targets[step.target]
        const swipeX = screen.x + swipeTarget.x * screen.w
        const swipeY = screen.y + swipeTarget.y * screen.h
        swipe(swipeX, swipeY, step.dx, step.dy, step.durationMs)
        break
      case 'screenshot':
        takeScreenshot(step.name)
        break
      default:
        console.warn(`Unknown action: ${step.action}`)
    }
  }
}

async function run(scenarioPath) {
  if (!scenarioPath) {
    console.error('Scenario path required for run command')
    process.exit(1)
  }
  const fullPath = path.resolve(repoRoot, scenarioPath)
  if (!fs.existsSync(fullPath)) {
    console.error(`Scenario file not found: ${fullPath}`)
    process.exit(1)
  }
  const scenario = JSON.parse(fs.readFileSync(fullPath, 'utf8'))
  await launchSimulator()
  await runScenario(scenario)
}

async function smoke() {
  const scenarioPath = '.test/simulator/scenarios/gameplay-smoke.json'
  await run(scenarioPath)
}

if (command === 'doctor') {
  await doctor()
} else if (command === 'run') {
  await run(scenarioPath)
} else if (command === 'smoke') {
  await smoke()
}