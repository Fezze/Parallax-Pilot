// Regenerate the checked-in Zepp OS sprites with node scripts/render-game-sprites.mjs.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import {
  ASTEROID_RADIUS_MAX,
  ASTEROID_RADIUS_MIN,
  COLORS,
  WRIST_SIDES,
} from '../zepp-app/shared/constants.js'
import {
  createShipGeometry,
  SHIP_STROKE_WIDTH,
  updateShipPoints,
} from '../zepp-app/shared/game-core.js'

const appRoot = new URL('../zepp-app/', import.meta.url)
const { targets } = JSON.parse(readFileSync(new URL('app.json', appRoot), 'utf8'))
const padding = 2
const samplesPerAxis = 8
const pngSignature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

function pngChunk(type, data) {
  const chunk = Buffer.alloc(12 + data.length)
  chunk.writeUInt32BE(data.length)
  chunk.write(type, 4, 4, 'ascii')
  data.copy(chunk, 8)

  let checksum = 0xffffffff
  for (const byte of chunk.subarray(4, -4)) {
    checksum ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      checksum = (checksum >>> 1) ^ (checksum & 1 ? 0xedb88320 : 0)
    }
  }
  chunk.writeUInt32BE((checksum ^ 0xffffffff) >>> 0, chunk.length - 4)
  return chunk
}

function renderPng(width, height, color, isInk) {
  const stride = width * 4 + 1 // Each PNG row starts with a zero filter byte.
  const rows = Buffer.alloc(stride * height)
  const red = (color >> 16) & 0xff
  const green = (color >> 8) & 0xff
  const blue = color & 0xff

  // Integer coordinates denote pixel centers, as in the game geometry.
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let coverage = 0
      for (let row = 0; row < samplesPerAxis; row += 1) {
        const sampleY = y - 0.5 + (row + 0.5) / samplesPerAxis
        for (let column = 0; column < samplesPerAxis; column += 1) {
          const sampleX = x - 0.5 + (column + 0.5) / samplesPerAxis
          coverage += Number(isInk(sampleX, sampleY))
        }
      }

      const offset = y * stride + 1 + x * 4
      rows[offset] = red
      rows[offset + 1] = green
      rows[offset + 2] = blue
      rows[offset + 3] = Math.round(255 * coverage / samplesPerAxis ** 2)
    }
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // Bits per channel.
  header[9] = 6 // RGBA.
  return Buffer.concat([
    pngSignature,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(rows, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function renderAsteroid(radius) {
  const center = radius + padding
  const size = 2 * center + 1
  const inner = (radius - 1) ** 2
  const outer = (radius + 1) ** 2
  return renderPng(size, size, COLORS.asteroid, (x, y) => {
    const distance = (x - center) ** 2 + (y - center) ** 2
    return distance >= inner && distance <= outer
  })
}

function renderShip(viewport, wristSide) {
  const { w, h } = createShipGeometry(viewport, wristSide)
  const points = updateShipPoints(Array.from({ length: 5 }, () => ({})), {
    x: padding,
    y: padding,
    w,
    h,
    wristSide,
  })
  const segments = points.slice(0, -1).map((start, index) => {
    const dx = points[index + 1].x - start.x
    const dy = points[index + 1].y - start.y
    return { start, dx, dy, lengthSquared: dx ** 2 + dy ** 2 }
  })
  const strokeRadiusSquared = (SHIP_STROKE_WIDTH / 2) ** 2
  return renderPng(w + 2 * padding + 1, h + 2 * padding + 1, COLORS.ship, (x, y) => {
    return segments.some(({ start, dx, dy, lengthSquared }) => {
      const along = ((x - start.x) * dx + (y - start.y) * dy) / lengthSquared
      const nearest = Math.max(0, Math.min(1, along))
      return (x - start.x - nearest * dx) ** 2 + (y - start.y - nearest * dy) ** 2 <= strokeRadiusSquared
    })
  })
}

const asteroids = new Map()
for (let radius = ASTEROID_RADIUS_MIN; radius <= ASTEROID_RADIUS_MAX; radius += 1) {
  asteroids.set(`asteroid-${radius}.png`, renderAsteroid(radius))
}

for (const [target, { designWidth }] of Object.entries(targets)) {
  const isRound = target.startsWith('round-')
  const height = isRound ? designWidth : Number(target.split('x').at(-1))
  if (!Number.isInteger(height)) throw new Error(`Missing viewport height for ${target}`)

  const directory = new URL(`assets/${target}/game-sprites/`, appRoot)
  mkdirSync(directory, { recursive: true })
  for (const [name, png] of asteroids) {
    writeFileSync(new URL(name, directory), png)
  }
  for (const wristSide of WRIST_SIDES) {
    const viewport = { width: designWidth, height, isRound }
    writeFileSync(new URL(`ship-${wristSide}.png`, directory), renderShip(viewport, wristSide))
  }
}
