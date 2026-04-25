import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const args = process.argv.slice(2)

function osReleaseValue(key) {
  if (process.platform !== 'linux' || !fs.existsSync('/etc/os-release')) {
    return ''
  }

  const line = fs.readFileSync('/etc/os-release', 'utf8')
    .split('\n')
    .find((entry) => entry.startsWith(`${key}=`))

  return line ? line.slice(key.length + 1).replace(/^"|"$/g, '') : ''
}

function hostPlatformOverride() {
  if (process.env.PLAYWRIGHT_HOST_PLATFORM_OVERRIDE || process.platform !== 'linux') {
    return ''
  }

  const id = osReleaseValue('ID')
  const versionId = osReleaseValue('VERSION_ID')
  if (id !== 'ubuntu' || !versionId.startsWith('26.')) {
    return ''
  }

  const arch = os.arch()
  if (arch === 'x64') {
    return 'ubuntu24.04-x64'
  }
  if (arch === 'arm64') {
    return 'ubuntu24.04-arm64'
  }
  return ''
}

const localPlaywright = path.join(
  repoRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'playwright.cmd' : 'playwright'
)
const playwrightCommand = fs.existsSync(localPlaywright) ? localPlaywright : 'playwright'
const override = hostPlatformOverride()
const env = {
  ...process.env,
  ...(override ? { PLAYWRIGHT_HOST_PLATFORM_OVERRIDE: override } : {}),
}

const playwrightRun = process.platform === 'win32'
  ? spawnSync('cmd', ['/d', '/s', '/c', `"${playwrightCommand}" ${args.join(' ')}`], {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
  })
  : spawnSync(playwrightCommand, args, {
    cwd: repoRoot,
    env,
    stdio: 'inherit',
  })

if (playwrightRun.error) {
  if (playwrightRun.error.code === 'ENOENT') {
    console.error('Cannot find Playwright. Run npm install first.')
  } else {
    console.error(`Failed to run Playwright: ${playwrightRun.error.message}`)
  }
  process.exit(1)
}

process.exit(playwrightRun.status ?? 1)
