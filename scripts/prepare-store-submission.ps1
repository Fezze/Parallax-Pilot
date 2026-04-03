param(
  [string]$ReleaseVersion = ''
)

$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$appConfig = Get-Content (Join-Path $repoRoot 'zepp-app\app.json') -Raw | ConvertFrom-Json
$localeNames = @($appConfig.i18n.PSObject.Properties.Name)

if ($localeNames.Count -eq 0) {
  $localeNames = @($appConfig.defaultLanguage)
}

if (-not $ReleaseVersion) {
  $ReleaseVersion = [string]$appConfig.app.version.name
}

$submissionRoot = Join-Path $repoRoot 'submission'
$artifactsDir = Join-Path $submissionRoot 'artifacts'

if (-not (Test-Path $submissionRoot)) {
  throw 'Missing submission folder'
}

if (-not (Test-Path $artifactsDir)) {
  New-Item -ItemType Directory -Path $artifactsDir | Out-Null
}

$requiredPaths = @(
  'README.md',
  'STORE_SUBMISSION_FORM.md',
  'STORE_SUBMISSION_FORM.json',
  'assets/icon/store-icon-240.png',
  'assets/screenshots/manifest.json'
)

foreach ($locale in $localeNames) {
  $requiredPaths += "listing/$locale.md"
  $requiredPaths += "privacy/$locale.md"
  $requiredPaths += "assets/language-preview/$locale-preview.png"
}

$screenshotsManifestPath = Join-Path $submissionRoot 'assets/screenshots/manifest.json'
$screenshotsManifest = Get-Content $screenshotsManifestPath -Raw | ConvertFrom-Json

foreach ($locale in @($screenshotsManifest.screenshots.PSObject.Properties.Name)) {
  foreach ($shape in @($screenshotsManifest.screenshots.$locale.PSObject.Properties.Name)) {
    foreach ($relativeScreenshotPath in @($screenshotsManifest.screenshots.$locale.$shape)) {
      $requiredPaths += $relativeScreenshotPath
    }
  }
}

foreach ($relativePath in $requiredPaths) {
  $fullPath = Join-Path $submissionRoot $relativePath
  if (-not (Test-Path $fullPath)) {
    throw "Missing submission asset: $relativePath"
  }
}

Get-ChildItem -Path $artifactsDir -Force -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force

$latestZab = Get-ChildItem -Path (Join-Path $repoRoot 'zepp-app\dist') -Filter '*.zab' |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if ($null -eq $latestZab) {
  throw 'No ZAB artifact found under zepp-app\dist'
}

Copy-Item $latestZab.FullName (Join-Path $artifactsDir "Parallax_Pilot-$ReleaseVersion-release.zab") -Force

Write-Output "Validated static submission assets and refreshed artifact in: $submissionRoot"
