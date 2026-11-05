# DSH-Go 便携版

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
   ├─ cache\                npm / pnpm 缓存与 Chromium 缓存
   ├─ temp\                 Electron 临时目录
   └─ state.json            上次启动所在的目录，用于识别"搬家"
```

程序文件与数据完全分离：升级时只替换程序文件，`portable\` 原样保留。

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
