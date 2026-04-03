import { defineConfig } from '@playwright/test'

const PORT = 4173
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './tests/playwright',
  timeout: 30_000,
  fullyParallel: true,
  reporter: 'list',
  outputDir: 'output/playwright/artifacts',
  globalSetup: './tests/playwright/global-setup.mjs',
  use: {
    baseURL: BASE_URL,
    browserName: 'chromium',
    headless: true,
  },
  webServer: {
    command: 'node tests/playwright/server.mjs',
    url: BASE_URL,
    reuseExistingServer: true,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
