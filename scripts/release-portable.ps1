#Requires -Version 7
<#
.SYNOPSIS
  Package the current portable build as a GitHub release, so installations can
  update themselves with scripts/update-portable.ps1.
.DESCRIPTION
  Rebuilds (or reuses) `dist/DSH-Go`, writes a zip plus its SHA-256, and creates
  a GitHub release tagged with the built commit. The release, not the repository,
  carries the 1 GB artifact.
.PARAMETER SkipBuild
  Reuse the existing `dist/DSH-Go` directory.
.PARAMETER Draft
  Create the release as a draft.
#>
[CmdletBinding()]
param(
  [switch]$SkipBuild,
  [switch]$Draft,
  [string]$Repository = 'GreatCoffee/DSH-Go'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $repoRoot 'dist/DSH-Go'

if (-not $SkipBuild) {
  & pwsh -NoProfile -File (Join-Path $PSScriptRoot 'build-portable.ps1')
  if ($LASTEXITCODE -ne 0) { throw "build-portable.ps1 failed with exit code $LASTEXITCODE" }
}

if (-not (Test-Path (Join-Path $dist 'DeepSeek Harness.exe'))) {
  throw "no portable build at $dist; run scripts/build-portable.ps1 first"
}

$info = Get-Content (Join-Path $dist 'BUILD-INFO.txt')
$version = ($info | Where-Object { $_ -like 'version:*' }) -replace '^version:\s*', ''
$commit = ($info | Where-Object { $_ -like 'commit:*' }) -replace '^commit:\s*', ''
$tag = "go-$commit"
$archive = Join-Path $repoRoot "dist/DSH-Go-$commit-win-x64-portable.zip"

Write-Host "==> compressing $archive" -ForegroundColor Cyan
if (Test-Path $archive) { Remove-Item $archive -Force }
Compress-Archive -Path $dist -DestinationPath $archive -CompressionLevel Optimal

$hash = (Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant()
$checksumFile = "$archive.sha256"
Set-Content -Path $checksumFile -Value "$hash  $(Split-Path -Leaf $archive)" -Encoding ascii

Write-Host "==> creating release $tag" -ForegroundColor Cyan
$notes = @(
  "Portable Windows x64 build."
  ""
  "Upstream version: $version"
  "Build commit: $commit"
  "SHA-256: $hash"
  ""
  "Update an existing installation with:"
  '  pwsh scripts/update-portable.ps1'
) -join "`n"

$existing = gh release view $tag --repo $Repository 2>$null
if ($LASTEXITCODE -eq 0) {
  Write-Host "release $tag already exists; uploading assets to it" -ForegroundColor Yellow
  & gh release upload $tag $archive $checksumFile --repo $Repository --clobber
} else {
  $arguments = @(
    $tag, $archive, $checksumFile,
    '--title', "DSH-Go $version ($commit)",
    '--notes', $notes,
    '--repo', $Repository
  )
  if ($Draft) { $arguments += '--draft' }
  & gh release create @arguments
}
if ($LASTEXITCODE -ne 0) { throw "gh release failed with exit code $LASTEXITCODE" }

Write-Host "done: $tag" -ForegroundColor Green
