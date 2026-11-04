// Zepp QEMU 6.2.50 uses tagged absolute coordinates in relative mouse events.
// This module never moves the host pointer, activates a window or grabs input.
import fs from 'node:fs'
import net from 'node:net'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export function pointerEvents(x, y, button) {
  if (![x, y].every(value => Number.isInteger(value) && value >= 0 && value <= 2047)) throw new Error('Native pointer coordinates must be integers in 0–2047.')
  const tag = button === undefined ? 0x7fff0000 : 0x7fff0800
  return [
    ...(button === undefined ? [] : [{ type: 'btn', data: { button: 'left', down: button } }]),
    { type: 'rel', data: { axis: 'x', value: tag | x } },
    { type: 'rel', data: { axis: 'y', value: tag | y } },
  ]
}

export function verifyNativeWindow(socketPath, run = spawnSync, read = fs.readFileSync) {
  const execute = (name, args) => {
    const result = run(name, args, { encoding: 'utf8' })
    if (result.error) throw result.error
    if (result.status !== 0) throw new Error(`Cannot verify native window: ${name} failed.`)
    return result.stdout
  }
  const lines = execute('xwininfo', ['-root', '-tree']).split('\n').filter(line => line.includes('"Qemu-system-arm"') && line.includes('"Zepp OS Simulator"'))
  if (lines.length !== 1) throw new Error('Expected exactly one native QEMU client window; refusing ambiguous input.')
  const id = lines[0].trim().split(' ')[0]
  const window = execute('xwininfo', ['-id', id, '-stats'])
  if (!/Map State:\s+IsViewable/.test(window)) throw new Error('Native QEMU window is no longer visible.')
  const pid = Number(execute('xprop', ['-id', id, '_NET_WM_PID']).match(/=\s*(\d+)/)?.[1])
  if (!Number.isInteger(pid) || pid <= 0) throw new Error('Native window has no verifiable process.')
  const command = read(`/proc/${pid}/cmdline`, 'utf8').split('\0')
  if (!command[0].includes('qemu-system-arm') || !command.some(arg => arg.startsWith(`unix:${socketPath},`))) {
    throw new Error('Native window does not belong to the configured QMP process.')
  }
  return { windowId: id, pid, window: window.trim() }
}

export async function connectQmp(socketPath) {
  const socket = net.createConnection(socketPath)
  let buffer = ''
  let nextId = 0
  const pending = new Map()
  let greet, rejectGreeting
  const greeting = new Promise((resolve, reject) => { greet = resolve; rejectGreeting = reject })
  const greetingTimer = setTimeout(() => socket.destroy(new Error('QMP greeting timed out.')), 5000)
  socket.on('data', data => {
    buffer += data.toString()
    let end
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end).trim(); buffer = buffer.slice(end + 1)
      if (!line) continue
      let message
      try { message = JSON.parse(line) } catch { socket.destroy(new Error('Invalid QMP response.')); return }
      if (message.QMP) { clearTimeout(greetingTimer); greet(message.QMP) }
      const request = pending.get(message.id)
      if (!request) continue
      clearTimeout(request.timer); pending.delete(message.id)
      if (message.error) request.reject(new Error(message.error.desc))
      else request.resolve(message.return)
    }
  })
  const fail = error => {
    clearTimeout(greetingTimer); rejectGreeting(error)
    for (const request of pending.values()) { clearTimeout(request.timer); request.reject(error) }
    pending.clear()
  }
  socket.on('error', fail)
  socket.on('close', () => fail(new Error('QMP connection closed.')))
  const command = (execute, args) => new Promise((resolve, reject) => {
    const id = ++nextId
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`QMP ${execute} timed out.`)) }, 5000)
    pending.set(id, { resolve, reject, timer })
    socket.write(JSON.stringify({ execute, arguments: args, id }) + '\n')
  })
  try {
    const version = await greeting
    if (version.version.qemu.major !== 6 || version.version.qemu.minor !== 2) throw new Error('Native input adapter is verified only for Zepp QEMU 6.2.')
    await command('qmp_capabilities')
    return { command, close() { socket.destroy() } }
  } catch (error) { socket.destroy(); throw error }
}

export async function performPointerAction(action, point, options, send, verify, wait = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  const emit = async (x, y, button) => { verify(); await send(pointerEvents(x, y, button)) }
  if (!['tap', 'hold', 'swipe'].includes(action)) throw new Error('Unsupported native pointer action.')
  const duration = action === 'tap' ? 100 : options.ms
  if (!Number.isFinite(duration) || duration < 1 || duration > 10000) throw new Error('Native duration must be 1–10000 ms.')
  // Validate all endpoints before pressing anything.
  pointerEvents(point.x, point.y)
  const end = action === 'swipe' ? { x: point.x + options.dx, y: point.y + options.dy } : point
  pointerEvents(end.x, end.y)
  await emit(point.x, point.y)
  await emit(point.x, point.y, true)
  try {
    if (action === 'swipe') {
      for (let index = 1; index <= 10; index += 1) {
        await wait(duration / 10)
        await emit(Math.round(point.x + options.dx * index / 10), Math.round(point.y + options.dy * index / 10))
      }
    } else await wait(duration)
  } finally {
    await emit(end.x, end.y, false)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let client
  try {
    const socketPath = process.env.ZEPP_SIMULATOR_QMP_SOCKET
    if (!socketPath) throw new Error('Run npm run sim:input first and set ZEPP_SIMULATOR_QMP_SOCKET.')
    const [action, payload] = process.argv.slice(2)
    const { point, options } = JSON.parse(payload)
    const target = verifyNativeWindow(socketPath)
    client = await connectQmp(socketPath)
    await performPointerAction(action, point, options, events => client.command('input-send-event', { events }), () => verifyNativeWindow(socketPath))
    console.log(`Native ${action} delivered to window ${target.windowId}, process ${target.pid}; host input untouched.`)
  } catch (error) { console.error(error.message); process.exitCode = 1 }
  finally { client?.close() }
}
