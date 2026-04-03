import { test, expect } from '@playwright/test'
import { previewScenarios } from './preview/scenarios.js'

for (const [scenarioId, scenario] of Object.entries(previewScenarios)) {
  test(`preview ${scenarioId} renders and saves screenshot`, async ({ page }, testInfo) => {
    const pageErrors = []
    const consoleErrors = []

    page.on('pageerror', (error) => {
      pageErrors.push(error.message)
    })
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text())
      }
    })

    await page.goto(`/tests/playwright/preview/index.html?scenario=${scenarioId}`)

    await expect(page.locator('#status')).toHaveText('ready')

    for (const expectedText of scenario.expectedTexts) {
      await expect(page.locator('#watch')).toContainText(expectedText)
    }
    for (const forbiddenText of scenario.forbiddenTexts || []) {
      await expect(page.locator('#watch')).not.toContainText(forbiddenText)
    }

    const preview = await page.evaluate(() => window.__PREVIEW__)
    expect(preview.scenarioId).toBe(scenarioId)
    expect(preview.widgetCount).toBeGreaterThan(0)

    if (scenarioId.startsWith('game-')) {
      expect(preview.canvasCount).toBe(1)
    }

    const screenshotPath = testInfo.outputPath(`${scenarioId}.png`)
    await page.locator('#watch-shell').screenshot({ path: screenshotPath })
    await testInfo.attach(`${scenarioId}.png`, {
      path: screenshotPath,
      contentType: 'image/png',
    })

    expect(pageErrors).toEqual([])
    expect(consoleErrors).toEqual([])
  })
}
