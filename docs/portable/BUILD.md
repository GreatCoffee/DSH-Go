# Building DSH-Go (Windows x64 portable)

English | [中文](BUILD.zh.md)

This document is a from-scratch build guide: install the toolchain on a clean Windows x64 machine and produce `dist/DSH-Go`.

## 0. Prerequisites

| Item | Requirement | Verification |
|---|---|---|
| Operating system | Windows 10 1809+ / Windows 11, x64 | `[Environment]::Is64BitOperatingSystem` |
| Node.js | ≥ 24.9 (measured 24.21.0) | `node -v` |
| pnpm | repository pins 11.28.5, activated with corepack | `pnpm -v` |
| Git | any recent version | `git --version` |
| PowerShell | **7.x** (both the build script and the packaging chain require `pwsh`) | `pwsh -v` |
| Python | 3.12+ (used to bundle the Office conversion runtime) | `python --version` |
| Visual C++ Build Tools | the `VCTools` workload of VS 2022 BuildTools (including the Windows SDK) | `vswhere -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64` |
| Disk | ≥ 12 GB free (dependencies + build artifacts + runtime) | — |
| Network | `registry.npmjs.org`, `nodejs.org`, GitHub Releases (Electron and Node runtimes) | — |

`tar` can be the system's own `C:\Windows\System32\tar.exe`.

## 1. Install the toolchain (administrator)

```powershell
# PowerShell 7
winget install --id Microsoft.PowerShell --exact --accept-package-agreements --accept-source-agreements

# Visual Studio 2022 生成工具 + C++ 工作负载（约 4–6 GB）
winget install --id Microsoft.VisualStudio.2022.BuildTools --exact `
  --accept-package-agreements --accept-source-agreements `
  --override "--quiet --wait --norestart --nocache --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

The packaging script first probes `VC.Tools.x86.x64` with `vswhere`; if the probe finds nothing it aborts immediately instead of failing midway through compilation.

Activate pnpm:

```powershell
corepack enable
corepack prepare pnpm@11.28.5 --activate
```

## 2. Fetch the source and install dependencies

```powershell
git clone https://github.com/<你的账号>/DSH-Go.git
cd DSH-Go
pnpm install --frozen-lockfile
```

The first install takes about 1–3 minutes (faster when the dependency store hits its cache) and occupies 4–6 GB.

## 3. Configure the Windows packaging parameters

An unsigned directory build still requires the tested application's app ID and the source of the mandatory update policy:

```powershell
Copy-Item apps/desktop/.env.windows.example apps/desktop/.env.windows
```

`apps/desktop/.env.windows` contains at least:

```dotenv
DSH_DESKTOP_APP_ID=com.deepseek.dsh
DSH_DESKTOP_AUTO_UPDATE_ENV=production
DSH_DESKTOP_MANDATORY_UPDATE_PROD_ORIGIN=https://harness.deepseek.com
```

The file is ignored by `.gitignore`; do not commit it. The portable build does not read its update service at runtime; it exists only to let the packaging validation pass.

## 4. Build

```powershell
pwsh scripts/build-portable.ps1          # 产出 dist\DSH-Go
pwsh scripts/build-portable.ps1 -Zip     # 另外产出 dist\DSH-Go-<版本>-win-x64-portable.zip
pwsh scripts/build-portable.ps1 -SkipBuild   # 只重新组装，复用已有 win-unpacked
```

The script runs two commands internally:

1. `pnpm --dir apps/desktop exec tsx scripts/package-target.ts win-x64 --dir --unsigned` — the official packaging chain, producing `apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/win-unpacked`;
2. copy that directory to `dist/DSH-Go`, then add the `portable\` skeleton and `BUILD-INFO.txt`.

The whole chain takes about 9–12 minutes on a 24-core machine; it includes a self-check that needs no network model (DOCX/XLSX/PPTX to PDF, CLI plugin install and uninstall).

## 5. Artifacts

```
dist\DSH-Go\
├─ DeepSeek Harness.exe
├─ resources\
├─ BUILD-INFO.txt          版本、提交号、构建时间
└─ portable\               空骨架：dsh-home、user-data、workspace、cache、temp
```

The first launch generates `state.json` and the real data under `portable\`. To publish, zip the whole `DSH-Go` directory; never carry any `portable\` content in the package.

## 6. FAQ

**Packaging reports `desktop package: the build host cannot run this packaging sequence: vswhere …`** The C++ Build Tools are not installed, or installed without `VC.Tools.x86.x64`. Rerun the winget command from step 1.

**`pnpm install` reports `ERR_PNPM_IGNORED_BUILDS`** The repository gates native dependency install scripts with an `allowBuilds` allowlist. Before adding the missing package name to `pnpm-workspace.yaml` or to `pnpm.onlyBuiltDependencies` in `apps/desktop/package.json` as the message suggests, first confirm that it really needs a local build.

**The build is very slow or the disk balloons** `.desktop-build/` keeps each target's download cache and prepared artifacts and can be deleted wholesale to start over; `DSH_DESKTOP_PACKAGE_CACHE_DIR` can move the cache to another disk.

**Antivirus blocks it** The artifact is an unsigned Electron app, so SmartScreen may prompt on the first run. Developers can sign locally with a self-signed certificate; for released versions, buying a code-signing certificate is recommended.

**Path too long** When the repository path is deep, packaging fails in the "runtime self-check" stage with `ImportError: DLL load failed while importing _elementpath: 文件名或扩展名太长`. The cause is that the built-in Python's `lxml` extension lives under `resources\runtime\...\python\Lib\site-packages\`, where the full path is already close to the 260-character limit; even with long-path support enabled on the system, this load path still exceeds it. Measured: it fails with the workspace at `D:\Documents\Softwares\DSH-Go\portable\workspace\DSH-Portable\dsh-go`, and passes in one run after moving to `D:\b\dsh-go`. The workaround is to copy to a short path and build there:

```powershell
robocopy <repo> D:\b\dsh-go /E /MT:16 /XJ /XD node_modules .desktop-build dist .pnpm-store
cd D:\b\dsh-go
pnpm install --frozen-lockfile
pwsh scripts/build-portable.ps1
# 产物在 D:\b\dsh-go\dist\DSH-Go
```

Do not copy `node_modules` along with the directory: the repository uses pnpm's symlink layout, and copying with follow expands into tens of GB. The command above excludes it with `/XD node_modules`; reinstall it in the target instead.

## 7. Running only tests and type checks

```powershell
pnpm exec vitest run apps/desktop/tests/portable.spec.ts apps/desktop/tests/portable-rebase.spec.ts
pnpm exec tsc -b apps/desktop/tsconfig.host.json packages/api/workspace-controller/tsconfig.host.json
```
