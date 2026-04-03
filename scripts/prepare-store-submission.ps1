param(
  [string]$AppId = '1110694',
  [string]$ReleaseVersion = '1.0.1'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$appConfig = Get-Content (Join-Path $repoRoot 'zepp-app\app.json') -Raw | ConvertFrom-Json
$localeNames = @($appConfig.i18n.PSObject.Properties.Name)

if ($localeNames.Count -eq 0) {
  $localeNames = @($appConfig.defaultLanguage)
}

$submissionRoot = Join-Path $repoRoot "submission\$AppId-Parallax_Pilot-$ReleaseVersion-store"
$assetsRoot = Join-Path $submissionRoot 'assets'
$iconDir = Join-Path $assetsRoot 'icon'
$screenshotsDir = Join-Path $assetsRoot 'screenshots'
$languagePreviewDir = Join-Path $assetsRoot 'language-preview'
$artifactsDir = Join-Path $submissionRoot 'artifacts'

foreach ($dir in @($submissionRoot, $assetsRoot, $iconDir, $screenshotsDir, $languagePreviewDir, $artifactsDir)) {
  if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir | Out-Null
  }
}

function New-ConfiguredGraphics($bitmap) {
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  return $graphics
}

function New-RoundedRectPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $r * 2
  $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
  $path.AddArc($x + $w - $diameter, $y, $diameter, $diameter, 270, 90)
  $path.AddArc($x + $w - $diameter, $y + $h - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($x, $y + $h - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function Save-RoundScreenshot($sourcePath, $destinationPath) {
  $source = [System.Drawing.Bitmap]::FromFile((Resolve-Path $sourcePath))
  $destination = New-Object System.Drawing.Bitmap 360, 360, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = New-ConfiguredGraphics $destination
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $clip = New-Object System.Drawing.Drawing2D.GraphicsPath
  $clip.AddEllipse(0, 0, 360, 360)
  $graphics.SetClip($clip)
  $graphics.DrawImage(
    $source,
    (New-Object System.Drawing.Rectangle 0, 0, 360, 360),
    24,
    24,
    480,
    480,
    [System.Drawing.GraphicsUnit]::Pixel
  )
  $destination.Save($destinationPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $clip.Dispose()
  $graphics.Dispose()
  $destination.Dispose()
  $source.Dispose()
}

function Save-SquareScreenshot($sourcePath, $destinationPath) {
  $source = [System.Drawing.Bitmap]::FromFile((Resolve-Path $sourcePath))
  $destination = New-Object System.Drawing.Bitmap 360, 360, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = New-ConfiguredGraphics $destination
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $clip = New-RoundedRectPath 0 0 360 360 26
  $graphics.SetClip($clip)
  $graphics.DrawImage(
    $source,
    (New-Object System.Drawing.Rectangle 0, 0, 360, 360),
    24,
    24,
    390,
    390,
    [System.Drawing.GraphicsUnit]::Pixel
  )
  $destination.Save($destinationPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $clip.Dispose()
  $graphics.Dispose()
  $destination.Dispose()
  $source.Dispose()
}

function Save-StoreIcon($sourcePath, $destinationPath) {
  $source = [System.Drawing.Bitmap]::FromFile((Resolve-Path $sourcePath))
  $prepared = New-Object System.Drawing.Bitmap $source.Width, $source.Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

  for ($y = 0; $y -lt $source.Height; $y += 1) {
    for ($x = 0; $x -lt $source.Width; $x += 1) {
      $pixel = $source.GetPixel($x, $y)
      if ($pixel.R -lt 8 -and $pixel.G -lt 8 -and $pixel.B -lt 8) {
        $prepared.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
      } else {
        $prepared.SetPixel($x, $y, $pixel)
      }
    }
  }

  $minX = $prepared.Width
  $minY = $prepared.Height
  $maxX = -1
  $maxY = -1

  for ($y = 0; $y -lt $prepared.Height; $y += 1) {
    for ($x = 0; $x -lt $prepared.Width; $x += 1) {
      if ($prepared.GetPixel($x, $y).A -gt 0) {
        if ($x -lt $minX) { $minX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -gt $maxY) { $maxY = $y }
      }
    }
  }

  $destination = New-Object System.Drawing.Bitmap 240, 240, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = New-ConfiguredGraphics $destination
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.DrawImage(
    $prepared,
    (New-Object System.Drawing.Rectangle 0, 0, 240, 240),
    $minX,
    $minY,
    ($maxX - $minX + 1),
    ($maxY - $minY + 1),
    [System.Drawing.GraphicsUnit]::Pixel
  )
  $destination.Save($destinationPath, [System.Drawing.Imaging.ImageFormat]::Png)

  $graphics.Dispose()
  $destination.Dispose()
  $prepared.Dispose()
  $source.Dispose()
}

$roundShots = @(
  @{
    Source = 'output\playwright\test-results\page-preview-preview-game--1708e-enders-and-saves-screenshot\game-round-left.png'
    Target = '01-round-game-left.png'
  },
  @{
    Source = 'output\playwright\test-results\page-preview-preview-game--68183-enders-and-saves-screenshot\game-round-right.png'
    Target = '02-round-game-right.png'
  }
)

$squareShots = @(
  @{
    Source = 'output\playwright\test-results\page-preview-preview-game--f13fa-enders-and-saves-screenshot\game-square-left.png'
    Target = '03-square-game-left.png'
  },
  @{
    Source = 'output\playwright\test-results\page-preview-preview-game--24339-enders-and-saves-screenshot\game-square-right.png'
    Target = '04-square-game-right.png'
  }
)

$allShots = @($roundShots + $squareShots)
$genericScreenshotPaths = @()

foreach ($shot in $roundShots) {
  $destinationPath = Join-Path $screenshotsDir $shot.Target
  Save-RoundScreenshot $shot.Source $destinationPath
  $genericScreenshotPaths += "assets/screenshots/$($shot.Target)"
}

foreach ($shot in $squareShots) {
  $destinationPath = Join-Path $screenshotsDir $shot.Target
  Save-SquareScreenshot $shot.Source $destinationPath
  $genericScreenshotPaths += "assets/screenshots/$($shot.Target)"
}

$localizedScreenshotPaths = [ordered]@{}

foreach ($locale in $localeNames) {
  $localeDir = Join-Path $screenshotsDir $locale
  if (-not (Test-Path $localeDir)) {
    New-Item -ItemType Directory -Path $localeDir | Out-Null
  }

  $localizedScreenshotPaths[$locale] = @()

  foreach ($shot in $allShots) {
    $sourcePath = Join-Path $screenshotsDir $shot.Target
    $targetPath = Join-Path $localeDir $shot.Target
    Copy-Item $sourcePath $targetPath -Force
    $localizedScreenshotPaths[$locale] += "assets/screenshots/$locale/$($shot.Target)"
  }

  Copy-Item (Join-Path $localeDir '01-round-game-left.png') (Join-Path $languagePreviewDir "$locale-preview.png") -Force
}

$screenshotManifest = [ordered]@{
  defaultLanguage = $appConfig.defaultLanguage
  locales = $localeNames
  genericScreenshots = $genericScreenshotPaths
  localizedScreenshots = $localizedScreenshotPaths
}

$screenshotManifest |
  ConvertTo-Json -Depth 6 |
  Set-Content (Join-Path $screenshotsDir 'manifest.json')

Save-StoreIcon 'zepp-app\icon.png' (Join-Path $iconDir 'store-icon-240.png')

$latestZab = Get-ChildItem -Path (Join-Path $repoRoot 'zepp-app\dist') -Filter '*.zab' |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if ($null -eq $latestZab) {
  throw 'No ZAB artifact found under zepp-app\dist'
}

Copy-Item $latestZab.FullName (Join-Path $artifactsDir "Parallax_Pilot-$ReleaseVersion-release.zab") -Force

Write-Output "Prepared store submission folder: $submissionRoot"
