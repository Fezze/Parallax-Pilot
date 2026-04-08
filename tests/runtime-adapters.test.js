import test from 'node:test'
import assert from 'node:assert/strict'
import { MAX_SCORE_HISTORY } from '../zepp-app/shared/constants.js'
import { resolveTravelDirection, supportsDigitalCrown } from '../zepp-app/shared/device.js'
import {
  appendScore,
  readLastSession,
  readSettings,
  writeLastSession,
  writeSettings,
} from '../zepp-app/shared/persistence.js'
import {
  buildScoreRow,
  getAvailableControlModes,
  paginateScores,
} from '../zepp-app/shared/view-models.js'

function createMemoryStorage() {
  const map = new Map()
  return {
    getItem(key, fallback = null) {
      return map.has(key) ? map.get(key) : fallback
    },
    setItem(key, value) {
      map.set(key, value)
    },
  }
}

test('settings storage round-trips defaults and sanitized values', () => {
  const storage = createMemoryStorage()
  const defaults = readSettings(storage)
  writeSettings(storage, {
    ...defaults,
    controlMode: 'swipe',
    spawnMultiplier: 1.25,
  })

  const saved = readSettings(storage)
  assert.equal(saved.controlMode, 'swipe')
  assert.equal(saved.spawnMultiplier, 1.25)
})

test('score history append keeps newest 100 items', () => {
  const storage = createMemoryStorage()

  for (let index = 0; index < MAX_SCORE_HISTORY + 8; index += 1) {
    appendScore(storage, {
      id: `run-${index}`,
      timestamp: index,
      score: index,
      survivedMs: index,
    })
  }

  const storedScores = JSON.parse(storage.getItem('scores_v1'))
  const paged = paginateScores(storedScores, 0)
  assert.equal(paged.items[0].timestamp, MAX_SCORE_HISTORY + 7)
  assert.equal(storedScores.length, MAX_SCORE_HISTORY)
})

test('last session persistence and route helpers work without Zepp runtime', () => {
  const storage = createMemoryStorage()
  writeLastSession(storage, { score: 999 })

  assert.deepEqual(readLastSession(storage), { score: 999 })
  assert.equal(resolveTravelDirection('left'), 'right')
})

test('device helpers expose only active control modes', () => {
  assert.equal(supportsDigitalCrown({ keyType: 'normal_21' }), true)
  assert.equal(supportsDigitalCrown({ keyType: 'sport_40' }), false)
  assert.deepEqual(getAvailableControlModes(), ['tilt', 'touch', 'swipe'])
})

test('score pagination and row formatting stay deterministic', () => {
  const scores = [
    { score: 1500, survivedMs: 1250 },
    { score: 1200, survivedMs: 980 },
    { score: 900, survivedMs: 600 },
  ]

  const page = paginateScores(scores, 0, 2)
  assert.equal(page.pageCount, 2)
  assert.equal(buildScoreRow(page.items[0], 0), '01  1500  1.25s')
})
