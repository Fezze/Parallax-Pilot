import test from 'node:test'
import assert from 'node:assert/strict'
import { advanceSimulationClock, createSimulationClock } from '../zepp-app/shared/simulation-clock.js'

test('simulation consumes only whole steps and carries the substep remainder', () => {
  const clock = createSimulationClock(1000)
  const updates = []
  const update = (dt, age) => { updates.push([dt, age]) }
  assert.equal(advanceSimulationClock(clock, 1009, update), 0)
  assert.equal(advanceSimulationClock(clock, 1033, update), 3)
  assert.deepEqual(updates, [[0.01, 10], [0.01, 20], [0.01, 30]])
  assert.equal(clock.pendingMs, 3)
})

test('ordinary updates are bounded to 25 steps even with an existing remainder', () => {
  const clock = createSimulationClock(0)
  advanceSimulationClock(clock, 9, () => {})
  assert.equal(advanceSimulationClock(clock, 259, () => {}), 25)
  assert.equal(clock.elapsedMs, 250)
  assert.equal(clock.pendingMs, 9)
})

test('long gaps pause in full without debt and preserve the ordinary remainder', () => {
  const clock = createSimulationClock(0)
  const update = () => {}
  advanceSimulationClock(clock, 19, update)
  for (const gap of [251, 1000, 60000, 3600000]) {
    const age = clock.elapsedMs
    assert.equal(advanceSimulationClock(clock, clock.lastFrameAt + gap, update), 0)
    assert.equal(clock.elapsedMs, age)
    assert.equal(clock.pendingMs, 9)
  }
  assert.equal(clock.pausedMs, 3661251)
  assert.equal(advanceSimulationClock(clock, clock.lastFrameAt + 1, update), 1)
  assert.equal(clock.elapsedMs, 20)
})

test('rollback, duplicate and invalid wall times cannot advance or replay time', () => {
  const clock = createSimulationClock(1000)
  const update = () => {}
  advanceSimulationClock(clock, 1020, update)
  for (const now of [1010, 1020, NaN, Infinity, -Infinity]) {
    assert.equal(advanceSimulationClock(clock, now, update), 0)
  }
  advanceSimulationClock(clock, 1030, update)
  assert.equal(clock.elapsedMs, 30)
  assert.equal(clock.lastFrameAt, 1030)
})

test('finishing a run stops catch-up at the fatal step', () => {
  const clock = createSimulationClock(0)
  assert.equal(advanceSimulationClock(clock, 200, (_dt, age) => age < 30), 3)
  assert.equal(clock.elapsedMs, 30)
  assert.equal(clock.pendingMs, 0)
})
