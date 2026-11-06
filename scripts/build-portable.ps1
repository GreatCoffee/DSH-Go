#Requires -Version 7
<#
.SYNOPSIS
  Build the Windows x64 portable DSH-Go distribution.
.DESCRIPTION
  Runs the unsigned directory build of the Desktop application, then assembles
  `dist/DSH-Go` so every mutable file lives under `DSH-Go\portable`. The
  program files stay replaceable while the portable directory keeps user data.
.PARAMETER Zip
  Also produce `dist/DSH-Go-<version>-win-x64-portable.zip`.
.PARAMETER SkipBuild
  Reuse the existing `win-unpacked` directory instead of rebuilding.
#>
[CmdletBinding()]
param(
  [switch]$Zip,
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$desktop = Join-Path $repoRoot 'apps/desktop'
$output = Join-Path $repoRoot 'dist/DSH-Go'
$unpacked = Join-Path $desktop '.desktop-build/targets/win-x64/unsigned-artifacts/win-unpacked'

function Write-Step([string]$message) { Write-Host "==> $message" -ForegroundColor Cyan }

if (-not $SkipBuild) {
  Write-Step 'packaging the Windows x64 directory build'
  & pnpm --dir $desktop exec tsx scripts/package-target.ts win-x64 --dir --unsigned
  if ($LASTEXITCODE -ne 0) { throw "desktop packaging failed with exit code $LASTEXITCODE" }
}

if (-not (Test-Path (Join-Path $unpacked 'DeepSeek Harness.exe'))) {
  throw "the packaged application is missing: $unpacked"
}

$version = (Get-Content (Join-Path $desktop 'package.json') -Raw | ConvertFrom-Json).version
$commit = (& git -C $repoRoot rev-parse --short HEAD) 2>$null

Write-Step "assembling $output"
if (Test-Path $output) { Remove-Item $output -Recurse -Force }
New-Item -ItemType Directory -Force -Path (Split-Path $output) | Out-Null
& robocopy $unpacked $output /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit code $LASTEXITCODE" }

foreach ($directory in 'dsh-home', 'user-data', 'workspace', 'cache', 'config', 'state', 'logs', 'temp') {
  New-Item -ItemType Directory -Force -Path (Join-Path $output "portable/$directory") | Out-Null
}

$notice = @'
This directory holds every file DSH-Go changes at runtime: sessions, settings,
credentials, the default workspace, and caches.

Move the whole parent directory (the one containing the executable) to any local
path or network share and start the executable again. On the next start DSH-Go
rewrites the absolute paths it stored, so the previous workspaces, sessions, and
settings keep working.

Notes:
- portable/dsh-home/.credentials.yaml is plain text. Remove it before sharing or
  uploading this directory.
- The Windows write-restriction sandbox cannot own an ACL on a network share, so
  DSH-Go starts unconfined when the executable lives on a mapped drive or UNC path.
  Set DSH_PERMISSION_MODE=workspace-write to force confinement on local disks.
- Run one copy at a time. Two machines writing the same portable directory at
  once can corrupt session logs.
- XDG_CONFIG_HOME, XDG_CACHE_HOME, and XDG_STATE_HOME point at portable/config,
  portable/cache, and portable/state, so plugins and tools that follow the XDG
  base directory specification keep their files inside this directory too.
- portable/logs holds the Host console for the last seven days (host-<date>.log).
  It is the only trace of a warning printed long after the fact, such as a
  refused deletion or a cache eviction that failed.
'@
Set-Content -Path (Join-Path $output 'portable/README.txt') -Value $notice -Encoding utf8

$buildInfo = @(
  "version: $version"
  "commit: $commit"
  "built: $((Get-Date).ToString('o'))"
  "runtime: win32-x64 (unsigned directory build)"
)
Set-Content -Path (Join-Path $output 'BUILD-INFO.txt') -Value $buildInfo -Encoding utf8

Copy-Item (Join-Path $repoRoot 'scripts/update-portable.ps1') (Join-Path $output 'Update-DSH-Go.ps1') -Force
Copy-Item (Join-Path $repoRoot 'scripts/update-portable.cmd') (Join-Path $output 'Update-DSH-Go.cmd') -Force

if ($Zip) {
  $archive = Join-Path $repoRoot "dist/DSH-Go-$version-win-x64-portable.zip"
  Write-Step "compressing $archive"
  if (Test-Path $archive) { Remove-Item $archive -Force }
  Compress-Archive -Path $output -DestinationPath $archive -CompressionLevel Optimal
  Write-Host "archive: $archive"
}

$size = (Get-ChildItem $output -Recurse -File | Measure-Object Length -Sum).Sum / 1MB
Write-Host ("done: {0} ({1:N0} MB)" -f $output, $size) -ForegroundColor Green
