import http from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')
const port = 4173

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

function resolvePath(urlPath) {
  const cleanPath = urlPath === '/' ? '/tests/playwright/harness/index.html' : urlPath
  const decoded = decodeURIComponent(cleanPath.split('?')[0])
  const normalized = path.normalize(decoded).replace(/^(\.\.[\\/])+/, '')
  return path.join(rootDir, normalized)
}

const server = http.createServer(async (request, response) => {
  try {
    const filePath = resolvePath(request.url || '/')
    const body = await readFile(filePath)
    const ext = path.extname(filePath)
    response.writeHead(200, {
      'content-type': MIME_TYPES[ext] || 'application/octet-stream',
      'cache-control': 'no-store',
    })
    response.end(body)
  } catch (_error) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    response.end('not found')
  }
})

server.listen(port, '127.0.0.1')
