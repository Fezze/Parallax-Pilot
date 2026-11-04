import { test, expect } from '@playwright/test'
import { previewScenarios } from './preview/scenarios.js'

for (const [id, scenario] of Object.entries(previewScenarios).filter(([, s]) => s.pageName === 'game' && s.variant.includes('limit-'))) {
  test(`flight limit clears the HUD: ${id}`, async ({ page }) => {
    await page.goto(`/tests/playwright/preview/index.html?scenario=${id}`)
    await expect(page.locator('#status')).toHaveText('ready')
    const geometry = await page.evaluate(() => {
      const game = globalThis.__previewPageDefinition
      return { rect: game.shipRect, viewport: game.viewport, centerY: game.shipCenterY, limits: game.shipYLimits, hp: game.displayedHp }
    })
    expect(geometry.hp).toBe(12)
    expect(geometry.centerY).toBe(scenario.variant.includes('top') ? geometry.limits.min : geometry.limits.max)
    expect(geometry.rect.centerY).toBe(geometry.centerY)
    for (const point of geometry.rect.points) {
      if (scenario.shape === 'round') {
        const radius = Math.hypot(point.x - geometry.viewport.width / 2, point.y - geometry.viewport.height / 2)
        expect(radius + 1.5 + 3).toBeLessThanOrEqual(geometry.viewport.width / 2 - 16)
      } else {
        expect(point.y - 1.5).toBeGreaterThanOrEqual(11)
        expect(point.y + 1.5).toBeLessThanOrEqual(geometry.viewport.height - 11)
      }
    }
  })
}
