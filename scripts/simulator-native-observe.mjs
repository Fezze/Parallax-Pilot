// Record native gameplay before asking the operator to start the run.
import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { verifyDeployedApp } from './simulator-harness-core.mjs'
import { captureNativeScreenshot } from './simulator-native-screenshot.mjs'
import { connectSimulatorPage } from './simulator-cdp.mjs'

const args = process.argv.slice(2)
const options = { count: 120, intervalMs: 1000, outputDir: 'output/simulator/native-observation' }
let recording
try {
  while (args.length) {
    const flag = args.shift()
    if (!['--count', '--interval-ms', '--output-dir', '--runtime-log'].includes(flag) || !args.length) throw new Error(`Invalid observation argument: ${flag}`)
    const value = args.shift()
    if (flag === '--count') options.count = Number(value)
    if (flag === '--interval-ms') options.intervalMs = Number(value)
    if (flag === '--output-dir') options.outputDir = value
    if (flag === '--runtime-log') options.runtimeLog = path.resolve(value)
  }
  if (!Number.isInteger(options.count) || options.count < 2 || options.count > 600) throw new Error('Observation count must be 2–600.')
  if (!Number.isInteger(options.intervalMs) || options.intervalMs < 250 || options.intervalMs > 10000) throw new Error('Observation interval must be 250–10000 ms.')
  const deployment = verifyDeployedApp(process.cwd())
  const outputDir = path.resolve(options.outputDir)
  await fs.mkdir(outputDir, { recursive: true })
  // Do not overwrite an earlier validation run by accident.
  const metadataPath = path.join(outputDir, 'observation.json')
  const descriptor = await fs.open(metadataPath, 'wx')
  await descriptor.close()
  const page = await connectSimulatorPage()
  let profile
  try {
    profile = await page.evaluate(`(() => {
      const remote = require('@electron/remote')
      const store = remote.require(remote.app.getAppPath() + '/build/electron/modules/store.js').sysStore
      const platform = store.get('platform')
      const device = JSON.parse(store.get('selectDeviceList')).find(item => item.id === platform)
      const nativeLogPath = remote.require(remote.app.getAppPath() + '/build/electron/modules/console/console.model.js').ConsoleInstanceModel.instance.debugFile
      return { model: device.modelName, firmware: device.code, apiLevel: device.api_level, platform, nativeLogPath }
    })()`)
  } finally { page.close() }
  const metadata = { startedAt: new Date().toISOString(), deployment, profile, runtimeLog: options.runtimeLog,
    input: 'Operator controls the actual simulator. The recorder does not alter game state.',
    disposition: 'Review native frames and runtime logs before accepting the run.', frames: [] }
  const record = () => fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2) + '\n')
  recording = { metadata, record, outputDir }
  await record()
  const started = Date.now()
  console.log(`Native recorder ready: ${profile.model}, app ${deployment.version.name}. Start gameplay now.`)
  for (let index = 0; index < options.count; index += 1) {
    const delay = started + index * options.intervalMs - Date.now()
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay))
    const name = `frame-${String(index).padStart(3, '0')}.png`
    const filename = path.join(outputDir, name)
    await captureNativeScreenshot(filename)
    const data = await fs.readFile(filename)
    metadata.frames.push({ name, capturedAt: new Date().toISOString(), sha256: createHash('sha256').update(data).digest('hex') })
    await record()
    if (index % 10 === 0) console.log(`Captured ${index + 1}/${options.count} native frames.`)
  }
  if (options.runtimeLog) await fs.copyFile(options.runtimeLog, path.join(outputDir, 'runtime.log'))
  if (profile.nativeLogPath) await fs.copyFile(profile.nativeLogPath, path.join(outputDir, 'native-console.log'))
  metadata.completedAt = new Date().toISOString()
  metadata.distinctFrames = new Set(metadata.frames.map(frame => frame.sha256)).size
  await record()
  console.log(`Recorded ${metadata.frames.length} frames (${metadata.distinctFrames} distinct). Native review is still required.`)
} catch (error) {
  if (recording) {
    recording.metadata.failedAt = new Date().toISOString()
    recording.metadata.error = error.message
    await recording.record()
    if (options.runtimeLog) await fs.copyFile(options.runtimeLog, path.join(recording.outputDir, 'runtime.log')).catch(() => {})
    if (recording.metadata.profile.nativeLogPath) await fs.copyFile(recording.metadata.profile.nativeLogPath, path.join(recording.outputDir, 'native-console.log')).catch(() => {})
  }
  console.error(error.message)
  process.exitCode = 1
}
