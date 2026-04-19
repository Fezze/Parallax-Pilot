import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const command = process.argv[2]
const dryRun = process.argv.includes('--dry-run')
const shouldBumpVersion = process.argv.includes('--bump-version')

if (!['dev', 'preview', 'build'].includes(command)) {
  console.error('Usage: node scripts/zeus-proxy.mjs <dev|preview|build> [--dry-run] [--bump-version]')
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
  console.log(`Dry run: zeus ${command}${shouldBumpVersion ? ' with version bump' : ''}`)
  process.exit(0)
}

const zeusRun = spawnSync(
  process.platform === 'win32' ? 'cmd' : 'sh',
  process.platform === 'win32'
    ? ['/c', 'zeus', command]
    : ['-lc', `cd "${path.join(repoRoot, 'zepp-app')}" && zeus ${command}`],
  {
    cwd: path.join(repoRoot, 'zepp-app'),
    stdio: 'inherit',
  }
)

process.exit(zeusRun.status || 0)
