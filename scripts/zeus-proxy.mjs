import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const zeppAppDir = path.join(repoRoot, 'zepp-app')
const command = process.argv[2]
const forwardedArgs = process.argv.slice(3).filter((arg) => arg !== '--dry-run' && arg !== '--no-version-bump')
const dryRun = process.argv.includes('--dry-run')
const noVersionBump = process.argv.includes('--no-version-bump')
const shouldBumpVersion = command !== 'preview' && command !== 'bridge' && !noVersionBump

if (!['dev', 'preview', 'build', 'bridge'].includes(command)) {
  console.error('Usage: node scripts/zeus-proxy.mjs <dev|preview|build|bridge> [--dry-run] [--no-version-bump]')
  process.exit(1)
}

if (shouldBumpVersion) {
  const versionBump = spawnSync(
    process.execPath,
    [path.join(__dirname, 'version-proxy.mjs'), 'patch', ...(dryRun ? ['--dry-run'] : [])],
    {
      cwd: repoRoot,
      stdio: 'inherit',
    }
  )

  if (versionBump.status !== 0) {
    process.exit(versionBump.status || 1)
  }
}

if (dryRun) {
  console.log(`Dry run: zeus ${command} ${forwardedArgs.join(' ')}`.trim())
  process.exit(0)
}

const localZeus = path.join(repoRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'zeus.cmd' : 'zeus')
const zeusCommand = fs.existsSync(localZeus) ? localZeus : 'zeus'
const zeusRun = process.platform === 'win32'
  ? spawnSync('cmd', ['/d', '/s', '/c', `"${zeusCommand}" ${command}`], {
    cwd: zeppAppDir,
    stdio: 'inherit',
  })
  : spawnSync(zeusCommand, [command, ...forwardedArgs], {
    cwd: zeppAppDir,
    stdio: 'inherit',
  })

if (zeusRun.error) {
  if (zeusRun.error.code === 'ENOENT') {
    console.error('Cannot find zeus. Run npm install, or install @zeppos/zeus-cli.')
  } else {
    console.error(`Failed to run zeus ${command}: ${zeusRun.error.message}`)
  }
  process.exit(1)
}

process.exit(zeusRun.status ?? 1)
