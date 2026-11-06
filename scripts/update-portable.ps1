#Requires -Version 5.1
<#
.SYNOPSIS
  Update this DSH-Go installation from its GitHub releases.
.DESCRIPTION
  Downloads the newest portable release, verifies its SHA-256, and replaces the
  program files while leaving `portable\` untouched. The application must be
  closed; this script refuses to overwrite files an open instance holds.
.PARAMETER Force
  Stop a running DSH-Go instance instead of refusing to update.
.PARAMETER Check
  Only report whether a newer release exists.
#>
[CmdletBinding()]
param(
  [switch]$Force,
  [switch]$Check
)

$ErrorActionPreference = 'Stop'
$install = $PSScriptRoot
$repository = 'GreatCoffee/DSH-Go'
$a = Join-Path $install 'BUILD-INFO.txt'

if (-not (Test-Path (Join-Path $install 'DeepSeek Harness.exe'))) {
  throw "no DSH-Go installation here: $install"
}

$localCommit = ''
if (Test-Path $a) {
  $line = Get-Content $a | Where-Object { $_ -like 'commit:*' } | Select-Object -First 1
  if ($line) { $localCommit = ($line -replace '^commit:\s*', '').Trim() }
}
Write-Host "installed commit: $localCommit"

# Resolve the newest tag by following `releases/latest` to its tag page. The REST
# API is rate limited per anonymous IP, and Windows PowerShell 5.1 and 7 expose the
# redirect target through different properties, so read whichever exists.
$tag = $null
try {
  $response = Invoke-WebRequest -Uri "https://github.com/$repository/releases/latest" -UseBasicParsing -ErrorAction Stop
} catch {
  Write-Host "Cannot reach GitHub releases: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
$final = $null
if ($response.BaseResponse.RequestMessage) {
  $final = $response.BaseResponse.RequestMessage.RequestUri.AbsoluteUri
} elseif ($response.BaseResponse.ResponseUri) {
  $final = $response.BaseResponse.ResponseUri.AbsoluteUri
}
if ($final -and $final -match '/releases/tag/([^/?#]+)') { $tag = $Matches[1] }
if (-not $tag -or -not $tag.StartsWith('go-')) {
  Write-Host 'No release has been published for this repository yet.' -ForegroundColor Yellow
  return
}
Write-Host "latest release: $tag"

if ($tag -eq "go-$localCommit") {
  Write-Host 'This installation is already at the newest release.' -ForegroundColor Green
  return
}
if ($Check) {
  Write-Host "Update available: $tag" -ForegroundColor Yellow
  return
}

$releaseCommit = $tag -replace '^go-', ''
$archiveName = "DSH-Go-$releaseCommit-win-x64-portable.zip"
$archiveUrl = "https://github.com/$repository/releases/download/$tag/$archiveName"
$checksumUrl = "$archiveUrl.sha256"

$running = @(Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -and $_.Path.StartsWith($install, [System.StringComparison]::OrdinalIgnoreCase) })
if ($running.Count -gt 0) {
  if (-not $Force) {
    throw "DSH-Go is running. Close it and run the update again, or run with -Force."
  }
  Write-Host 'stopping the running instance' -ForegroundColor Yellow
  foreach ($process in $running) { taskkill /PID $process.Id /T /F | Out-Null }
  Start-Sleep -Seconds 3
}

$temporary = Join-Path $env:TEMP ("dsh-go-update-" + [System.Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $temporary | Out-Null
$zip = Join-Path $temporary $archiveName
$sum = "$zip.sha256"

try {
  Write-Host "downloading $archiveName" -ForegroundColor Cyan
  Invoke-WebRequest -Uri $archiveUrl -OutFile $zip -UseBasicParsing
  Invoke-WebRequest -Uri $checksumUrl -OutFile $sum -UseBasicParsing

  $expected = ((Get-Content $sum -Raw) -split '\s+')[0].ToLowerInvariant()
  $actual = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($expected -ne $actual) { throw "checksum mismatch: expected $expected, got $actual" }
  Write-Host 'checksum verified' -ForegroundColor Green

  $unpacked = Join-Path $temporary 'unpacked'
  New-Item -ItemType Directory -Force -Path $unpacked | Out-Null
  $tar = Get-Command tar.exe -ErrorAction SilentlyContinue
  if ($tar) { & tar -xf $zip -C $unpacked } else { Expand-Archive -Path $zip -DestinationPath $unpacked -Force }

  # The archive holds one top-level `DSH-Go` folder; its contents are the program files.
  $payload = Get-ChildItem $unpacked -Directory | Select-Object -First 1
  if (-not $payload) { throw 'the archive did not contain the application folder' }
  if (-not (Test-Path (Join-Path $payload.FullName 'DeepSeek Harness.exe'))) {
    throw 'the archive does not look like a DSH-Go build'
  }

  Write-Host 'replacing program files (portable\ is preserved)' -ForegroundColor Cyan
  & robocopy $payload.FullName $install /E /XD (Join-Path $install 'portable') /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit code $LASTEXITCODE" }
}
finally {
  Remove-Item $temporary -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host "updated to $tag" -ForegroundColor Green
if (-not $Check) {
  Start-Process -FilePath (Join-Path $install 'DeepSeek Harness.exe')
}
