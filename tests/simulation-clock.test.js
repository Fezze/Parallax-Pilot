import test from 'node:test'
import assert from 'node:assert/strict'
import { advanceSimulationClock, advanceSimulationClockBatched, createSimulationClock } from '../zepp-app/shared/simulation-clock.js'

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

test('batched admission matches legacy clock state and step ages across callback cadences', () => {
  const ordinary = createSimulationClock(0)
  const batched = createSimulationClock(0)
  const ordinaryAges = []
  const batchedAges = []
  let batchCalls = 0
  let processedSteps = 0
  for (const gap of [7, 19, 40, 250, 251, 13, 103, 260, 1, 90]) {
    const now = ordinary.lastFrameAt + gap
    advanceSimulationClock(ordinary, now, (_dt, age) => { ordinaryAges.push(age) })
    advanceSimulationClockBatched(batched, now, (steps, fromElapsedMs) => {
      batchCalls += 1
      processedSteps += steps
      for (let index = 1; index <= steps; index += 1) batchedAges.push(fromElapsedMs + index * 10)
      return { steps, stopped: false }
    })
  }
  assert.deepEqual(batched, ordinary)
  assert.deepEqual(batchedAges, ordinaryAges)
  assert.equal(processedSteps, ordinaryAges.length)
  assert.ok(batchCalls < processedSteps)
})

test('batched rollback, duplicate, invalid, pause and fractional carry follow legacy policies', () => {
  const clock = createSimulationClock(1000)
  const callbackAges = []
  let callbacks = 0
  const updateBlock = (steps, fromElapsedMs) => {
    callbacks += 1
    for (let index = 1; index <= steps; index += 1) callbackAges.push(fromElapsedMs + index * 10)
    return { steps, stopped: false }
  }
  const first = advanceSimulationClockBatched(clock, 1019, updateBlock)
  assert.equal(first, 1)
  assert.equal(clock.pendingMs, 9)
  for (const now of [1005, 1019, NaN, Infinity, -Infinity]) {
    assert.equal(advanceSimulationClockBatched(clock, now, updateBlock), 0)
  }
  assert.equal(clock.lastFrameAt, 1019)
  assert.equal(advanceSimulationClockBatched(clock, 1270, updateBlock), 0)
  assert.equal(clock.pausedMs, 251)
  assert.equal(clock.pendingMs, 9)
  assert.equal(advanceSimulationClockBatched(clock, 1271, updateBlock), 1)
  assert.equal(clock.elapsedMs, 20)
  assert.equal(clock.pendingMs, 0)
  assert.equal(callbacks, 2)
  assert.deepEqual(callbackAges, [10, 20])
})

test('batched processing reserves admitted time before callback and finalizes at fatal event time', () => {
  const clock = createSimulationClock(0)
  clock.pendingMs = 9
  let callbackCount = 0
  const callbackResult = { steps: 3, stopped: true }
  const result = advanceSimulationClockBatched(clock, 200, (steps, fromElapsedMs) => {
    callbackCount += 1
    assert.equal(steps, 20)
    assert.equal(fromElapsedMs, 0)
    assert.equal(clock.lastFrameAt, 200)
    assert.equal(clock.pendingMs, 9) // All 20 admitted steps were deducted before callback entry.
    assert.equal(clock.elapsedMs, 0)
    clock.elapsedMs = fromElapsedMs + 30 // Shared clock can expose an event instant while the block runs.
    return callbackResult
  })
  assert.equal(result, 3)
  assert.equal(callbackCount, 1)
  assert.ok(callbackCount < result)
  assert.equal(clock.elapsedMs, 30)
  assert.equal(clock.pendingMs, 0)
})

test('stopped on the last admitted step still clears pending time', () => {
  const clock = createSimulationClock(0)
  clock.pendingMs = 9
  const result = advanceSimulationClockBatched(clock, 29, () => ({ steps: 3, stopped: true }))
  assert.equal(result, 3)
  assert.equal(clock.elapsedMs, 30)
  assert.equal(clock.pendingMs, 0)
})

test('batched callback is skipped for pause or zero steps and invalid return contracts throw', () => {
  const clock = createSimulationClock(0)
  let called = false
  const updateBlock = () => { called = true; return { steps: 0, stopped: false } }
  assert.equal(advanceSimulationClockBatched(clock, 9, updateBlock), 0)
  assert.equal(advanceSimulationClockBatched(clock, 260, updateBlock), 0)
  assert.equal(called, false)

  for (const badResult of [null, { steps: 1, stopped: false }, { steps: 3, stopped: true }, { steps: 1, stopped: 1 }]) {
    const fresh = createSimulationClock(0)
    assert.throws(() => advanceSimulationClockBatched(fresh, 20, () => badResult), /updateBlock must return/)
  }
})
