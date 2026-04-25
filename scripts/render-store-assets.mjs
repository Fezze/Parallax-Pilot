import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const submissionRoot = path.join(repoRoot, 'submission')
const rawScreenshotsRoot = path.join(repoRoot, 'output', 'playwright', 'screenshots')
const manifestPath = path.join(submissionRoot, 'assets', 'screenshots', 'manifest.json')
const dryRun = process.argv.includes('--dry-run')
const targetSize = 360
const squareSourceResolution = '390x450'
const squareSourceWidth = 390
const squareSourceHeight = 450
const squarePreviewWidth = Math.round((targetSize * squareSourceWidth) / squareSourceHeight)
const squarePreviewOffsetX = Math.round((targetSize - squarePreviewWidth) / 2)

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''))
}

function rawSquareSource(locale, fileName) {
  return path.join(rawScreenshotsRoot, locale, 'square', squareSourceResolution, fileName)
}

async function renderSquarePreview(page, sourcePath, destinationPath) {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing raw screenshot: ${sourcePath}`)
  }

  const imageBase64 = fs.readFileSync(sourcePath).toString('base64')
  const dataUrl = `data:image/png;base64,${imageBase64}`

  await page.setViewportSize({ width: targetSize, height: targetSize })
  await page.setContent(`
    <style>
      html, body {
        margin: 0;
        width: ${targetSize}px;
        height: ${targetSize}px;
        background: transparent;
      }

      #frame {
        position: relative;
        width: ${targetSize}px;
        height: ${targetSize}px;
        background: transparent;
      }

      #frame img {
        position: absolute;
        inset: 0 auto 0 ${squarePreviewOffsetX}px;
        width: ${squarePreviewWidth}px;
        height: ${targetSize}px;
        display: block;
      }
    </style>
    <div id="frame">
      <img src="${dataUrl}" alt="store preview" />
    </div>
  `)

  fs.mkdirSync(path.dirname(destinationPath), { recursive: true })
  await page.locator('#frame').screenshot({ path: destinationPath, omitBackground: true })
}

async function main() {
  const manifest = readJson(manifestPath)
  const browser = await chromium.launch()
  const page = await browser.newPage({ deviceScaleFactor: 1 })

  try {
    for (const [locale, localeGroups] of Object.entries(manifest.screenshots || {})) {
      for (const relativeDestination of localeGroups.square || []) {
        const destinationPath = path.join(submissionRoot, relativeDestination)
        const sourcePath = rawSquareSource(locale, path.basename(relativeDestination))

        if (dryRun) {
          console.log(`dry-run square screenshot: ${sourcePath} -> ${destinationPath}`)
          continue
        }

        await renderSquarePreview(page, sourcePath, destinationPath)
        console.log(`rendered square screenshot: ${path.relative(repoRoot, destinationPath)}`)
      }
    }

    for (const [locale, relativeDestination] of Object.entries(manifest.previewImages || {})) {
      const destinationPath = path.join(submissionRoot, relativeDestination)
      const sourcePath = rawSquareSource(locale, 'home-default.png')

      if (dryRun) {
        console.log(`dry-run language preview: ${sourcePath} -> ${destinationPath}`)
        continue
      }

      await renderSquarePreview(page, sourcePath, destinationPath)
      console.log(`rendered language preview: ${path.relative(repoRoot, destinationPath)}`)
    }
  } finally {
    await browser.close()
  }
}

await main()