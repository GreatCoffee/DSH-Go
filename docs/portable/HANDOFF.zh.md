# DSH-Go 当前状态与操作手册

[English](HANDOFF.md) | 中文

> 本文件是给"下一个我"看的交接文档：项目现状、四条流程的准确命令、环境前提、已知坑、数据边界。项目性质：DeepSeek Harness 的非官方便携构建，除上游代码外的全部改动由 AI 模型 DeepSeek V4.1 Flash 生成，未经有资质的人审核，风险自持。

## 0. 铁律：等待与进度检查

任何单次等待、超时、阻塞调用都不得超过 180 秒；执行期间必须至少每 30 秒检查一次进度（读任务输出、看日志、或先报告中间结果再继续等）。确实需要更久的工作，拆成连续的批次完成，每批次同样不超过 180 秒。不允许用"一次长等待"换"少检查几次"：即使预计命令很快就会结束，超过 180 秒的等待也属于违规。这条规则对所有会话、所有代理、任何模型一律生效。

## 1. 现状基线

| 项目 | 值 |
|---|---|
| 上游 | `deepseek-ai/deepseek-harness`（MIT），当前基线提交 `4b399c39a6`（即 `dsh-v0.2.3-alpha.2`，同时是 `upstream/master`），产品版本 `0.2.3-alpha.2` |
| 本仓库 | `GreatCoffee/DSH-Go`（公开），`master` |
| 最近构建提交 | `81cdd50973`（便携版跳过厂商强制更新浮层；上一版 `bd921f539f` 把 fork 自带扩展适配到 0.2.3-alpha.2 的发布门禁） |
| 最近发布 | `https://github.com/GreatCoffee/DSH-Go/releases/tag/go-62d166c770` —— 该发布早于这次上游同步，之后尚未发布新版 |
| 安装目录 | `D:\Documents\Softwares\DSH-Go` |
| 活动工作区 | `D:\Documents\Softwares\DSH-Go\portable\workspace\DSH-Portable`（仓库在 `...\dsh-go`） |
| 已装插件 | `billion-context@0.1.216`、`dsh-connect-workbuddy@5.31.2`、`dsh-context@0.87.1`、`dsh-cost-meter@^1.9.57`、`dsh-gitbash-shell@0.55.1`、`dsh-ui-scale@^0.1.5`（均在 profile bundles 里启用；`dsh-ops` 已移除） |
| Actions | 已关闭（仓库公开后，继承来的 35 个工作流会自动启动且全部失败，邮件塞满收件箱，因此关掉了开关） |
| Dependabot | 已移除 `.github/dependabot.yml`，PR 与分支已清 |

## 2. 目录布局

```
D:\Documents\Softwares\DSH-Go\
├─ DeepSeek Harness.exe
├─ BUILD-INFO.txt
├─ Update-DSH-Go.cmd / .ps1
├─ update-last.log
├─ version
└─ portable\
   ├─ README.txt
   ├─ dsh-home\
   ├─ user-data\
   ├─ workspace\
   ├─ cache\
   ├─ config\
   ├─ state\
   ├─ logs\
   ├─ temp\
   └─ state.json
```

| 条目 | 说明 |
| --- | --- |
| 程序文件 | `DeepSeek Harness.exe` 加 `resources\`、`*.dll`、`locales\`：exe 246 MB，`resources\` 903 MB。 |
| `BUILD-INFO.txt` | `version` / `commit` / `built` 三行；`version` 行就是界面显示的版本号。 |
| `Update-DSH-Go.cmd` / `.ps1` | 更新器（双语、写日志、结束暂停）。 |
| `update-last.log` | 最近一次更新日志；只在跑过更新器之后才出现。 |
| `version` | Electron 版本号（`44.11.5`）。 |
| `portable\` | 唯一数据根：整目录可搬迁。本机约 13 GB。 |
| `portable\README.txt` | 给直接看目录的人看的说明：沙箱、XDG、单实例、日志。 |
| `dsh-home\` | `$DSH_HOME`：`sessions\`、`storages\`、`profiles\`（含插件）、`attachments\`、`.credentials.yaml`。 |
| `user-data\` | Electron profile：Local Storage、`desktop\settings.json`，以及 `logs\` 里的崩溃报告。 |
| `workspace\` | 工作区父目录，可以有多个工作区并排。 |
| `cache\` | pnpm store（3.3 GB）加 npm 缓存，兼作 `XDG_CACHE_HOME`。 |
| `config\` | `XDG_CONFIG_HOME`：按 XDG 规范定位的插件配置。 |
| `state\` | `XDG_STATE_HOME`：同一批插件的日志与运行状态。 |
| `logs\` | `host-<日期>.log`，保留最近 7 个。 |
| `temp\` | Electron 临时目录。 |
| `state.json` | `lastRoot` / `lastLaunch`，用来识别「搬家」。 |

## 3. 环境前提

| 工具 | 版本 | 说明 |
|---|---|---|
| Node.js | 构建机 24.21.0 | 上游 `engines.node` 是 `^24.22.3 \|\| >=26.13.1`，所以 pnpm 每次运行打一条 `[WARN] Unsupported engine`；不阻断构建 |
| Node.js（随包） | 24.22.3 | `resources\runtime\versions.json`；打包后的运行时来自 Electron，与构建机的 node 无关 |
| pnpm | 11.28.5 | `packageManager` 锁定；仓库内不用系统 pnpm（本机是 12.23.0） |
| PowerShell | 7.6.10 | 构建脚本要求 `pwsh` |
| VS 2022 BuildTools | 17.14.44 / MSVC 14.44.35207 | 打包预检要求 `VC.Tools.x86.x64`，已装 |
| Python | 3.12.14（打包内置） | 系统 Python 3.14 只用于辅助 |
| Git | 2.44.0.windows.1 | Git for Windows |
| tar | 用 `C:\Windows\System32\tar.exe`（bsdtar 3.5.2） | Git Bash 的 GNU tar 1.35 会把 `D:\...` 当成远程主机，报 `Cannot connect to D: resolve failed`；构建时把 `C:\Windows\System32` 放到 PATH 最前 |

## 4. 四条流程

### 4.1 构建

**必须放短路径**，否则内置 Python 的 `lxml` 会因超过 260 字符报 `DLL load failed while importing _elementpath: 文件名或扩展名太长`。下面三步是：用 `/MIR` 镜像源码到 `D:\b\dsh-go`（跳过 `node_modules` 等目录）、装依赖、把 `C:\Windows\System32` 放到 PATH 最前再构建（否则 Git Bash 的 GNU tar 解不开 `D:\...`）：

```powershell
# 1) copy the source to the short path — never follow node_modules
robocopy 'D:\Documents\Softwares\DSH-Go\portable\workspace\DSH-Portable\dsh-go' 'D:\b\dsh-go' /MIR /MT:16 /XJ /XD node_modules .desktop-build dist .pnpm-store

# 2) install dependencies (11.28.5 comes from packageManager)
cd D:\b\dsh-go
pnpm install --frozen-lockfile

# 3) build and assemble the portable directory
#    bsdtar must win over Git Bash's GNU tar, or unpacking D:\... fails
$env:PATH = "C:\Windows\System32;$env:PATH"
pwsh scripts/build-portable.ps1
# output: D:\b\dsh-go\dist\DSH-Go (1,083 MB)
```

构建先跑 10 个门禁（`run-gates: 10 passed, 0 failed, 0 skipped`，50 秒）再打包；整条链路在 24 核机器上约 9–12 分钟，依赖占 4–6 GB。**保留 `D:\b\dsh-go`**：有 `node_modules` 时下次构建复用 store，不必再下载几个 GB。`dist\DSH-Go` 约 1.1 GB；`.desktop-build` 约 3.4 GB，两次构建之间可以删掉。

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
pwsh scripts/sync-upstream.ps1 -DryRun   # how far behind, and which files overlap
git tag pre-sync-<date>                  # a cheap way back before merging
pwsh scripts/sync-upstream.ps1           # merge (or -Rebase)
# resolve conflicts, then regenerate what the build regenerates
pnpm install --frozen-lockfile
pnpm run gen-cordis-catalog
pnpm run gen-cordis-api
pnpm run gen-client-catalog
pnpm run gen-plugin-packages
pnpm run verify-translation-pairing --write <each edited pair>
git commit                               # then rebuild in the short-path copy
```

**冲突面不是固定的。** 这次同步到 0.2.3-alpha.2（上游 3124 个提交、8655 个文件变更）产生 **26 个冲突文件**，而脚本失败提示只点了三个。按解法分类：

| 类别 | 文件 | 解法 |
|---|---|---|
| 生成物 | `packages/extensions/cordis-client-runner/src/client/slot-catalog.ts`、`packages/extensions/tool-cordis/src/api-catalog.ts`、`packages/preset/agent-preset/skills/dsh-doc/references/packages.md`、`docs/subsystems/workspace.md` + `.zh.md` | 取上游，再重跑上面几个 `gen-*`；生成区带 `<!-- BEGIN GENERATED ... -->` 标记 |
| 锁文件 | `pnpm-lock.yaml` | 取上游，`pnpm install` 会重算 |
| 翻译侧车 | 每个改过的配对旁边的 `README.i18n.yaml`（`packages/client/ui-workspace`、`packages/core/session`、`packages/session/session-persistence`、`packages/session/session-persistence-jsonl`、`packages/workspace/workspace`） | 两侧取任一侧，再 `verify-translation-pairing --write` 重录 |
| fork 挂点 | `apps/cli/package.json`、`apps/desktop/src/main.ts`、`packages/util/official-bundles/src/bundles.ts`、`packages/api/remotes/src/client/index.ts`、`packages/client/ui-settings-account/src/client/AccountMenu.tsx`、`packages/workspace/workspace/src/index.ts`、`packages/session/session-persistence-jsonl/src/index.ts`、`packages/client/ui-workspace/README{.md,.zh.md}`、`packages/workspace/workspace/README{.md,.zh.md}`、`packages/session/session-persistence/README{.md,.zh.md}` | 保留上游的新行，把 fork 的少量新增叠回去 |
| 测试 | `packages/client/ui-settings-account/tests/apply.client.spec.ts` | 两侧合并 |

同步后还有两个 fork 自有 bundle 会撞上游发布门禁，两处修法都很小：

1. `packages/extensions/go-maintenance/package.json` —— `files` 必须列 `lib/typert.remote-client.d.ts.map`，否则 `generate-typert` 报 `typert(host): @deepseek-ai/dsh-go-maintenance package files must include lib/typert.remote-client.d.ts.map`。上游所有发布 typert 产物的包都列了这一项。
2. `packages/*/*/package.json` 与 `apps/*/package.json` 必须共享同一个版本（`scripts/release/families.ts` 的 `verifyVersions()` 会抛 `dsh release members must share one version`）；上游版本一动，这两个 fork bundle 要跟着改。

## 5. 已知坑（按踩坑顺序）

1. **长路径**：见 4.1，必须短路径构建。
2. **复制仓库不能跟 `node_modules`**：仓库里是 pnpm 符号链接布局，跟随复制会展开成 40 GB 以上（实测 43.75 GB / 378 万文件）。始终 `/XD node_modules` + `/XJ`。
3. **PowerShell 脚本必须 UTF-8 带 BOM**：5.1 会把无 BOM 的中文按 GBK 解码，导致引号配对错乱、解析失败、窗口闪退。
4. **批处理必须 CRLF**：`.cmd` 用 LF 会被 cmd.exe 跳过整段命令。仓库 `.gitattributes` 已有 `*.cmd text eol=crlf`，但要确认检出后仍是 CRLF。
5. **不要用 `$home` 当变量名**：它是 PowerShell 自动只读变量（= 用户目录）。见第 6 节事故。
6. **`gh` 会误判仓库**：仓库同时有 `upstream` 远程时，`gh release` 可能解析到官方仓库，必须显式 `--repo GreatCoffee/DSH-Go`。
7. **API 限流**：匿名调用 GitHub REST API 会被限流，更新器因此改为解析 `releases/latest` 重定向，不要改回去。
8. **会话空壳**：只有头部、没有事件的会话过去在 UI 里删不掉，需要在 `sessions\<projectKey>\session-*` 层删除并清 `storages\session_projcache`。现在多了会话菜单的「删除会话」（`@deepseek-ai/dsh-go-session-delete`），能列出但删不掉的空壳用它就行；只有连列表都刷不出来的残留才回退到手工删目录。
9. **发布期间 release 一直是 Draft**：`gh release create` 传 407 MB 资产要十几分钟，期间 `isDraft` 返回 `true`、`assets` 里只有已传完的 `.sha256`，传完才转正并标记 Latest。不要当成失败去重跑。
10. **`netstat -e` 计数在 4 GiB 回绕**：累计字节从 4,142,064,790 掉到 335,306,974 是计数器翻转，不是断网；判断上传是否在动只能看相邻采样增量。
11. **插件状态默认落在用户目录**：XDG 感知的插件（如 billion-context）会写 `~/.config`、`~/.cache`、`~/.local/state`。portable 已在 `applyPortableEnvironment` 里把 `XDG_CONFIG_HOME`/`XDG_CACHE_HOME`/`XDG_STATE_HOME` 指向 `portable\config|cache|state`；升级前留下的用户目录副本要手动搬走。
12. **应用运行时绝不替换程序文件。** `robocopy` 遇到被占用的 `resources\app.asar` 会中断，把它写成半截；此时安装目录的 `BUILD-INFO.txt` 还报旧提交、文件大小也一致，只有渲染进程会察觉——它崩在 `TypeError: Cannot read properties of undefined (reading 'showTotalWithPlan')`，界面显示「Desktop renderer exited: crashed」。唯一的修法是完整重装；只补一个文件不够，因为 `DeepSeek Harness.exe` 与 `BUILD-INFO.txt` 也是旧的。安装器必须既等待应用退出，又在校验复制后的哈希。
13. **`install-dsh-go.ps1` 必须按进程分类，不能只用 `tasklist` 匹配映像名。** 泄漏的 Chromium helper 在应用退出后仍让 `DeepSeek Harness.exe` 这个名字存活（实测：一个 `--type=utility` 子进程，父进程已死、`threads=1`、CPU 0 秒，仍占用 exe）。不带 `--type=` 也不带 `--mojo-platform-channel-handle` 的才是真应用（主进程 + `app.asar` 宿主）；只等这些，然后清理残留。不要用「父进程已消失」当孤儿判据——由 Explorer 启动的应用本来就会失去父进程。

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
| 插件兼容性实测 | 已完成（dsh-ops 0.4.4 因 `engines.dsh <0.2.2-0` 被拒，0.5.0 适配 0.2.2-rc.1，之后已卸载，如今 profile 里是六个第三方插件） |
| 插件状态目录随包移动 | 已完成（XDG 三变量，发布 `go-1869e914bd`） |
| 删除会话（自带 bundle `@deepseek-ai/dsh-go-session-delete`） | 已实现并本地通过测试；在插件管理器里作为「随安装包提供」的可选 bundle 可见、可关闭（内置 bundle 不支持卸载）；删除前先 `workspace/session-stop` 停掉在跑的任务、再 `workspace/session-close` 释放活会话，删后发 `session/deleted` 清投影缓存——刚聊过且仍在运行的会话无需重启即可删；已随 `go-62d166c770` 发布 |
| 维护页（自带 bundle `@deepseek-ai/dsh-go-maintenance`） | 已实现并本地通过测试：设置页「维护」分区按需扫描/清理三类残留（无工作区引用的投影检查点、无工作区引用的日志目录、无日志引用的图片附件），全部按需、不随启动扫描；存活按工作区判定（`sessionIds` + 归档 + 置顶），一个工作区都没引用时报空；删目录前查 `workspace/session-activity`；每次清理往宿主日志写一行 `[dsh-go-maintenance]` 审计记录（`ctx.logger` 不进 tee，故用 `console`）；依赖 `SessionPersistence.root` 与投影缓存服务新增的 `orphanIds`/`pruneOrphans`；已随 `go-62d166c770` 发布 |
| 隐藏官方发行入口 | 已完成并本地通过类型检查/测试：标题栏「应用 → 检查更新…」在便携版不显示（`main.ts` 的 `applicationItems`）、账号菜单「意见反馈」不注入（`ui-settings-account` 的 `contactUs` 变为可选，便携版不提供）、设置→通用「更新渠道」随 preload 不暴露 `updates` 通道而自动消失（`DshDesktopProductApi.updates` 改为可选）、版本号显示为「原版版本号（DSH-Go 源码提交）」（`readPortableBuild` 读 `BUILD-INFO.txt`，经 `--dsh-go-portable=` 传给 preload 的 `goPortable.build`）；已随 `go-62d166c770` 发布 |
| 便携版宿主日志 | 已完成：`portable\logs\host-<日期>.log` 镜像 stdout/stderr（去 ANSI），保留最近 7 个；`apps/desktop/src/portable.ts` 的 `installPortableLogging` |
| 升级后插件保留 | 已完成（真实发布包演练） |
| macOS 便携 | 挂起（需 Mac 构建） |
| Linux 便携 | 挂起（Desktop 非官方发布目标，可行路径是 CLI/Web 便携包） |
| 换默认 shell 为 bash | 已通过插件而非 bundle 完成：`dsh-gitbash-shell@0.55.1` 提供 `bash` 工具并隐藏 `pwsh`。它以 `windowsHide: true` 起 Git Bash；Windows 上采用 fail-closed——`read-only` / `workspace-write` 在执行前直接拒绝，除非在它的设置卡里关掉 `experimentalNative`（那样会退回明确标注 unconfined 的兼容 shell） |
| 构建辅助脚本的可移植性 | `scripts/{build,release,sync-upstream,update}-portable.ps1` 与 `D:\b\install-dsh-go.ps1` 都是 fork 独有、无上游测试的文件，是本仓库审核最少的部分 |
