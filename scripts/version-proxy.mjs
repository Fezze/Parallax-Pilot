import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

const packageJsonPath = path.join(repoRoot, 'package.json')
const packageLockPath = path.join(repoRoot, 'package-lock.json')
const appJsonPath = path.join(repoRoot, 'zepp-app', 'app.json')

const mode = process.argv[2]
const dryRun = process.argv.includes('--dry-run')
const stage = process.argv.includes('--stage')

if (!['patch', 'minor', 'major'].includes(mode)) {
  console.error('Usage: node scripts/version-proxy.mjs <patch|minor|major> [--dry-run] [--stage]')
  process.exit(1)
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

function parseSemver(version) {
  const parts = String(version).split('.').map((part) => Number.parseInt(part, 10))
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part) || part < 0)) {
    throw new Error(`Unsupported semver format: ${version}`)
  }

  return parts
}

function formatSemver(parts) {
  return parts.join('.')
}

function bumpSemver(version, bumpMode) {
  const [major, minor, patch] = parseSemver(version)

  if (bumpMode === 'patch') {
    return formatSemver([major, minor, patch + 1])
  }

  if (bumpMode === 'minor') {
    return formatSemver([major, minor + 1, 0])
  }

  return formatSemver([major + 1, 0, 0])
}

const packageJson = readJson(packageJsonPath)
const packageLock = readJson(packageLockPath)
const appJson = readJson(appJsonPath)

const currentVersion = packageJson.version
const nextVersion = bumpSemver(currentVersion, mode)

if (dryRun) {
  console.log(`${currentVersion} -> ${nextVersion}`)
  process.exit(0)
}

packageJson.version = nextVersion
packageLock.version = nextVersion
if (packageLock.packages && packageLock.packages['']) {
  packageLock.packages[''].version = nextVersion
}

appJson.app.version.name = nextVersion
appJson.app.version.code = Number(appJson.app.version.code || 0) + 1

writeJson(packageJsonPath, packageJson)
writeJson(packageLockPath, packageLock)
writeJson(appJsonPath, appJson)

if (stage) {
  const gitAdd = spawnSync(
    'git',
    ['add', 'package.json', 'package-lock.json', 'zepp-app/app.json'],
    {
      cwd: repoRoot,
      stdio: 'inherit',
    }
  )

  if (gitAdd.status !== 0) {
    process.exit(gitAdd.status || 1)
  }
}

console.log(`Version bumped: ${currentVersion} -> ${nextVersion}; code=${appJson.app.version.code}`)
