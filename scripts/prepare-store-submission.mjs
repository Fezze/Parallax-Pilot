import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const submissionRoot = path.join(repoRoot, 'submission')
const artifactsDir = path.join(submissionRoot, 'artifacts')
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''))
}

function parseReleaseVersion() {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === '--dry-run') {
      continue
    }
    if (arg === '--release-version' || arg === '--version') {
      return args[index + 1] || ''
    }
    if (arg.startsWith('--release-version=')) {
      return arg.slice('--release-version='.length)
    }
    if (!arg.startsWith('-')) {
      return arg
    }
  }
  return ''
}

function assertExists(relativePath) {
  const fullPath = path.join(submissionRoot, relativePath)
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing submission asset: ${relativePath}`)
  }
}

function latestZabPath() {
  const distDir = path.join(repoRoot, 'zepp-app', 'dist')
  if (!fs.existsSync(distDir)) {
    throw new Error('No ZAB artifact found under zepp-app/dist')
  }

  const files = fs.readdirSync(distDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.zab'))
    .map((entry) => {
      const filePath = path.join(distDir, entry.name)
      return { filePath, mtimeMs: fs.statSync(filePath).mtimeMs }
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs)

  if (files.length === 0) {
    throw new Error('No ZAB artifact found under zepp-app/dist')
  }

  return files[0].filePath
}

if (!fs.existsSync(submissionRoot)) {
  throw new Error('Missing submission folder')
}

const appConfig = readJson(path.join(repoRoot, 'zepp-app', 'app.json'))
const localeNames = Object.keys(appConfig.i18n || {})
const locales = localeNames.length > 0 ? localeNames : [appConfig.defaultLanguage].filter(Boolean)
const releaseVersion = parseReleaseVersion() || String(appConfig.app.version.name)
const requiredPaths = [
  'README.md',
  'STORE_SUBMISSION_FORM.md',
  'STORE_SUBMISSION_FORM.json',
  'assets/icon/store-icon-240.png',
  'assets/screenshots/manifest.json',
]

for (const locale of locales) {
  requiredPaths.push(`listing/${locale}.md`)
  requiredPaths.push(`privacy/${locale}.md`)
  requiredPaths.push(`assets/language-preview/${locale}-preview.png`)
}

const screenshotsManifest = readJson(path.join(submissionRoot, 'assets', 'screenshots', 'manifest.json'))
for (const locale of Object.keys(screenshotsManifest.screenshots || {})) {
  for (const shape of Object.keys(screenshotsManifest.screenshots[locale] || {})) {
    requiredPaths.push(...screenshotsManifest.screenshots[locale][shape])
  }
}

for (const relativePath of requiredPaths) {
  assertExists(relativePath)
}

const sourceZab = latestZabPath()
const outputName = `Parallax_Pilot-${releaseVersion}-release.zab`

if (dryRun) {
  console.log(`Dry run: validated submission assets; latest ZAB is ${path.basename(sourceZab)}.`)
  process.exit(0)
}

fs.mkdirSync(artifactsDir, { recursive: true })
for (const entry of fs.readdirSync(artifactsDir)) {
  fs.rmSync(path.join(artifactsDir, entry), { recursive: true, force: true })
}

fs.copyFileSync(sourceZab, path.join(artifactsDir, outputName))

console.log(`Validated static submission assets and refreshed artifact in: ${submissionRoot}`)
