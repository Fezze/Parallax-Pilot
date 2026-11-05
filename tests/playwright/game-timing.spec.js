import { test, expect } from '@playwright/test'
import { previewScenarios } from './preview/scenarios.js'

for (const shape of ['round', 'square']) {
  test(`dense pointer input records state without stepping or recomputing static geometry (${shape})`, async ({ page }) => {
    const [scenario] = Object.entries(previewScenarios).find(([,value])=>value.pageName==='game'&&value.shape===shape)
    await page.goto(`/tests/playwright/preview/index.html?scenario=${scenario}`)
    await expect(page.locator('#status')).toHaveText('ready')
    const result=await page.evaluate(()=>{
      const game=globalThis.__previewPageDefinition
      const originalNow=Date.now, originalSqrt=Math.sqrt
      let now=1000000
      Date.now=()=>now
      try{
        game.onInit();game.settings.controlMode='touch'
        const listeners=new Map()
        game.canvas.addEventListener=(name,handler)=>listeners.set(name,handler)
        game.bindCanvasEvents()
        let steps=0,squareRoots=0
        const step=game.stepSimulation
        game.stepSimulation=function(...args){steps++;return step.apply(this,args)}
        Math.sqrt=(...args)=>{squareRoots++;return originalSqrt(...args)}
        const initial=game.shipCenterY
        now+=13;listeners.get('CLICK_DOWN')({y:100})
        for(let i=0;i<1000;i++)listeners.get('MOVE')({y:101})
        now=1000035;listeners.get('CLICK_UP')()
        const stepsInHandlers=steps
        now=1000040;game.tick()
        return{stepsInHandlers,steps,squareRoots,age:game.simulationClock.elapsedMs,
          displacement:initial-game.shipCenterY,expected:game.baseControlSpeed*.02,pending:game.pointerInput.events.length}
      }finally{Date.now=originalNow;Math.sqrt=originalSqrt}
    })
    expect(result.stepsInHandlers).toBe(0)
    expect(result.steps).toBe(4)
    expect(result.squareRoots).toBe(0)
    expect(result.age).toBe(40)
    expect(result.displacement).toBeCloseTo(result.expected,10)
    expect(result.pending).toBe(0)
  })
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
