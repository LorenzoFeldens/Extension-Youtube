# Builds dist/playlist-buttons-for-youtube-<version>.zip for upload to the Chrome Web Store.
# Usage (from the project folder):  .\package.ps1
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$manifest = Get-Content manifest.json -Raw | ConvertFrom-Json
if ($manifest.PSObject.Properties.Name -contains 'key') {
  throw 'manifest.json contains a "key" field. Remove it before packaging: the Chrome Web Store rejects it.'
}

# Only the files the extension needs at runtime.
$files = @(
  'manifest.json',
  'background.js',
  'contentScript.js',
  'popup.html',
  'popup.js',
  'styles.css',
  'icons/icon16.png',
  'icons/icon32.png',
  'icons/icon48.png',
  'icons/icon128.png'
)
foreach ($f in $files) { if (-not (Test-Path $f)) { throw "Missing file: $f" } }

New-Item -ItemType Directory -Force dist | Out-Null
$zip = "dist/playlist-buttons-for-youtube-$($manifest.version).zip"
if (Test-Path $zip) { Remove-Item $zip }

# Windows' bundled bsdtar writes zip entries with forward slashes
# (Compress-Archive in PowerShell 5.1 uses backslashes, which the store can reject).
& "$env:SystemRoot\System32\tar.exe" -a -c -f $zip @files
if ($LASTEXITCODE -ne 0) { throw 'tar failed' }

Write-Host "Created $zip"
