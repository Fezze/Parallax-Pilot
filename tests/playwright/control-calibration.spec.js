import { test, expect } from '@playwright/test'
import { previewScenarios } from './preview/scenarios.js'

for (const shape of ['round', 'square']) {
  for (const wrist of ['left', 'right']) {
    test(`guided calibration saves analog asymmetric ranges (${shape}, ${wrist})`, async ({ page }) => {
      const [scenario] = Object.entries(previewScenarios).find(([, value]) =>
        value.pageName === 'tilt-calibration' && value.variant === 'default' && value.shape === shape && value.locale === 'en-US')
      await page.goto(`/tests/playwright/preview/index.html?scenario=${scenario}`)
      await expect(page.locator('#status')).toHaveText('ready')
      const result = await page.evaluate(async wrist => {
        const { getStorageMap } = await import('/tests/playwright/preview/mocks/zos/state.js')
        const { normalizeTiltInput } = await import('/zepp-app/shared/tilt-calibration.js')
        const storage = getStorageMap('local')
        storage.set('settings_v1', JSON.stringify({ wristSide: wrist, controlMode: 'tilt' }))
        const calibration = globalThis.__previewPageDefinition
        calibration.onDestroy(); calibration.onInit(); calibration.build()
        const originalNow = Date.now
        let wall = originalNow()
        Date.now = () => wall
        try {
          const sign = wrist === 'right' ? -1 : 1
          for (const [stage, value] of [20, 120, -160].entries()) {
            for (let i = 0; i < 150 && !calibration.finished && calibration.stageIndex === stage; i++) {
              calibration.accelerometer.getCurrent = () => ({ y: sign * value })
              wall += 60; calibration.tick()
            }
          }
          const profile = JSON.parse(storage.get('tilt_calibration_v1') || 'null')
          return { profile, neutral: normalizeTiltInput(sign * 20, profile, wrist),
            intermediate: normalizeTiltInput(sign * (20 + (100 + profile.deadzone) / 2), profile, wrist) }
        } finally { Date.now = originalNow; calibration.onDestroy() }
      }, wrist)
      expect(result.profile.wristSide).toBe(wrist)
      expect(result.profile.positiveRange).toBe(100)
      expect(result.profile.negativeRange).toBe(180)
      expect(result.neutral).toBe(0)
      expect(result.intermediate).toBeCloseTo(0.5, 12)
    })
  }
}
