import { test, expect } from '@playwright/test'

test('browser harness loads shared modules without runtime errors', async ({ page }) => {
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

  await page.goto('/tests/playwright/harness/index.html')

  await expect(page.locator('#status')).toHaveText('ready')

  const payload = await page.evaluate(() => window.__HARNESS__)

  expect(payload.route).toEqual({ page: 2, mode: 'harness' })
  expect(payload.difficulty).toBe(8.5)
  expect(payload.travelDirection).toBe('right')
  expect(payload.settings).toEqual({
    controlMode: 'touch',
    wristSide: 'right',
    timeScale: 2,
    spawnMultiplier: 1.3,
    tiltSensitivity: 0.95,
  })
  expect(payload.asteroid.x).toBeGreaterThan(480)
  expect(payload.asteroid.vx).toBeLessThan(0)
  expect(payload.row).toBe('01  11235  4.32s')
  expect(payload.duration).toBe('4.32s')
  expect(payload.scores.pageCount).toBe(1)
  expect(payload.scores.items).toHaveLength(1)
  expect(pageErrors).toEqual([])
  expect(consoleErrors).toEqual([])
})
