import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clearPointerCapture,
  createPointerCapture,
  createPointerInputQueue,
  enqueuePointerInput,
  MAX_POINTER_COMMANDS,
  recordPointerSample,
} from '../zepp-app/shared/pointer-input.js'
import { createSimulationClock } from '../zepp-app/shared/simulation-clock.js'

test('coalescing keeps the final swipe anchor and movement within a simulation quantum', () => {
  const queue = createPointerInputQueue(true)
  const clock = createSimulationClock(0)
  for (const [kind, y, at] of [['down',100,151],['move',120,152],['up',undefined,153],['down',200,154],['move',240,155]]) {
    enqueuePointerInput(queue,kind,y,at,clock)
  }
  assert.deepEqual(queue.events.map(({kind,y,at})=>({kind,y,at})), [
    {kind:'down',y:200,at:154},{kind:'move',y:240,at:155},
  ])
  assert.equal(queue.down,true)
})

test('high-rate input is bounded and reuses the same command storage', () => {
  const capture = createPointerCapture()
  const queue = createPointerInputQueue(true)
  const pool = [...queue.pool]
  const clock = createSimulationClock(0)
  let at = 0
  const now = () => at
  recordPointerSample(capture, queue, clock, 'swipe', 200, 'down', 100, now)
  for (let i = 1; i <= 25000; i++) {
    at = i / 100
    recordPointerSample(capture, queue, clock, 'swipe', 200, 'move', i, now)
    assert.ok(queue.events.length <= MAX_POINTER_COMMANDS)
  }
  assert.ok(queue.events.every(command => pool.includes(command)))
  assert.deepEqual(capture, { down: true, y: 25000 })
  assert.equal(queue.y, 25000)
  assert.deepEqual(clock, createSimulationClock(0))
  queue.events.length = 0
  clock.lastFrameAt = 250
  at = 251
  recordPointerSample(capture, queue, clock, 'swipe', 200, 'move', 25001, now)
  assert.equal(queue.events[0], pool[0])
  clearPointerCapture(capture)
  assert.deepEqual(capture, createPointerCapture())
})

test('touch capture filters same-half motion before it can replace a crossing timestamp', () => {
  const capture = createPointerCapture()
  const queue = createPointerInputQueue()
  const clock = createSimulationClock(1000)
  for (const [kind, y, at] of [
    ['move', 220, 1001], ['down', 100, 1003], ['move', 190, 1004],
    ['move', 220, 1189], ['move', 221, 1187], ['move', 225, 1400], ['move', 225, 1401],
  ]) {
    recordPointerSample(capture, queue, clock, 'touch', 200, kind, y, () => at)
  }
  assert.deepEqual(queue.events, [
    { kind: 'down', y: 100, at: 1003, bucket: 0 },
    { kind: 'move', y: 220, at: 1189, bucket: 18 },
  ])
  assert.deepEqual(capture, { down: true, y: 225 })
})

test('swipe capture keeps the final flick target and release through a paused gap and rollback', () => {
  const capture = createPointerCapture()
  const queue = createPointerInputQueue(true)
  const clock = createSimulationClock(1000)
  const record = (kind, y, at) => recordPointerSample(capture, queue, clock, 'swipe', 200, kind, y, () => at)
  record('down', 100, 1001)
  record('move', 180, 1003)
  record('move', 40, 1004)
  record('up', undefined, 1005)
  assert.deepEqual(queue.events, [
    { kind: 'down', y: 100, at: 1001, bucket: 0 },
    { kind: 'move', y: 40, at: 1004, bucket: 0 },
    { kind: 'up', y: undefined, at: 1005, bucket: 0 },
  ])
  queue.events.length = 0
  clock.lastFrameAt = 1010
  record('down', 100, 1016)
  record('move', 180, 1022)
  record('move', 40, 1032)
  record('move', 60, 1029)
  assert.deepEqual(queue.events, [
    { kind: 'down', y: 100, at: 1016, bucket: 0 },
    { kind: 'move', y: 180, at: 1022, bucket: 1 },
    { kind: 'move', y: 60, at: 1029, bucket: 2 },
  ])
  record('move', 180, 1310)
  record('up', undefined, 1020)
  record('move', 160, 1320)
  assert.deepEqual(queue.events, [
    { kind: 'down', y: 100, at: 1016, bucket: Infinity },
    { kind: 'move', y: 180, at: 1310, bucket: Infinity },
    { kind: 'up', y: undefined, at: 1020, bucket: Infinity },
  ])
  assert.equal(queue.down, false)
})

test('long waits retain only the final pointer state and its swipe anchor', () => {
  const queue = createPointerInputQueue(true)
  const clock = createSimulationClock(0)
  enqueuePointerInput(queue,'down',123,100,clock)
  for(let at=101;at<=10000;at++) enqueuePointerInput(queue,'move',at,at,clock)
  assert.equal(queue.events.length,2)
  assert.equal(queue.events[0].kind,'down')
  assert.equal(queue.events[0].y,123)
  assert.equal(queue.events[1].y,10000)
  enqueuePointerInput(queue,'up',undefined,10001,clock)
  assert.deepEqual(queue.events.map(command => command.kind), ['down', 'move', 'up'])
  assert.equal(queue.events[1].y,10000)
  assert.equal(queue.down,false)
})

test('duplicate, released and backward-clock input cannot grow unbounded commands', () => {
  const queue = createPointerInputQueue()
  const clock = createSimulationClock(1000)
  enqueuePointerInput(queue,'move',100,1001,clock)
  enqueuePointerInput(queue,'up',undefined,1002,clock)
  assert.equal(queue.events.length,0)
  enqueuePointerInput(queue,'down',100,1003,clock)
  for(let i=0;i<1000;i++) enqueuePointerInput(queue,'move',101+i,i%2?990:1249,clock)
  assert.ok(queue.events.length<=MAX_POINTER_COMMANDS)
  enqueuePointerInput(queue,'up',undefined,1250,clock)
  const length=queue.events.length
  enqueuePointerInput(queue,'up',undefined,1250,clock)
  assert.equal(queue.events.length,length)
})
