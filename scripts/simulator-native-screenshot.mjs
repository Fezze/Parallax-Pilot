// Capture the firmware framebuffer, not the Electron shell.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { connectSimulatorPage } from './simulator-cdp.mjs'

export async function captureNativeScreenshot(outputFile, env = process.env) {
  const page = await connectSimulatorPage(env)
  try {
    const requestFrame = () => page.evaluate(`(async () => {
      const remote = window.require('@electron/remote')
      const screenshot = remote.require(remote.app.getAppPath() + '/build/electron/modules/screenshot/screenshot.model.js').default
      return await screenshot.getEmulatorScreenshot()
    })()`)
    let screenshotPath
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        screenshotPath = await requestFrame()
        break
      } catch (error) {
        // Simulator 2.1.1 leaves old 90-second screenshot timers running. An
        // old timer can reject a later pending capture. Retry once, sequentially,
        // off that timer boundary; real service failures must still surface.
        if (attempt || !/Uncaught.*promise/.test(error.message)) throw error
        await new Promise(resolve => setTimeout(resolve, 250))
      }
    }
    const data = await fs.readFile(screenshotPath)
    if (data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Firmware did not return a PNG screenshot.')
    await fs.mkdir(path.dirname(outputFile), { recursive: true })
    await fs.writeFile(outputFile, data)
    await fs.unlink(screenshotPath)
  } finally {
    page.close()
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (!process.argv[2]) throw new Error('An output PNG path is required.')
    await captureNativeScreenshot(path.resolve(process.argv[2]))
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
