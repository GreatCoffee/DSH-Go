# DSH-Go 便携版

[English](README.md) | 中文

DSH-Go 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（MIT）的 Windows 便携构建：所有运行期文件都保存在可执行程序旁边的 `portable\` 目录里，整个目录可以搬到任意路径（包括网络驱动器），双击可执行程序即可恢复上次关闭时的状态。

本项目不是 DeepSeek 官方发行版，也未获得官方背书。维护者不具备代码能力，除上游原项目之外的全部改动由 AI 模型 DeepSeek V4.1 Flash 生成、未经任何有资质的工程师审核；请先看 diff、备份 `portable\`，风险自担。

## 目录结构

```
DSH-Go\
├─ DeepSeek Harness.exe     启动入口，内置便携引导
├─ resources\ ...           Electron、asar、自带 Node/pnpm 运行时
└─ portable\                唯一的数据根
   ├─ dsh-home\             $DSH_HOME：sessions\ storages\ profiles\ attachments\ .credentials.yaml
   ├─ user-data\            Electron profile：Local Storage、desktop\settings.json、logs\
   ├─ workspace\            默认工作区父目录（实际工作区为 workspace\deepseek-harness\default-workspace）
   ├─ cache\                npm / pnpm 缓存、Chromium 缓存，兼作 XDG_CACHE_HOME
   ├─ config\               XDG_CONFIG_HOME：遵守 XDG 规范的工具与插件的配置
   ├─ state\                XDG_STATE_HOME：同上，日志与运行状态
   ├─ logs\                 宿主控制台日志 host-<日期>.log，保留最近 7 天
   ├─ temp\                 Electron 临时目录
   └─ state.json            上次启动所在的目录，用于识别"搬家"
```

程序文件与数据完全分离：升级时只替换程序文件，`portable\` 原样保留。

`logs\` 是排查问题的第一现场：便携版没有可回滚的终端，删除被拒绝、缓存清理失败、搬家改写失败这类警告只会写进这里，按天分文件，启动时清理 7 天以前的记录。

插件不必为便携版改写：启动时把 `XDG_CONFIG_HOME`、`XDG_CACHE_HOME`、`XDG_STATE_HOME` 指向 `config\`、`cache\`、`state\`，按 XDG 规范定位文件的插件与工具（billion-context 即是一例）会把配置、缓存和日志留在 `portable\` 内，搬走后一起跟着走。

## 搬家时发生什么

启动时比较 `state.json` 里的 `lastRoot` 与当前可执行程序目录。

| 差异 | 处理 |
|---|---|
| 目录没变 | 什么都不做 |
| 目录变了 | 重写所有保存过的绝对路径：`storages\workspace.json`、会话日志（zstd 逐帧解压 → 替换 → 重压，校验和重新计算）、`profiles` 下的 YAML/JSON，并把会话的 project 目录改成新路径派生出的名字 |
| 派生缓存 | 删除 `storages\session_projcache`，首次检索时自动重建 |

重写数量与失败原因会打印到控制台日志；单个文件失败不会阻断启动。

## 网络驱动器

实测结论：网络共享可以承载 `portable\` 里的数据，但**能否直接双击运行取决于共享是否授予执行权限**。如果共享把登录账号映射成只有读写的身份，Windows 会以 `Access is denied` 拒绝启动可执行文件（用系统自带的 `where.exe` 拷过去同样跑不起来，`icacls` 会显示该身份只有 `(R,W)` 而没有 `(X)`）。这种情况下把整个目录放在共享上只适合作备份与搬运，运行仍需本机磁盘。

数据面本身在 SMB 上是可用的：本项目的会话日志（带校验和的 zstd 帧追加）与会话检索库（SQLite WAL）都在共享上实测通过。

运行在共享上时还有一个行为差异：Windows 的写限制沙箱需要在工作区根目录写访问控制项（ACL），ACL 无法在共享目录上写入，因此当可执行程序位于 UNC 路径或映射网络驱动器时，DSH-Go 以 `danger-full-access` 启动。想强制恢复沙箱，设置 `DSH_PERMISSION_MODE=workspace-write`；在本机磁盘上运行时不改默认值，仍是 `workspace-write`。

共享上还请注意两点：同时只允许一台机器打开同一份 `portable\`（并发写会破坏会话日志）；首次启动要读取 7000 多个文件，冷启动会明显慢于本机磁盘。

## 删除会话（DSH-Go 自带）

DSH-Go 在会话行的 `⋯` 菜单里多了一行**删除会话**，位于**归档会话**下方。它做的是彻底删除：确认后移除该会话的会话日志目录，并从工作区行、归档集合、置顶集合里一并去掉，和归档（只改归组、保留日志）不同。点选后一定会先弹确认框，写清会话标题与「无法恢复」；会话还在跑时宿主会先停掉它的任务再删，不会因此拒绝；确实删不掉时会说明原因（会话已不存在，或后端报出无法清除的占用）。

这一行由安装包内置的 bundle `@deepseek-ai/dsh-go-session-delete` 提供，`web` 档案模板默认启用。它在插件管理器里作为「随安装包提供」的可选 bundle 列出，可以在主列表直接关掉再打开；关掉之后菜单行消失，已保存的会话不受影响。随程序分发的 bundle 不支持「卸载」（DSH 对所有内置 bundle 都是这个规则——真正的卸载要改程序文件），要停用就关掉它。它没有键盘快捷键。

宿主能力（`workspace.deleteSession` 与 `SessionPersistence.delete`）属于核心，因此这个 bundle 只提供界面，删不删得掉由宿主判定。删除前宿主会先发 `workspace/session-close` 释放该会话仍活着的进程内持有者（Agent 注册表关闭它的日志写句柄），所以刚聊过、还开着的会话也能直接删掉，不需要重启；释放失败时由持久化后端报出它无法清除的占用。删除完成后后端发出 `session/deleted`，投影缓存据此丢弃该会话的检查点记录，不会在之后复用同一 id 时读到旧数据。

## 维护（清理残留）

设置页里多了一个**维护**分区，由内置 bundle `@deepseek-ai/dsh-go-maintenance` 提供。点**扫描**会列出三类残留：没有工作区引用的投影缓存检查点、没有工作区引用的日志目录、没有日志引用的图片附件；可以逐类清理，也可以一次全部清理，清理完会自动重新扫描。

“存活”按工作区判定：所有工作区的会话、归档集合、置顶集合。日志还在磁盘上、但已不属于任何工作区的会话算残留——这正是早期版本删除会话后留下的那种目录，界面上看不见也删不掉。如果一个工作区都不引用任何会话，扫描会报空，而不是把整个安装当成残留。清理会话目录前还会确认该会话没有任务在跑。

它只在点击时工作，不会在启动时扫描——装得越久，启动扫描就越慢。判不准的一律不动：某个会话日志读不出来时，本次不会清理任何附件；持久化后端不落目录时，也不报告孤立目录。每次清理都会往 `logs\` 里的宿主日志写一行审计记录。成本台账保留已删会话的计费历史，不在此列。
## 凭据

`portable\dsh-home\.credentials.yaml` 是明文，随目录一起移动，所以换机器后不需要重新登录。分享、上传或提交前请删除它。

## 关闭了官方自动更新

便携版无法被安装器覆盖（那会把目录搬进 Program Files），因此禁用了官方的强制更新检查；拆包后的自动更新配置本来也不包含在无签名目录构建里。

升级方式是替换程序文件、保留 `portable\`。源码级的更新（跟进官方仓库）见 [SYNC.zh.md](SYNC.zh.md)，构建方法见 [BUILD.zh.md](BUILD.zh.md)。

## 更新自己

程序目录里有 `Update-DSH-Go.ps1`，双击或用 PowerShell 运行即可：

```powershell
pwsh .\Update-DSH-Go.ps1          # 下载最新发布版并替换程序文件
pwsh .\Update-DSH-Go.ps1 -Check   # 只检查有没有新版本
pwsh .\Update-DSH-Go.ps1 -Force   # 关闭正在运行的实例后更新
```

它从 GitHub Releases 读取最新版本（按 `BUILD-INFO.txt` 里的提交号比对），下载 zip 并**校验 SHA-256**，然后覆盖程序文件；`portable\` 不会被触碰。更新需要联网，仓库公开后无需任何令牌。

若新版本启动异常，把旧版本目录整体替换回来即可，数据始终在 `portable\` 里不受影响。
