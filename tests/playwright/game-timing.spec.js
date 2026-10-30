import { test, expect } from '@playwright/test'
import { previewScenarios } from './preview/scenarios.js'

for (const shape of ['round', 'square']) {
  test(`game timing stays consistent through delayed callbacks and a stall (${shape})`, async ({ page }) => {
    const [scenario] = Object.entries(previewScenarios).find(([, value]) => value.pageName === 'game' && value.shape === shape)
    const results = []
    for (const interval of [16, 33, 50, 100, 200]) {
      await page.goto(`/tests/playwright/preview/index.html?scenario=${scenario}`)
      await expect(page.locator('#status')).toHaveText('ready')
      results.push(await page.evaluate((interval) => {
        const game = globalThis.__previewPageDefinition
        const originalNow = Date.now
        const originalRandom = Math.random
        let wall = 1700000000000
        Date.now = () => wall
        Math.random = () => 0.5
        try {
          game.onInit()
          game.hp = 1000000
          game.displayedHp = game.hp
          for (let age = 0; age < 5000;) {
            const step = Math.min(interval, 5000 - age)
            age += step
            wall += step
            game.tick()
          }
          const before = JSON.stringify(game.asteroids)
          wall += 60000
          game.tick()
          const stayedPaused = before === JSON.stringify(game.asteroids)
          return { age: game.simulationClock.elapsedMs, paused: game.simulationClock.pausedMs,
            hp: game.hp, shipY: game.shipCenterY, spawned: game.asteroidSeed,
            asteroids: JSON.stringify(game.asteroids), stayedPaused }
        } finally {
          Date.now = originalNow
          Math.random = originalRandom
        }
      }, interval))
    }
    expect(results[0].age).toBe(5000)
    expect(results[0].paused).toBe(60000)
    expect(results[0].stayedPaused).toBe(true)
    expect(results[0].spawned).toBeGreaterThan(0)
    for (const result of results.slice(1)) expect(result).toEqual(results[0])
  })
}
