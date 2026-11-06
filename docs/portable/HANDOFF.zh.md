# DSH-Go 当前状态与操作手册

> 本文件是给"下一个我"看的交接文档：项目现状、四条流程的准确命令、环境前提、已知坑、数据边界。
> 项目性质：DeepSeek Harness 的非官方便携构建，除上游代码外的全部改动由 AI 模型 DeepSeek V4.1 Flash 生成，未经有资质的人审核，风险自持。

## 1. 现状基线

| 项目 | 值 |
|---|---|
| 上游 | `deepseek-ai/deepseek-harness`（MIT），当前基线提交 `fcc0ad46`，产品版本 `0.2.2-rc.1` |
| 本仓库 | `GreatCoffee/DSH-Go`（公开），`master` |
| 最近构建提交 | `031e0b7fd4`（含双语更新器 + 日志） |
| 最近发布 | `https://github.com/GreatCoffee/DSH-Go/releases/tag/go-031e0b7fd4` |
| 安装目录 | `D:\Documents\Softwares\DSH-Go` |
| 活动工作区 | `D:\Documents\Softwares\DSH-Go\portable\workspace\DSH-Portable`（仓库在 `...\dsh-go`） |
| 已装插件 | `dsh-cost-meter@1.9.57`（profile bundles 里已启用） |
| Actions | 已关闭（仓库公开后上游 20 个工作流会自动跑，全是失败邮件，已停用） |
| Dependabot | 已移除 `.github/dependabot.yml`，PR 与分支已清 |

## 2. 目录布局

```
D:\Documents\Softwares\DSH-Go\
├─ DeepSeek Harness.exe / resources\ / *.dll      程序（约 1.1 GB）
├─ BUILD-INFO.txt                                  版本 = 提交号 = 构建时间
├─ Update-DSH-Go.cmd / .ps1                        更新器（双语、写日志、结束暂停）
├─ update-last.log                                 最近一次更新日志
├─ migrate-workspace.cmd / .mjs                    一次性迁移脚本（已完成使命，可删）
└─ portable\                                       唯一数据根（整目录可搬迁）
   ├─ dsh-home\        会话、storages、profiles（含插件）、.credentials.yaml
   ├─ user-data\       Electron profile
   ├─ workspace\DSH-Portable\   活动工作区（git 仓库 + node_modules）
   ├─ cache\           pnpm store（插件与依赖包体都在这）
   └─ temp\
```

## 3. 环境前提

| 工具 | 版本 | 说明 |
|---|---|---|
| Node.js | 24.21.0 | 仓库要求 ≥ 24.9 |
| pnpm | 11.28.5 | 用 `corepack prepare pnpm@11.28.5 --activate` |
| PowerShell | 7.6.9 | 构建脚本要求 `pwsh` |
| VS 2022 BuildTools | 17.14.44 / MSVC 14.44 | 打包预检要求 `VC.Tools.x86.x64`，已装 |
| Python | 3.12（打包内置） | 系统 Python 3.14 只用于辅助 |
| Git / tar | 系统自带 | — |

## 4. 四条流程

### 4.1 构建

**必须放短路径**，否则内置 Python 的 `lxml` 会因超过 260 字符报 `DLL load failed while importing _elementpath: 文件名或扩展名太长`。

```powershell
# 1) 复制源码到短路径（不要复制 node_modules）
robocopy 'D:\Documents\Softwares\DSH-Go\portable\workspace\DSH-Portable\dsh-go' 'D:\b\dsh-go' /E /MT:16 /XJ /XD node_modules .desktop-build dist .pnpm-store

# 2) 装依赖
cd D:\b\dsh-go
pnpm install --frozen-lockfile

# 3) 构建并组装便携目录
pwsh scripts/build-portable.ps1
# 产物：D:\b\dsh-go\dist\DSH-Go（约 1,081 MB）
```

耗时约 5 分钟。构建完成后再删除 `D:\b`。

### 4.2 发布

```powershell
cd D:\b\dsh-go
pwsh scripts/release-portable.ps1 -SkipBuild
```

- tag 规则：`go-<构建提交号>`（提交号取自 `dist\DSH-Go\BUILD-INFO.txt`）
- 资产：`DSH-Go-<commit>-win-x64-portable.zip` + `.sha256`
- 上传约 2 分钟；发布后到 release 页面确认资产为 `uploaded`、非草稿

### 4.3 更新（用户视角）

```powershell
# 完全退出 DSH-Go 后：
D:\Documents\Softwares\DSH-Go\Update-DSH-Go.cmd
```

- 逻辑：读 `BUILD-INFO` 提交号 → 解析 `releases/latest` 重定向 → 下载 → 校验 SHA-256 → 用 robocopy 替换程序文件（`/XD portable`）→ 重启
- 日志：`update-last.log`
- 拒绝在应用运行时更新；`-Force` 可强停；`-Check` 只检查；`-NoPause` 不停留

### 4.4 跟进上游

```powershell
pwsh scripts/sync-upstream.ps1 -DryRun   # 看落后多少
pwsh scripts/sync-upstream.ps1           # 合并（或 -Rebase）
pnpm install --frozen-lockfile
pnpm exec tsc -b apps/desktop/tsconfig.host.json packages/api/workspace-controller/tsconfig.host.json
pwsh scripts/build-portable.ps1          # 在短路径副本里
```

冲突面固定在四处：`apps/desktop/src/main.ts`（挂点）、`apps/desktop/package.json`（一个 devDependency）、`packages/api/workspace-controller/src/default-directory.ts`（环境变量）、`.github/dependabot.yml`（本仓库删除，上游保留）。

## 5. 已知坑（按踩坑顺序）

1. **长路径**：见 4.1，必须短路径构建。
2. **复制仓库不能跟 `node_modules`**：仓库里是 pnpm 符号链接布局，跟随复制会展开成 40 GB 以上（实测 43.75 GB / 378 万文件）。始终 `/XD node_modules` + `/XJ`。
3. **PowerShell 脚本必须 UTF-8 带 BOM**：5.1 会把无 BOM 的中文按 GBK 解码，导致引号配对错乱、解析失败、窗口闪退。
4. **批处理必须 CRLF**：`.cmd` 用 LF 会被 cmd.exe 跳过整段命令。仓库 `.gitattributes` 已有 `*.cmd text eol=crlf`，但要确认检出后仍是 CRLF。
5. **不要用 `$home` 当变量名**：它是 PowerShell 自动只读变量（= 用户目录）。见第 6 节事故。
6. **`gh` 会误判仓库**：仓库同时有 `upstream` 远程时，`gh release` 可能解析到官方仓库，必须显式 `--repo GreatCoffee/DSH-Go`。
7. **API 限流**：匿名调用 GitHub REST API 会被限流，更新器因此改为解析 `releases/latest` 重定向，不要改回去。
8. **会话空壳**：只有头部、没有事件的会话在 UI 里删不掉，需要在 `sessions\<projectKey>\session-*` 层删除并清 `storages\session_projcache`。

## 6. 数据边界与事故

**个人数据位置**（不在 portable 里，不要打包）：

- 桌面 `D:\Desktop`、文档 `D:\Documents`、下载 `D:\Downloads`（C 盘用户目录里是重定向后的空壳）
- 凭据 `portable\dsh-home\.credentials.yaml`（明文，随包移动，发版前必须确认不存在）

**发版前检查清单**：`dist\DSH-Go\portable` 只有空目录骨架；`BUILD-INFO.txt` 无个人信息；文本文件扫描 `GreatCoffee`、`C:\Users`、`Documents\Softwares` 无命中。

**2026-11-06 事故**：在临时目录清理时误用 `$home` 变量，对 `C:\Users\GreatCoffee` 执行了递归删除，配置目录部分被删。靠 06:03 的系统卷影副本恢复：26 个顶层项、55 个 AppData 子目录、10,090 个缺失文件全部补回，未覆盖任何较新文件。

**由此固化的三条规则**：破坏性命令前先打印并断言绝对路径落在预期前缀内；脚本开头 `$ErrorActionPreference='Stop'`；删除优先移入 `.trash-<时间戳>` 再清。

## 7. 待办

| 事项 | 状态 |
|---|---|
| 插件兼容性实测 | 已完成 |
| 升级后插件保留 | 已完成（真实发布包演练） |
| macOS 便携 | 挂起（需 Mac 构建） |
| Linux 便携 | 挂起（Desktop 非官方发布目标，可行路径是 CLI/Web 便携包） |
| 换默认 shell 为 bash | 用户后续计划，切换点在 `packages/bundle/base/cordis.patch.yml` 的 `*-pwsh` / `*-bash` 行 |
