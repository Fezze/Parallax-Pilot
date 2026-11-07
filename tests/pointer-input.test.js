import test from 'node:test'
import assert from 'node:assert/strict'
import { createPointerInputQueue, enqueuePointerInput, MAX_POINTER_COMMANDS } from '../zepp-app/shared/pointer-input.js'
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
  const queue = createPointerInputQueue()
  const pool = [...queue.pool]
  const clock = createSimulationClock(0)
  enqueuePointerInput(queue,'down',100,0,clock)
  for(let i=1;i<=25000;i++) {
    enqueuePointerInput(queue,'move',i, i/100,clock)
    assert.ok(queue.events.length<=MAX_POINTER_COMMANDS)
  }
  assert.ok(queue.events.every(command=>pool.includes(command)))
  assert.equal(queue.y,25000)
  queue.events.length=0
  clock.lastFrameAt=250
  enqueuePointerInput(queue,'move',25001,251,clock)
  assert.equal(queue.events[0],pool[0])
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
