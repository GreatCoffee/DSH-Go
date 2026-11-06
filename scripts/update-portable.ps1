#Requires -Version 5.1
<#
.SYNOPSIS
  Update this DSH-Go installation from its GitHub releases.
  从 GitHub Releases 更新本 DSH-Go 安装。
.DESCRIPTION
  Downloads the newest portable release, verifies its SHA-256, and replaces the
  program files while leaving `portable\` untouched. The application must be
  closed; this script refuses to overwrite files an open instance holds.
  下载最新的便携版发布包，校验 SHA-256，仅替换程序文件，`portable\` 保持不变。
  更新前必须完全退出 DSH-Go。
.PARAMETER Force
  Stop a running DSH-Go instance instead of refusing to update.
  若 DSH-Go 正在运行，先结束它再更新。
.PARAMETER Check
  Only report whether a newer release exists.
  仅检查是否存在新版本。
.PARAMETER NoPause
  Do not wait for a key before exiting (for scripts and automation).
  结束时不停留等待按键（供脚本/自动化使用）。
#>
[CmdletBinding()]
param(
  [switch]$Force,
  [switch]$Check,
  [switch]$NoPause
)

$ErrorActionPreference = 'Stop'
$install = $PSScriptRoot
$repository = 'GreatCoffee/DSH-Go'

function Write-Line([string]$zh, [string]$en, [string]$color = 'Gray') {
  Write-Host $zh -ForegroundColor $color
  Write-Host "   $en" -ForegroundColor DarkGray
}

function Finish([int]$code = 0) {
  Write-Host ''
  if (-not $NoPause -and $Host.Name -eq 'ConsoleHost') {
    Write-Host '按回车键退出 / Press Enter to exit' -ForegroundColor DarkGray
    try { [void](Read-Host) } catch { /* no console: nothing to wait for */ }
  }
  exit $code
}

try {
  Write-Host ''
  Write-Line "DSH-Go 更新器" "DSH-Go updater" 'Cyan'
  Write-Host '----------------------------------------' -ForegroundColor DarkGray

  if (-not (Test-Path (Join-Path $install 'DeepSeek Harness.exe'))) {
    Write-Line "当前目录不是 DSH-Go 安装目录：$install" "This folder is not a DSH-Go installation: $install" 'Red'
    Finish 1
  }

  $localCommit = ''
  $infoFile = Join-Path $install 'BUILD-INFO.txt'
  if (Test-Path $infoFile) {
    $line = Get-Content $infoFile | Where-Object { $_ -like 'commit:*' } | Select-Object -First 1
    if ($line) { $localCommit = ($line -replace '^commit:\s*', '').Trim() }
  }
  Write-Line "当前版本提交：$localCommit" "Installed commit: $localCommit"

  # Resolve the newest tag by following `releases/latest` to its tag page. The REST
  # API is rate limited per anonymous IP, and Windows PowerShell 5.1 and 7 expose the
  # redirect target through different properties, so read whichever exists.
  try {
    $response = Invoke-WebRequest -Uri "https://github.com/$repository/releases/latest" -UseBasicParsing -ErrorAction Stop
  } catch {
    Write-Line "无法访问 GitHub Releases：$($_.Exception.Message)" "Cannot reach GitHub releases: $($_.Exception.Message)" 'Red'
    Finish 1
  }
  $final = $null
  if ($response.BaseResponse.RequestMessage) {
    $final = $response.BaseResponse.RequestMessage.RequestUri.AbsoluteUri
  } elseif ($response.BaseResponse.ResponseUri) {
    $final = $response.BaseResponse.ResponseUri.AbsoluteUri
  }
  $tag = $null
  if ($final -and $final -match '/releases/tag/([^/?#]+)') { $tag = $Matches[1] }
  if (-not $tag -or -not $tag.StartsWith('go-')) {
    Write-Line "该项目尚未发布任何版本。" "No release has been published for this repository yet." 'Yellow'
    Finish 0
  }
  Write-Line "最新发布版本：$tag" "Latest release: $tag"

  if ($tag -eq "go-$localCommit") {
    Write-Line "已是最新版本，无需更新。" "This installation is already the newest release." 'Green'
    Finish 0
  }
  if ($Check) {
    Write-Line "有新版本可用：$tag" "An update is available: $tag" 'Yellow'
    Finish 0
  }

  $releaseCommit = $tag -replace '^go-', ''
  $archiveName = "DSH-Go-$releaseCommit-win-x64-portable.zip"
  $archiveUrl = "https://github.com/$repository/releases/download/$tag/$archiveName"
  $checksumUrl = "$archiveUrl.sha256"

  $running = @(Get-Process -Name 'DeepSeek Harness' -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -and $_.Path.StartsWith($install, [System.StringComparison]::OrdinalIgnoreCase) })
  if ($running.Count -gt 0) {
    if (-not $Force) {
      Write-Line "DSH-Go 正在运行，请先完全退出后重试（或加 -Force）。" "DSH-Go is running. Close it and retry, or run with -Force." 'Red'
      Finish 1
    }
    Write-Line "正在结束运行中的实例…" "Stopping the running instance..." 'Yellow'
    foreach ($process in $running) { taskkill /PID $process.Id /T /F | Out-Null }
    Start-Sleep -Seconds 3
  }

  $temporary = Join-Path ([System.IO.Path]::GetTempPath()) ("dsh-go-update-" + [System.Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force -Path $temporary | Out-Null
  $zip = Join-Path $temporary $archiveName
  $sum = "$zip.sha256"

  try {
    Write-Line "正在下载 $archiveName（约 388 MB）" "Downloading $archiveName (about 388 MB)..." 'Cyan'
    Invoke-WebRequest -Uri $archiveUrl -OutFile $zip -UseBasicParsing
    Invoke-WebRequest -Uri $checksumUrl -OutFile $sum -UseBasicParsing

    $expected = ((Get-Content $sum -Raw) -split '\s+')[0].ToLowerInvariant()
    $actual = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($expected -ne $actual) {
      Write-Line "校验失败：期望 $expected，实际 $actual" "Checksum mismatch: expected $expected, got $actual" 'Red'
      Finish 1
    }
    Write-Line "SHA-256 校验通过" "Checksum verified" 'Green'

    $unpacked = Join-Path $temporary 'unpacked'
    New-Item -ItemType Directory -Force -Path $unpacked | Out-Null
    $tar = Get-Command tar.exe -ErrorAction SilentlyContinue
    if ($tar) { & tar -xf $zip -C $unpacked } else { Expand-Archive -Path $zip -DestinationPath $unpacked -Force }

    $payload = Get-ChildItem $unpacked -Directory | Select-Object -First 1
    if (-not $payload) {
      Write-Line "压缩包结构异常，已中止。" "The archive did not contain the application folder." 'Red'
      Finish 1
    }
    if (-not (Test-Path (Join-Path $payload.FullName 'DeepSeek Harness.exe'))) {
      Write-Line "压缩包不像是 DSH-Go 构建产物，已中止。" "The archive does not look like a DSH-Go build." 'Red'
      Finish 1
    }

    Write-Line "正在替换程序文件（portable\ 保持不变）…" "Replacing program files (portable\ is preserved)..." 'Cyan'
    & robocopy $payload.FullName $install /E /XD (Join-Path $install 'portable') /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) {
      Write-Line "复制失败（robocopy 退出码 $LASTEXITCODE）。" "Copy failed (robocopy exit code $LASTEXITCODE)." 'Red'
      Finish 1
    }
  }
  finally {
    Remove-Item $temporary -Recurse -Force -ErrorAction SilentlyContinue
  }

  Write-Line "更新完成：$tag" "Updated to $tag" 'Green'
  Write-Line "正在启动 DSH-Go…" "Starting DSH-Go..." 'Gray'
  Start-Process -FilePath (Join-Path $install 'DeepSeek Harness.exe')
  Finish 0
}
catch {
  Write-Host ''
  Write-Line "更新失败：$($_.Exception.Message)" "Update failed: $($_.Exception.Message)" 'Red'
  Finish 1
}
