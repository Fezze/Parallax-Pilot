// Add a private QMP socket to this simulator instance using a temporary launcher.
// Installed simulator files and application sources are never modified.
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { connectSimulatorPage } from './simulator-cdp.mjs'
import { verifyNativeWindow } from './simulator-native-input.mjs'

let page
let overridden = false
try {
  if (process.platform !== 'linux') throw new Error('This native input adapter is verified on Linux only.')
  page = await connectSimulatorPage()
  const firmware = await page.evaluate(`(() => {
    const r = require('@electron/remote')
    return r.require(r.app.getAppPath() + '/build/electron/utils/fw.js').getFirmwareInfo()
  })()`)
  const binary = await fs.readFile(path.join(firmware.firmwarePath, 'qemu_linux', 'qemu-system-arm'))
  // Fingerprints of the inspected vendor GTK pointer encoding, not stock QEMU.
  if (!binary.includes(Buffer.from('81ca0008ff7f', 'hex')) || !binary.includes(Buffer.from('81cd0000ff7f', 'hex'))) {
    throw new Error('Installed QEMU does not match the verified Zepp pointer encoding.')
  }
  const launcher = await fs.readFile(path.join(firmware.firmwarePath, firmware.firmwareScript), 'utf8')
  if (!launcher.includes('-serial stdio')) throw new Error('Unrecognized simulator firmware launcher.')
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'parallax-native-'))
  const socketPath = path.join(directory, 'qmp.sock')
  await fs.symlink(path.join(firmware.firmwarePath, 'qemu_linux'), path.join(directory, 'qemu_linux'), 'dir')
  await fs.writeFile(path.join(directory, firmware.firmwareScript), launcher.replaceAll('-serial stdio', `-serial stdio -qmp unix:${socketPath},server=on,wait=off`))
  const override = `(() => {
    const base = process.mainModule.require('electron').app.getAppPath()
    const fw = process.mainModule.require(base + '/build/electron/utils/fw.js')
    if (global.parallaxNativeFirmwareInfo) throw new Error('Native setup already in progress')
    global.parallaxNativeFirmwareInfo = fw.getFirmwareInfo
    fw.getFirmwareInfo = () => (${JSON.stringify({ ...firmware, firmwarePath: directory })})
    process.mainModule.require(base + '/build/electron/process/create-simulator.js').createHuamiSimulator(true)
    return true
  })()`
  // Only restart when this one simulator owns the sole QEMU client window.
  const windowInfo = await page.evaluate(`require('@electron/remote').require('child_process').execFileSync('xwininfo',['-root','-tree'],{encoding:'utf8'})`)
  if (windowInfo.split('\n').filter(line => line.includes('"Qemu-system-arm"') && line.includes('"Zepp OS Simulator"')).length !== 1) throw new Error('Expected one simulator firmware window before restart.')
  overridden = true
  await page.evaluate(`require('@electron/remote').require('vm').runInThisContext(${JSON.stringify(override)})`)
  const deadline = Date.now() + 20000
  while (true) {
    try { await fs.access(socketPath); break } catch {
      if (Date.now() > deadline) throw new Error('Native QMP socket did not start.')
      await new Promise(resolve => setTimeout(resolve, 250))
    }
  }
  let target
  while (!target) {
    try { target = verifyNativeWindow(socketPath) } catch (error) {
      if (Date.now() > deadline) throw error
      await new Promise(resolve => setTimeout(resolve, 250))
    }
  }
  while (!await page.evaluate(`(() => {const r=require('@electron/remote');const s=r.require(r.app.getAppPath()+'/build/electron/modules/store.js').sysStore;return s.get('simuOpen')==='1' && s.get('firmwareSimulatorIsReady')===true})()`)) {
    if (Date.now() > deadline) throw new Error('Native firmware did not become ready.')
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  await new Promise(resolve => setTimeout(resolve, 2000))
  const session = { socketPath, ...target, qemuSha256: createHash('sha256').update(binary).digest('hex'), createdAt: new Date().toISOString() }
  await fs.writeFile(path.join(directory, 'session.json'), JSON.stringify(session, null, 2) + '\n')
  console.log(`Native input ready. Set ZEPP_SIMULATOR_QMP_SOCKET=${socketPath}`)
  console.log(`Verified QEMU window ${target.windowId}, pid ${target.pid}. Host cursor and focus are not used.`)
} catch (error) { console.error(error.message); process.exitCode = 1 }
finally {
  if (overridden && page) {
    await page.evaluate(`require('@electron/remote').require('vm').runInThisContext("(() => {const fw = process.mainModule.require(process.mainModule.require('electron').app.getAppPath() + '/build/electron/utils/fw.js');if(global.parallaxNativeFirmwareInfo){fw.getFirmwareInfo=global.parallaxNativeFirmwareInfo;delete global.parallaxNativeFirmwareInfo}return true})()")`).catch(error => { console.error(`Restore firmware launcher: ${error.message}`); process.exitCode = 1 })
  }
  page?.close()
}
