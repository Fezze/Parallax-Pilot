import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const packageJsonPath = path.join(repoRoot, 'package.json')
const dryRun = process.argv.includes('--dry-run')
const passthroughArgs = process.argv.slice(2).filter((arg) => arg !== '--dry-run')

function readVersion() {
  return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')).version
}

if (dryRun) {
  console.log(`Dry run: git push ${passthroughArgs.join(' ')}`.trim())
  console.log('Dry run: version bump happens only after a successful push.')
  process.exit(0)
}

const beforeVersion = readVersion()
const initialPush = spawnSync(
  'git',
  ['push', ...passthroughArgs],
  {
    cwd: repoRoot,
    stdio: 'inherit',
  }
)

if (initialPush.status !== 0) {
  process.exit(initialPush.status || 1)
}

const versionBump = spawnSync(
  process.execPath,
  [
    path.join(__dirname, 'version-proxy.mjs'),
    'minor',
    '--stage',
  ],
  {
    cwd: repoRoot,
    stdio: 'inherit',
  }
)

if (versionBump.status !== 0) {
  process.exit(versionBump.status || 1)
}

const afterVersion = readVersion()
const commitVersion = spawnSync(
  'git',
  [
    'commit',
    '--only',
    'package.json',
    'package-lock.json',
    'zepp-app/app.json',
    '-m',
    `Bump version to ${afterVersion}`,
  ],
  {
    cwd: repoRoot,
    stdio: 'inherit',
  }
)

if (commitVersion.status !== 0) {
  process.exit(commitVersion.status || 1)
}

const versionPush = spawnSync(
  'git',
  ['push', ...passthroughArgs],
  {
    cwd: repoRoot,
    stdio: 'inherit',
  }
)

if (versionPush.status !== 0) {
  process.exit(versionPush.status || 1)
}

console.log(`Push completed with version bump: ${beforeVersion} -> ${afterVersion}`)
