import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'

export default async function globalSetup() {
  const playwrightOutputDir = path.join(
    process.cwd(),
    'output',
    'playwright'
  )

  await rm(playwrightOutputDir, { recursive: true, force: true })
  await mkdir(playwrightOutputDir, { recursive: true })
}
