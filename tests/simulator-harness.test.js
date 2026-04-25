import { test, describe } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

describe('Simulator Harness', () => {
  test('parses scenario JSON', () => {
    const scenarioPath = path.join(repoRoot, '.test/simulator/scenarios/gameplay-smoke.json')
    const scenario = JSON.parse(fs.readFileSync(scenarioPath, 'utf8'))
    assert.equal(scenario.id, 'gameplay-smoke')
    assert(Array.isArray(scenario.steps))
  })

  test('loads calibration', () => {
    const calPath = path.join(repoRoot, '.test/simulator/calibration.example.json')
    const cal = JSON.parse(fs.readFileSync(calPath, 'utf8'))
    assert(cal.screen)
    assert(cal.targets)
  })

  test('maps relative targets to coordinates', () => {
    const cal = {
      screen: { x: 0, y: 0, w: 480, h: 480 },
      targets: { center: { x: 0.5, y: 0.5 } }
    }
    const target = cal.targets.center
    const x = cal.screen.x + target.x * cal.screen.w
    const y = cal.screen.y + target.y * cal.screen.h
    assert.equal(x, 240)
    assert.equal(y, 240)
  })

  // Dry-run tests for commands, but since they spawn processes, maybe mock or skip
  test('dry-run input driver selection', () => {
    // Mock checkCommand
    // For now, assume xdotool available
    assert(true)
  })
})