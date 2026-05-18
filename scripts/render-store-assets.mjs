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
const roundSourceResolution = '416x416'
const roundSourceFileMap = {
  'settings-rotary.png': 'settings-swipe.png',
}
const squareSourceResolution = '390x450'
const squareSourceWidth = 390
const squareSourceHeight = 450
const squarePreviewWidth = Math.round((targetSize * squareSourceWidth) / squareSourceHeight)
const squarePreviewOffsetX = Math.round((targetSize - squarePreviewWidth) / 2)
const squarePreviewCornerRadius = Math.round(targetSize * 0.085)

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''))
}

function rawSquareSource(locale, fileName) {
  return path.join(rawScreenshotsRoot, locale, 'square', squareSourceResolution, fileName)
}

function rawRoundSource(locale, fileName) {
  const sourceFileName = roundSourceFileMap[fileName] || fileName
  return path.join(rawScreenshotsRoot, locale, 'round', roundSourceResolution, sourceFileName)
}

async function renderRoundPreview(page, sourcePath, destinationPath) {
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
      }

      #screen {
        width: ${targetSize}px;
        height: ${targetSize}px;
        border-radius: 50%;
        overflow: hidden;
      }

      #screen img {
        width: 100%;
        height: 100%;
        display: block;
      }
    </style>
    <div id="frame">
      <div id="screen">
        <img src="${dataUrl}" alt="store preview" />
      </div>
    </div>
  `)

  fs.mkdirSync(path.dirname(destinationPath), { recursive: true })
  await page.locator('#frame').screenshot({ path: destinationPath, omitBackground: true })
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

      #screen {
        position: absolute;
        inset: 0 auto 0 ${squarePreviewOffsetX}px;
        width: ${squarePreviewWidth}px;
        height: ${targetSize}px;
        border-radius: ${squarePreviewCornerRadius}px;
        overflow: hidden;
      }

      #screen img {
        width: 100%;
        height: 100%;
        display: block;
      }
    </style>
    <div id="frame">
      <div id="screen">
        <img src="${dataUrl}" alt="store preview" />
      </div>
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
      for (const relativeDestination of localeGroups.round || []) {
        const destinationPath = path.join(submissionRoot, relativeDestination)
        const sourcePath = rawRoundSource(locale, path.basename(relativeDestination))

        if (dryRun) {
          console.log(`dry-run round screenshot: ${sourcePath} -> ${destinationPath}`)
          continue
        }

        await renderRoundPreview(page, sourcePath, destinationPath)
        console.log(`rendered round screenshot: ${path.relative(repoRoot, destinationPath)}`)
      }

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
