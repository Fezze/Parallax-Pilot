// Minimal CDP connection: Electron may reject Playwright browser-context setup.
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import WebSocket from 'ws'

export async function connectSimulatorPage(env = process.env) {
  const configRoot = env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
  const portFile = env.ZEPP_SIMULATOR_CDP_PORT_FILE || path.join(configRoot, 'simulator', 'DevToolsActivePort')
  const port = Number((await fs.readFile(portFile, 'utf8')).split('\n')[0])
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid simulator DevTools port.')
  const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(10000) })
  const target = (await response.json()).find((page) => page.type === 'page' && page.url.startsWith('file:'))
  if (!target) throw new Error('No simulator Electron page is available.')
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.close(); reject(new Error('Simulator debug connection timed out.')) }, 10000)
    socket.addEventListener('open', () => { clearTimeout(timer); resolve() }, { once: true })
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Simulator debug connection failed.')) }, { once: true })
  })
  let nextId = 0
  const pending = new Map()
  socket.addEventListener('message', (event) => {
    const result = JSON.parse(event.data)
    const request = pending.get(result.id)
    if (!request) return
    pending.delete(result.id)
    clearTimeout(request.timer)
    if (result.error) request.reject(new Error(result.error.message))
    else request.resolve(result.result)
  })
  socket.addEventListener('close', () => {
    for (const request of pending.values()) {
      clearTimeout(request.timer)
      request.reject(new Error('Simulator debug connection closed.'))
    }
    pending.clear()
  })
  function send(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++nextId
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Simulator ${method} timed out.`)) }, 20000)
      pending.set(id, { resolve, reject, timer })
      socket.send(JSON.stringify({ id, method, params }))
    })
  }
  return {
    async evaluate(expression) {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
      return result.result.value
    },
    close() { socket.terminate() },
  }
}
