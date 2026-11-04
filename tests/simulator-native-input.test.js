import test from 'node:test'
import assert from 'node:assert/strict'
import { pointerEvents, performPointerAction, verifyNativeWindow } from '../scripts/simulator-native-input.mjs'

test('native input matches the installed vendor GTK button and motion encoding', () => {
  assert.deepEqual(pointerEvents(240, 269, true), [
    { type: 'btn', data: { button: 'left', down: true } },
    { type: 'rel', data: { axis: 'x', value: 0x7fff08f0 } },
    { type: 'rel', data: { axis: 'y', value: 0x7fff090d } },
  ])
  assert.equal(pointerEvents(240, 269)[0].data.value, 0x7fff00f0)
  assert.equal(pointerEvents(240, 269, false)[0].data.down, false)
  for (const x of [-1, 2048, 0.5, NaN]) assert.throws(() => pointerEvents(x, 0), /coordinates/)
})

test('native hold revalidates the window for every event and releases after interruption', async () => {
  const sent = []
  let checks = 0
  await assert.rejects(performPointerAction('hold', { x: 240, y: 100 }, { ms: 500 },
    async events => { sent.push(events) }, () => { checks += 1 }, async () => { throw new Error('interrupted') }), /interrupted/)
  assert.equal(checks, 3)
  assert.equal(sent.at(-1)[0].data.down, false)
})

test('a missing target prevents native input and invalid endpoints never press', async () => {
  let sent = 0
  await assert.rejects(performPointerAction('tap', { x: 10, y: 20 }, {}, async () => { sent += 1 }, () => { throw new Error('window gone') }), /window gone/)
  await assert.rejects(performPointerAction('swipe', { x: 10, y: 20 }, { ms: 100, dx: -20, dy: 0 }, async () => { sent += 1 }, () => {}), /coordinates/)
  assert.equal(sent, 0)
})

test('native targeting rejects ambiguous, hidden and unrelated process windows', () => {
  let windows = '0x123 "Zepp OS Simulator": ("qemu" "Qemu-system-arm") 480x506+0+0 +798+472'
  let visible = true
  let command = './qemu-system-arm\0-qmp\0unix:/tmp/expected.sock,server=on\0'
  windows += '\n0x999 \"qemu\": (\"qemu-system-arm\" \"Qemu-system-arm\") 10x10+0+0 +0+0'
  const calls = []
  const run = (name, args) => {
    calls.push(name)
    if (name === 'xprop') return { status: 0, stdout: '_NET_WM_PID(CARDINAL) = 1234' }
    return { status: 0, stdout: args.includes('-tree') ? windows : `Map State: ${visible ? 'IsViewable' : 'IsUnMapped'}` }
  }
  assert.equal(verifyNativeWindow('/tmp/expected.sock', run, () => command).pid, 1234)
  windows += '\n' + windows.split('\n')[0]
  assert.throws(() => verifyNativeWindow('/tmp/expected.sock', run, () => command), /ambiguous/)
  windows = windows.split('\n')[0]; visible = false
  assert.throws(() => verifyNativeWindow('/tmp/expected.sock', run, () => command), /no longer visible/)
  visible = true; command = './qemu-system-arm\0-qmp\0unix:/tmp/other.sock,server=on\0'
  assert.throws(() => verifyNativeWindow('/tmp/expected.sock', run, () => command), /does not belong/)
  assert.ok(calls.every(name => ['xwininfo', 'xprop'].includes(name)))
})
