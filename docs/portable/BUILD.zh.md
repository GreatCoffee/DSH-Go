# 构建 DSH-Go（Windows x64 便携版）

本文是一份从零开始的构建指南：在一台干净的 Windows x64 机器上装好工具链，产出 `dist/DSH-Go`。

## 0. 前置条件

| 项目 | 要求 | 验证方式 |
|---|---|---|
| 操作系统 | Windows 10 1809+ / Windows 11，x64 | `[Environment]::Is64BitOperatingSystem` |
| Node.js | ≥ 24.9（实测 24.21.0） | `node -v` |
| pnpm | 仓库锁定 11.28.5，用 corepack 激活 | `pnpm -v` |
| Git | 任意较新版本 | `git --version` |
| PowerShell | **7.x**（构建脚本与打包链路都要求 `pwsh`） | `pwsh -v` |
| Python | 3.12+（Office 转换运行时打包用） | `python --version` |
| Visual C++ 生成工具 | VS 2022 BuildTools 的 `VCTools` 工作负载（含 Windows SDK） | `vswhere -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64` |
| 磁盘 | ≥ 12 GB 可用（依赖 + 构建产物 + 运行时） | — |
| 网络 | `registry.npmjs.org`、`nodejs.org`、GitHub Releases（Electron 与 Node 运行时） | — |

`tar` 用系统自带的 `C:\Windows\System32\tar.exe` 即可。

## 1. 安装工具链（管理员）

```powershell
# PowerShell 7
winget install --id Microsoft.PowerShell --exact --accept-package-agreements --accept-source-agreements

# Visual Studio 2022 生成工具 + C++ 工作负载（约 4–6 GB）
winget install --id Microsoft.VisualStudio.2022.BuildTools --exact `
  --accept-package-agreements --accept-source-agreements `
  --override "--quiet --wait --norestart --nocache --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

打包脚本会先用 `vswhere` 探测 `VC.Tools.x86.x64`；探测不到会直接终止，不会等到编译中途才失败。

激活 pnpm：

```powershell
corepack enable
corepack prepare pnpm@11.28.5 --activate
```

## 2. 获取源码并安装依赖

```powershell
git clone https://github.com/<你的账号>/DSH-Go.git
cd DSH-Go
pnpm install --frozen-lockfile
```

首次安装约 1–3 分钟（依赖商店命中缓存会更快），占用 4–6 GB。

## 3. 配置 Windows 打包参数

无签名目录构建仍要求被测应用的应用 ID 与强制更新策略来源：

```powershell
Copy-Item apps/desktop/.env.windows.example apps/desktop/.env.windows
```

`apps/desktop/.env.windows` 至少包含：

```dotenv
DSH_DESKTOP_APP_ID=com.deepseek.dsh
DSH_DESKTOP_AUTO_UPDATE_ENV=production
DSH_DESKTOP_MANDATORY_UPDATE_PROD_ORIGIN=https://harness.deepseek.com
```

该文件已被 `.gitignore` 忽略，不要提交。便携构建在运行时不会读取其中的更新服务，它只用于让打包校验通过。

## 4. 构建

```powershell
pwsh scripts/build-portable.ps1          # 产出 dist\DSH-Go
pwsh scripts/build-portable.ps1 -Zip     # 另外产出 dist\DSH-Go-<版本>-win-x64-portable.zip
pwsh scripts/build-portable.ps1 -SkipBuild   # 只重新组装，复用已有 win-unpacked
```

脚本内部执行两条命令：

1. `pnpm --dir apps/desktop exec tsx scripts/package-target.ts win-x64 --dir --unsigned` —— 官方打包链路，产出 `apps/desktop/.desktop-build/targets/win-x64/unsigned-artifacts/win-unpacked`；
2. 把该目录复制成 `dist/DSH-Go`，再补出 `portable\` 骨架与 `BUILD-INFO.txt`。

整条链路在 24 核机器上约 9–12 分钟；其中包含一次不需要联网模型的自检（DOCX/XLSX/PPTX 转 PDF、CLI 插件装卸）。

## 5. 产物

```
dist\DSH-Go\
├─ DeepSeek Harness.exe
├─ resources\
├─ BUILD-INFO.txt          版本、提交号、构建时间
└─ portable\               空骨架：dsh-home、user-data、workspace、cache、temp
```

首次启动会在 `portable\` 下生成 `state.json` 与真实数据。发布时把整个 `DSH-Go` 目录打进 zip 即可，不要在包里携带任何 `portable\` 内容。

## 6. 常见问题

**打包报 `desktop package: the build host cannot run this packaging sequence: vswhere …`**
没装 C++ 生成工具，或装了但没有 `VC.Tools.x86.x64`。重跑第 1 步的 winget 命令。

**`pnpm install` 报 `ERR_PNPM_IGNORED_BUILDS`**
仓库用 `allowBuilds` 白名单控制原生依赖的安装脚本。按提示把缺少的包名加进 `pnpm-workspace.yaml` 或 `apps/desktop/package.json` 的 `pnpm.onlyBuiltDependencies` 前，先确认它确实需要本地编译。

**构建很慢或磁盘暴涨**
`.desktop-build/` 保存每个 target 的下载缓存与准备产物，可整体删除后重来；`DSH_DESKTOP_PACKAGE_CACHE_DIR` 可以把缓存挪到别的盘。

**杀毒软件拦截**
产物是未签名的 Electron 应用，首次运行可能被 SmartScreen 提示。开发者可在本地用自签名证书签名，发布版本则建议购买代码签名证书。

**路径过长**
仓库路径深时，打包会在"运行时自检"阶段失败，报 `ImportError: DLL load failed while importing _elementpath: 文件名或扩展名太长`。原因是内置 Python 的 `lxml` 扩展位于 `resources\runtime\...\python\Lib\site-packages\` 下，完整路径已逼近 260 字符上限；即使系统已开启长路径支持，这条加载路径仍会超限。
实测：工作区在 `D:\Documents\Softwares\DSH-Go\portable\workspace\DSH-Portable\dsh-go` 时失败，换到 `D:\b\dsh-go` 后一次通过。
规避办法是复制到短路径构建：

```powershell
robocopy <repo> D:\b\dsh-go /E /MT:16 /XJ /XD node_modules .desktop-build dist .pnpm-store
cd D:\b\dsh-go
pnpm install --frozen-lockfile
pwsh scripts/build-portable.ps1
# 产物在 D:\b\dsh-go\dist\DSH-Go
```

不要整目录复制 `node_modules`：仓库里是 pnpm 的符号链接布局，跟随复制会展开成几十 GB。上面用 `/XD node_modules` 排除，再在目标里重装。

## 7. 只跑测试与类型检查

```powershell
pnpm exec vitest run apps/desktop/tests/portable.spec.ts apps/desktop/tests/portable-rebase.spec.ts
pnpm exec tsc -b apps/desktop/tsconfig.host.json packages/api/workspace-controller/tsconfig.host.json
```
