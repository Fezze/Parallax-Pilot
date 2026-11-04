import test from 'node:test'
import assert from 'node:assert/strict'
import { tiltProfile } from './tilt-fixtures.js'
import { __resetDeviceInfo } from './mocks/zos/device.mjs'
import { __resetRouter, __getRouterCalls } from './mocks/zos/router.mjs'
import { __resetUI, __getCanvasWidgets, __getButtonWidgets, __getTextWidgets } from './mocks/zos/ui.mjs'
import { __resetSensors } from './mocks/zos/sensor.mjs'
import { __resetInteraction } from './mocks/zos/interaction.mjs'
import { __resetDisplay } from './mocks/zos/display.mjs'
import { __resetLanguage } from './mocks/zos/settings.mjs'
import { __seedLocalStorage, __readLocalStorage, LocalStorage } from './mocks/zos/storage.mjs'
import { readTiltCalibration, writeTiltCalibration, writeSettings, writeTiltCalibrationReport, readTiltCalibrationReport } from '../zepp-app/shared/persistence.js'
import { buildTiltCalibrationReport, normalizeTiltInput, CALIBRATION_SAMPLE_LIMIT } from '../zepp-app/shared/tilt-calibration.js'

async function loadPage(name) {
  await import(`../zepp-app/page/${name}/index.js?control-test=${Math.random()}`)
  const page = Object.assign({}, globalThis.__zeppPageDefinition)
  page.onInit?.()
  page.build()
  return page
}

async function environment(seed, callback) {
  __resetDeviceInfo(); __resetRouter(); __resetUI(); __resetSensors()
  __resetInteraction(); __resetDisplay(); __resetLanguage(); __seedLocalStorage(seed)
  const original = { now: Date.now, interval: globalThis.setInterval, clear: globalThis.clearInterval, timeout: globalThis.setTimeout }
  let wall = 1000
  const timers = new Set()
  Date.now = () => wall
  globalThis.setInterval = callback => { timers.add(callback); return callback }
  globalThis.clearInterval = id => timers.delete(id)
  globalThis.setTimeout = callback => { callback(); return 1 }
  try {
    await callback({ advance(ms = 60) { wall += ms }, timers })
  } finally {
    Date.now = original.now; globalThis.setInterval = original.interval
    globalThis.clearInterval = original.clear; globalThis.setTimeout = original.timeout
  }
}

function click(text) {
  const label = __getTextWidgets().find(item => item.props.text === text)
  const button = __getButtonWidgets().find(item => item.props.text === text || (label &&
    label.props.x + label.props.w / 2 >= item.props.x && label.props.x + label.props.w / 2 <= item.props.x + item.props.w &&
    label.props.y + label.props.h / 2 >= item.props.y && label.props.y + label.props.h / 2 <= item.props.y + item.props.h))
  assert.ok(button, `Missing ${text} button`)
  button.props.click_func()
}

function settings(wristSide = 'left', controlMode = 'tilt', tiltSensitivity = 0.8) {
  return JSON.stringify({ wristSide, controlMode, tiltSensitivity, timeScale: 1, spawnMultiplier: 1 })
}

function feed(page, clock, raw, count) {
  for (let i = 0; i < count; i++) {
    clock.advance()
    if (page.accelerometer) page.accelerometer.current = { y: typeof raw === 'function' ? raw(i) : raw }
    page.tick()
  }
}

async function completeTrace(wrist, clock) {
  const page = await loadPage('tilt-calibration')
  const sign = wrist === 'right' ? -1 : 1
  for (const [index, oriented] of [20, 120, -160].entries()) {
    // A large transition spike must never become the calibrated endpoint.
    if (index > 0) feed(page, clock, sign * oriented * 4, 1)
    let count = 0
    while (!page.finished && page.stageIndex === index && count++ < 150) feed(page, clock, sign * oriented, 1)
    assert.ok(count < 150, `Stage ${index} did not settle`)
  }
  assert.equal(page.finished, true)
  assert.notEqual(page.stagePhase, 'failed')
  return page
}

for (const wrist of ['left', 'right']) {
  test(`actual guided page and game share asymmetric analog ranges (${wrist})`, async () => {
    await environment({ settings_v1: settings(wrist) }, async clock => {
      const page = await completeTrace(wrist, clock)
      const saved = JSON.parse(__readLocalStorage('tilt_calibration_v1'))
      assert.equal(saved.version, 2); assert.equal(saved.unit, 'cm/s^2'); assert.equal(saved.wristSide, wrist)
      assert.equal(saved.offset, 20); assert.equal(saved.positiveRange, 100); assert.equal(saved.negativeRange, 180)
      const sign = wrist === 'right' ? -1 : 1
      for (const [value, expected] of [[20, 0], [20 + saved.deadzone, 0],
        [20 + (100 + saved.deadzone) / 2, 0.5], [20 - (180 + saved.deadzone) / 2, -0.5], [120, 1], [-160, -1]]) {
        assert.ok(Math.abs(normalizeTiltInput(sign * value, saved, wrist) - expected) < 1e-12)
      }
      assert.equal(normalizeTiltInput(NaN, saved, wrist), 0)
      assert.equal(normalizeTiltInput(sign * 120, saved, wrist === 'left' ? 'right' : 'left'), 0)
      assert.equal(clock.timers.size, 0)
      for (const values of Object.values(page.samplesByStage)) assert.ok(values.length <= CALIBRATION_SAMPLE_LIMIT)
      const game = await loadPage('game')
      assert.equal(game.accelerometer.started, true)
      game.accelerometer.current = { y: sign * (20 + (100 + saved.deadzone) / 2) }
      const before = game.shipCenterY
      game.updateShip(0.1)
      assert.ok(Math.abs(game.shipCenterY - before - game.baseControlSpeed * 0.05) < 1e-9)
      game.onDestroy()
    })
  })
}

test('noisy timeout preserves saved profile/report, bounds waiting memory, and offers retry/cancel', async () => {
  const originalProfile = JSON.stringify(tiltProfile())
  const originalReport = JSON.stringify({ marker: 'previous' })
  await environment({ settings_v1: settings(), tilt_calibration_v1: originalProfile, tilt_calibration_report_v1: originalReport }, async clock => {
    const page = await loadPage('tilt-calibration')
    feed(page, clock, i => i % 2 ? 100 : -100, 499)
    assert.equal(page.stageIndex, 0)
    assert.ok(page.recentSamples.length <= 10)
    assert.ok(page.samplesByStage.center.length <= 32)
    feed(page, clock, 0, 1)
    assert.equal(page.stagePhase, 'failed')
    assert.equal(clock.timers.size, 0)
    assert.equal(__readLocalStorage('tilt_calibration_v1'), originalProfile)
    assert.equal(__readLocalStorage('tilt_calibration_report_v1'), originalReport)
    assert.ok(__getTextWidgets().some(item => item.props.text === 'CALIBRATION INCOMPLETE'))
    click('RETRY')
    assert.equal(page.finished, false); assert.equal(page.stageIndex, 0); assert.equal(clock.timers.size, 1)
    click('CANCEL')
    assert.equal(clock.timers.size, 0)
    assert.equal(__getRouterCalls().at(-1).payload.url, 'page/settings/index')
    assert.equal(__readLocalStorage('tilt_calibration_v1'), originalProfile)
    page.onDestroy()
  })
})

test('wrong-direction waiting and missing readings never fabricate ranges or grow retained diagnostics', async () => {
  await environment({ settings_v1: settings() }, async clock => {
    const page = await loadPage('tilt-calibration')
    feed(page, clock, 20, 33)
    assert.equal(page.stageIndex, 1)
    feed(page, clock, -160, 490)
    assert.equal(page.stageIndex, 1)
    assert.equal(page.samplesByStage.down.length, 0)
    assert.ok(page.recentSamples.length <= 10)
    feed(page, clock, NaN, 11)
    assert.equal(page.stagePhase, 'failed')
    assert.equal(__readLocalStorage('tilt_calibration_v1'), undefined)
    assert.equal(clock.timers.size, 0)
  })
})

test('delayed callbacks cannot substitute for consecutive stable sensor samples', async () => {
  await environment({ settings_v1: settings() }, async clock => {
    const page = await loadPage('tilt-calibration')
    feed(page, clock, 20, 25)
    assert.ok(page.stageHoldMs > 0)
    clock.advance(5000); page.tick()
    assert.equal(page.stageHoldMs, 0); assert.deepEqual(page.samplesByStage.center, [])
    page.onDestroy(); assert.equal(clock.timers.size, 0)
  })
})

test('insufficient, wrong-sign, drifting or noisy endpoints fail instead of receiving floor ranges', () => {
  const good = { center: Array(24).fill(20), down: Array(12).fill(120), up: Array(12).fill(-160) }
  assert.ok(buildTiltCalibrationReport(good).profile)
  for (const samples of [{ ...good, up: [] }, { ...good, down: Array(12).fill(-100) },
    { ...good, center: Array.from({ length: 24 }, (_, i) => i * 2) },
    { ...good, up: Array.from({ length: 12 }, (_, i) => i % 2 ? -100 : -200) },
    { ...good, up: Array(12).fill(NaN) }, { ...good, down: Array(12).fill(21) }]) {
    assert.equal(buildTiltCalibrationReport(samples).profile, null)
  }
})

test('legacy/foreign contracts are rejected, wrist changes require matching calibration, invalid writes preserve data', async () => {
  await environment({ settings_v1: settings() }, () => {
    const storage = new LocalStorage()
    const good = tiltProfile()
    writeTiltCalibration(storage, good)
    for (const invalid of [{ ...good, version: undefined }, { ...good, version: 999 }, { ...good, unit: 'g' },
      { ...good, frame: 'raw' }, { ...good, wristSide: 'right' }, { ...good, positiveRange: 2 }, { ...good, offset: Infinity }]) {
      assert.equal(writeTiltCalibration(storage, invalid).offset, good.offset)
      assert.deepEqual(readTiltCalibration(storage), good)
      storage.setItem('tilt_calibration_v1', JSON.stringify(invalid))
      assert.equal(readTiltCalibration(storage), null)
      writeTiltCalibration(storage, good)
    }
    writeSettings(storage, { wristSide: 'right' })
    assert.equal(readTiltCalibration(storage), null)
    writeSettings(storage, { wristSide: 'left' })
    assert.deepEqual(readTiltCalibration(storage), good)
    const report = { samplesByStage: { center: Array(10000).fill(1), down: Array(10000).fill(100), up: Array(10000).fill(-180) }, debug: { center: { samples: 10000, extra: 'x'.repeat(10000) } } }
    writeTiltCalibrationReport(storage, report)
    assert.ok(__readLocalStorage('tilt_calibration_report_v1').length < 2000)
    assert.equal(readTiltCalibrationReport(storage).samplesByStage.center.length, 32)
  })
})

for (const mode of ['touch', 'swipe']) {
  test(`${mode} event trajectories do not depend on calibration presence, version or wrist`, async () => {
    for (const sensitivity of [0.8, 0.95]) {
      const trajectories = []
      for (const calibration of [undefined, tiltProfile(), { ...tiltProfile(), version: 1 }, tiltProfile('right')]) {
        await environment({ settings_v1: settings('left', mode, sensitivity),
          ...(calibration ? { tilt_calibration_v1: JSON.stringify(calibration) } : {}) }, async clock => {
          const game = await loadPage('game')
          const canvas = __getCanvasWidgets().at(-1)
          canvas.__emit('CLICK_DOWN', { y: 80 })
          const path = []
          for (let i = 0; i < 16; i++) {
            clock.advance(16)
            if (mode === 'swipe') canvas.__emit('MOVE', { y: 80 + i * 3 })
            game.tick(); path.push(game.shipCenterY)
          }
          canvas.__emit('CLICK_UP')
          assert.notEqual(path.at(-1), 240)
          trajectories.push(path)
          game.onDestroy()
        })
      }
      for (const path of trajectories.slice(1)) assert.deepEqual(path, trajectories[0])
    }
  })
}

test('home guidance and every direct game entry require a usable tilt profile', async () => {
  for (const profile of [null, { ...tiltProfile(), version: 1 }, tiltProfile('right'), tiltProfile()]) {
    await environment({ settings_v1: settings(), ...(profile ? { tilt_calibration_v1: JSON.stringify(profile) } : {}) }, async () => {
      await loadPage('home')
      const usable = profile?.version === 2 && profile?.wristSide === 'left'
      assert.ok(__getTextWidgets().some(item => item.props.text.includes(usable ? 'READY' : 'CALIBRATE FIRST')))
      click('START RUN')
      assert.equal(__getRouterCalls().at(-1).payload.url, usable ? 'page/game/index' : 'page/tilt-calibration/index')
      const game = await loadPage('game')
      assert.equal(Boolean(game.accelerometer), usable)
      if (!usable) assert.equal(__getRouterCalls().at(-1).payload.url, 'page/tilt-calibration/index')
      game.onDestroy()
    })
  }
})


test('queued retry cannot restart acquisition after the page is destroyed', async () => {
  await environment({ settings_v1: settings() }, async clock => {
    const page = await loadPage('tilt-calibration')
    page.onDestroy()
    page.startAttempt()
    assert.equal(clock.timers.size, 0)
    assert.equal(page.accelerometer, null)
    assert.equal(page.finished, true)
  })
})
