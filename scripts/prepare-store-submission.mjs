import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const submissionRoot = path.join(repoRoot, 'submission')
const artifactsDir = path.join(submissionRoot, 'artifacts')
const renderAssetsScript = path.join(repoRoot, 'scripts', 'render-store-assets.mjs')
const playwrightProxyScript = path.join(repoRoot, 'scripts', 'playwright-proxy.mjs')
const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')

const DEVICE_NAME_MAP = {
  balance: 'Amazfit Balance',
  'balance-2': 'Amazfit Balance 2',
  't-rex-3': 'Amazfit T-Rex 3',
  't-rex-3-pro-48mm': 'Amazfit T-Rex 3 Pro (48mm)',
  'active-max': 'Amazfit Active Max',
  'cheetah-pro': 'Amazfit Cheetah Pro',
  'active-3-premium': 'Amazfit Active 3 Premium',
  't-rex-3-pro-44mm': 'Amazfit T-Rex 3 Pro (44mm)',
  'active-2-round': 'Amazfit Active 2 (Round)',
  'gtr-4': 'Amazfit GTR 4',
  'cheetah-round': 'Amazfit Cheetah (Round)',
  't-rex-ultra': 'Amazfit T-Rex Ultra',
  falcon: 'Amazfit Falcon',
  'active-2-square': 'Amazfit Active 2 (Square)',
  'bip-6': 'Amazfit Bip 6',
  active: 'Amazfit Active',
  'cheetah-square': 'Amazfit Cheetah (Square)',
  'gts-4': 'Amazfit GTS 4',
}

const LOCALE_LABELS = {
  'en-US': 'English',
  'pl-PL': 'Polish',
}

const SCREENSHOT_FILES = {
  round: [
    'game-left.png',
    'game-right.png',
    'home-default.png',
    'home-tuned.png',
    'results-empty.png',
    'results-page-first.png',
    'results-page-last.png',
    'results-session.png',
    'settings-rotary.png',
    'settings-touch.png',
  ],
  square: [
    'game-left.png',
    'game-right.png',
    'home-default.png',
    'home-tuned.png',
    'results-empty.png',
    'results-page-first.png',
    'results-page-last.png',
    'results-session.png',
    'settings-tilt.png',
    'settings-touch.png',
  ],
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''))
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function writeText(filePath, text) {
  fs.writeFileSync(filePath, `${text.replace(/\s+$/u, '')}\n`)
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

function runCommand(command, commandArgs, errorMessage) {
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
    stdio: 'inherit',
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`${errorMessage} (status ${result.status ?? 1})`)
  }
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

function refreshPlaywrightScreenshots() {
  runCommand(process.execPath, [playwrightProxyScript, 'test', 'tests/playwright/page-preview.spec.js'], 'Failed to refresh Playwright preview screenshots')
}

function renderSubmissionAssets() {
  runCommand(process.execPath, [renderAssetsScript, ...(dryRun ? ['--dry-run'] : [])], 'Failed to render submission assets')
}

function localeNamesFromApp(appConfig) {
  const localeNames = Object.keys(appConfig.i18n || {})
  return localeNames.length > 0 ? localeNames : [appConfig.defaultLanguage].filter(Boolean)
}

function supportedDevicesFromApp(appConfig) {
  const seen = new Set()
  const devices = []

  for (const target of Object.values(appConfig.targets || {})) {
    for (const platform of target.platforms || []) {
      const displayName = DEVICE_NAME_MAP[platform.name] || platform.name
      if (!seen.has(displayName)) {
        seen.add(displayName)
        devices.push(displayName)
      }
    }
  }

  return devices
}

function releaseShapesFromApp(appConfig) {
  const shapes = []
  for (const targetName of Object.keys(appConfig.targets || {})) {
    if (targetName.startsWith('round') && !shapes.includes('round')) {
      shapes.push('round')
    }
    if (targetName.startsWith('square') && !shapes.includes('square')) {
      shapes.push('square')
    }
  }
  return shapes
}

function parseSectionText(filePath, heading) {
  const content = fs.readFileSync(filePath, 'utf8')
  const pattern = new RegExp(`^## ${heading}\\n\\n([\\s\\S]*?)(?:\\n## |$)`, 'm')
  const match = content.match(pattern)
  return match ? match[1].trim().split('\n')[0].trim() : ''
}

function buildScreenshotsManifest(appConfig, locales) {
  const screenshots = {}
  for (const locale of locales) {
    screenshots[locale] = Object.fromEntries(
      Object.entries(SCREENSHOT_FILES).map(([shape, fileNames]) => [
        shape,
        fileNames.map((fileName) => `assets/screenshots/${locale}/${shape}/${fileName}`),
      ])
    )
  }

  return {
    defaultLanguage: appConfig.defaultLanguage,
    locales,
    screenshots,
    previewImages: Object.fromEntries(
      locales.map((locale) => [locale, `assets/language-preview/${locale}-preview.png`])
    ),
  }
}

function buildSubmissionFormJson({ appConfig, locales, outputName }) {
  const existingFormPath = path.join(submissionRoot, 'STORE_SUBMISSION_FORM.json')
  const existingForm = fs.existsSync(existingFormPath) ? readJson(existingFormPath) : {}
  const languages = Object.fromEntries(locales.map((locale) => {
    const listingPath = `listing/${locale}.md`
    return [locale, {
      appName: parseSectionText(path.join(submissionRoot, listingPath), 'App Name') || appConfig.app.appName,
      appIntroduction: parseSectionText(path.join(submissionRoot, listingPath), 'App Introduction'),
      listingPath,
      previewImage: `assets/language-preview/${locale}-preview.png`,
    }]
  }))

  return {
    appId: appConfig.app.appId,
    appName: appConfig.app.appName,
    developerNickname: existingForm.developerNickname || 'Fezze',
    serviceCategory: existingForm.serviceCategory || 'Normal',
    appClassification: existingForm.appClassification || 'Game',
    countryOrRegion: existingForm.countryOrRegion || 'TODO_CONFIRM_IN_CONSOLE',
    applicationPackage: `artifacts/${outputName}`,
    versionName: String(appConfig.app.version.name),
    versionCode: Number(appConfig.app.version.code),
    supportedDevices: supportedDevicesFromApp(appConfig),
    releaseShapeCoverage: releaseShapesFromApp(appConfig),
    languages,
    screenshotsManifest: 'assets/screenshots/manifest.json',
    storeIcon: 'assets/icon/store-icon-240.png',
    privacyStatements: Object.fromEntries(locales.map((locale) => [locale, `privacy/${locale}.md`])),
    permissions: [...(appConfig.permissions || [])],
    callPermissionSelection: existingForm.callPermissionSelection || ['Others'],
    featureDescription: existingForm.featureDescription || 'Parallax Pilot is a watch-only arcade game. It uses the accelerometer for tilt controls, local storage for on-watch settings and score history, and device info for screen/layout adaptation. It does not use network access, location, heart rate, accounts, or background services.',
    sdkIncluded: existingForm.sdkIncluded ?? false,
  }
}

function buildSubmissionFormMarkdown(form, screenshotsManifest) {
  const deviceLines = form.supportedDevices.map((device) => `  - \`${device}\``).join('\n')
  const languageLines = Object.entries(form.languages).map(([locale, info]) => [
    `- \`${locale}\``,
    `  Name: \`${info.appName}\``,
    `  App introduction: \`${info.appIntroduction}\``,
    `  App details: \`${info.listingPath}\``,
    `  App profile preview image: \`${info.previewImage}\``,
  ].join('\n')).join('\n')
  const screenshotLines = Object.entries(screenshotsManifest.screenshots)
    .flatMap(([locale, shapeGroups]) => Object.entries(shapeGroups).map(([shape, files]) => `- \`${locale}\` ${shape}: \`${files.length}\` screenshots in \`assets/screenshots/${locale}/${shape}/\``))
    .join('\n')
  const privacyLines = Object.entries(form.privacyStatements)
    .map(([locale, privacyPath]) => `- ${LOCALE_LABELS[locale] || locale}: \`${privacyPath}\``)
    .join('\n')
  const permissionLines = form.permissions.map((permission) => `  - \`${permission}\``).join('\n')

  return `# Zepp Console Submission Draft

## Core

- App ID: \`${form.appId}\`
- App name: \`${form.appName}\`
- Developer nickname: \`${form.developerNickname}\`
- Service category: \`${form.serviceCategory}\`
- App classification: \`${form.appClassification}\`
- Country or region: \`${form.countryOrRegion}\`

## Package

- Application package: \`${form.applicationPackage}\`
- Current app manifest version: \`${form.versionName}\`
- Current app manifest version code: \`${form.versionCode}\`
- Supporting devices: auto-filled by Zepp Console after ZAB upload
- Current target device set in \`app.json\`:
${deviceLines}
- Current release shape coverage: ${form.releaseShapeCoverage.map((shape) => `\`${shape}\``).join(' and ')}

## Languages

${languageLines}

## App Introduction Screenshots

${screenshotLines}
- Full map: \`${form.screenshotsManifest}\`
- Format prepared: \`360x360 PNG\` with transparent background
- Round export: no margins
- Rectangular export: equal left/right margins, rounded screen corners, and source border visible along the curved screen edge

## Store Icon

- \`${form.storeIcon}\`

## Privacy Statement

${privacyLines}

## Calling Permissions

- Select in console: ${(form.callPermissionSelection || []).map((permission) => `\`${permission}\``).join(', ')}
- Do not select: \`Heart Rate\`, \`Connect to the network\`, \`Positioning\`, \`Run in background\`
- Runtime permissions used by the app:
${permissionLines}

## SDK Included

- \`${form.sdkIncluded ? 'Yes' : 'No'}\`

## Features Descriptions

- \`${form.featureDescription}\`

## Submission Notes

- Watch-only game
- No account system
- No phone-side companion sync
- No backend
- No cloud storage
- Score history and settings stay on the watch`
}

function buildSubmissionReadme({ appConfig, form, outputName, locales }) {
  const roundDevices = form.supportedDevices.filter((device) => !device.includes('(Square)') && device !== 'Amazfit Bip 6' && device !== 'Amazfit Active' && device !== 'Amazfit Cheetah (Square)' && device !== 'Amazfit GTS 4')
  const squareDevices = form.supportedDevices.filter((device) => !roundDevices.includes(device))

  return `# Parallax Pilot Store Submission Pack

This folder contains the prepared materials for Zepp Console submission of \`${appConfig.app.appName}\` \`${appConfig.app.version.name}\`.

Current release scope:

- supported round devices in \`app.json\`: ${roundDevices.map((device) => `\`${device.replace('Amazfit ', '')}\``).join(', ')}
- supported square devices in \`app.json\`: ${squareDevices.map((device) => `\`${device.replace('Amazfit ', '')}\``).join(', ')}
- current release shape coverage: ${form.releaseShapeCoverage.map((shape) => `\`${shape}\``).join(' and ')}
- current submission locales: ${locales.map((locale) => `\`${locale}\``).join(', ')}

## Included

- \`STORE_SUBMISSION_FORM.md\`: copy-ready submission draft
- \`STORE_SUBMISSION_FORM.json\`: structured form draft
- \`artifacts/${outputName}\`: upload this package in Zepp Console
- \`assets/icon/store-icon-240.png\`: store icon
- \`assets/screenshots/manifest.json\`: locale-to-screenshot map generated from \`zepp-app/app.json\`
- \`assets/screenshots/<locale>/<shape>/*.png\`: screenshot sets grouped by language and shape, \`10\` per shape for each locale, exported as \`360x360 PNG\`
- screenshot backgrounds are transparent
- round screenshots fill the full square with no margins
- rectangular screenshots are centered with equal left/right margins, preserve the visible rounded display edge, and keep rounded screen corners
- \`assets/language-preview/*.png\`: preview image draft for each language
- \`listing/*.md\`: app details for ${locales.map((locale) => `\`${locale}\``).join(', ')}
- \`privacy/*.md\`: privacy statements for ${locales.map((locale) => `\`${locale}\``).join(', ')}

## Regenerating Submission Assets

- Run \`npm run test:playwright:screens\` to refresh raw preview screenshots under \`output/playwright/screenshots/\`
- Run \`npm run submission:render-assets\` to rebuild square submission screenshots and language preview images from the refreshed raw captures
- Run \`npm run submission:prepare\` to refresh Playwright screenshots, regenerate submission metadata, validate the pack, and refresh the release artifact

## Still manual in Zepp Console

- choose country or region
- confirm app classification label shown in the current Console UI
- upload files and submit for review`
}

if (!fs.existsSync(submissionRoot)) {
  throw new Error('Missing submission folder')
}

const appConfig = readJson(path.join(repoRoot, 'zepp-app', 'app.json'))
const locales = localeNamesFromApp(appConfig)
const releaseVersion = parseReleaseVersion() || String(appConfig.app.version.name)
const outputName = `Parallax_Pilot-${releaseVersion}-release.zab`
const screenshotsManifest = buildScreenshotsManifest(appConfig, locales)

refreshPlaywrightScreenshots()

if (!dryRun) {
  writeJson(path.join(submissionRoot, 'assets', 'screenshots', 'manifest.json'), screenshotsManifest)
}

renderSubmissionAssets()

const submissionForm = buildSubmissionFormJson({ appConfig, locales, outputName })
const submissionFormMarkdown = buildSubmissionFormMarkdown(submissionForm, screenshotsManifest)
const submissionReadme = buildSubmissionReadme({ appConfig, form: submissionForm, outputName, locales })

if (!dryRun) {
  writeJson(path.join(submissionRoot, 'STORE_SUBMISSION_FORM.json'), submissionForm)
  writeText(path.join(submissionRoot, 'STORE_SUBMISSION_FORM.md'), submissionFormMarkdown)
  writeText(path.join(submissionRoot, 'README.md'), submissionReadme)
}

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

for (const locale of Object.keys(screenshotsManifest.screenshots || {})) {
  for (const shape of Object.keys(screenshotsManifest.screenshots[locale] || {})) {
    requiredPaths.push(...screenshotsManifest.screenshots[locale][shape])
  }
}

for (const relativePath of requiredPaths) {
  assertExists(relativePath)
}

const sourceZab = latestZabPath()

if (dryRun) {
  console.log(`Dry run: validated submission assets; latest ZAB is ${path.basename(sourceZab)}.`)
  process.exit(0)
}

fs.mkdirSync(artifactsDir, { recursive: true })
for (const entry of fs.readdirSync(artifactsDir)) {
  fs.rmSync(path.join(artifactsDir, entry), { recursive: true, force: true })
}

fs.copyFileSync(sourceZab, path.join(artifactsDir, outputName))

console.log(`Regenerated submission metadata and refreshed artifact in: ${submissionRoot}`)
