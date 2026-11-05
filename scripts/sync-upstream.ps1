#Requires -Version 7
<#
.SYNOPSIS
  Merge the latest DeepSeek Harness upstream code into DSH-Go.
.DESCRIPTION
  Fetches the official repository and merges its default branch. The portable
  layer touches only new files plus small hooks in `apps/desktop/src/main.ts`,
  `apps/desktop/package.json`, and the workspace-controller default directory,
  so conflicts stay rare and local.
.PARAMETER Rebase
  Rebase the local commits on top of upstream instead of merging.
.PARAMETER DryRun
  Only report how far behind upstream is.
#>
[CmdletBinding()]
param(
  [switch]$Rebase,
  [switch]$DryRun,
  [string]$Branch = 'master'
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$upstreamUrl = 'https://github.com/deepseek-ai/deepseek-harness.git'

if (-not (& git -C $repoRoot remote get-url upstream 2>$null)) {
  Write-Host "adding upstream remote: $upstreamUrl" -ForegroundColor Cyan
  & git -C $repoRoot remote add upstream $upstreamUrl
}

& git -C $repoRoot fetch upstream --tags --prune
if ($LASTEXITCODE -ne 0) { throw "git fetch failed with exit code $LASTEXITCODE" }

$behind = [int](& git -C $repoRoot rev-list --count "HEAD..upstream/$Branch")
if ($behind -eq 0) {
  Write-Host 'DSH-Go already contains every upstream commit.' -ForegroundColor Green
  exit 0
}

Write-Host "$behind upstream commit(s) to integrate:" -ForegroundColor Cyan
& git -C $repoRoot log --oneline --no-decorate "HEAD..upstream/$Branch" | Select-Object -First 40

if ($DryRun) {
  Write-Host 'dry run: no merge performed.' -ForegroundColor Yellow
  exit 0
}

if ($Rebase) {
  & git -C $repoRoot rebase "upstream/$Branch"
} else {
  & git -C $repoRoot merge --no-edit "upstream/$Branch"
}

if ($LASTEXITCODE -ne 0) {
  Write-Host @'
Merge stopped on conflicts. Expected conflict points:
  apps/desktop/src/main.ts                portable bootstrap and the policy guard
  apps/desktop/package.json               the session-persistence devDependency
  packages/api/workspace-controller/src/default-directory.ts   DSH_DOCUMENTS_DIRECTORY
Resolve them, then continue with `git merge --continue` (or `git rebase --continue`).
Everything under apps/desktop/src/portable*.ts and docs/portable/ is additive and should merge cleanly.
'@ -ForegroundColor Yellow
  exit 1
}

Write-Host 'upstream merged. Rebuild with: pwsh scripts/build-portable.ps1' -ForegroundColor Green
