# DSH-Go

基于 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Windows 便携构建。非官方。

[English](README.md) | 中文

> ### 这不是官方项目
>
> DSH-Go 是 DeepSeek Harness 的非官方、个人用便携构建，与 DeepSeek 没有任何隶属、赞助或背书关系。"DeepSeek Harness"与"DeepSeek"是 DeepSeek 的商标，本项目仅在描述"基于什么构建"时使用该名称。除上游原项目之外的每一个文件，都是本分支的额外添加。
>
> ### 没有人工审核，不提供任何保证
>
> 本分支的维护者**不具备代码能力，无法编写或审阅代码**。除上游原项目之外的全部改动——便携运行时、路径重写层、构建与更新脚本、以及这些文档——**均由 AI 模型 DeepSeek V4.1 Flash 生成**，**未经任何有资质的工程师审核**。它们可能是错误的、不安全的，甚至是破坏性的。
>
> 请把它当作未经审核的第三方软件：运行前先看 diff，备份 `portable\`，不要指向你输不起的数据，风险完全自担。MIT 许可证不提供任何形式的担保。
>
> - 便携版说明：[docs/portable/README.zh.md](docs/portable/README.zh.md) · 自行构建：[docs/portable/BUILD.zh.md](docs/portable/BUILD.zh.md) · 跟进上游：[docs/portable/SYNC.zh.md](docs/portable/SYNC.zh.md)
> - 构建：`pwsh scripts/build-portable.ps1`；同步上游：`pwsh scripts/sync-upstream.ps1`；更新已安装的便携版：`pwsh scripts/update-portable.ps1`

## DSH-Go 提供了什么

- **数据随身携带。** 会话、设置、已安装插件、日志与默认工作区都在程序旁边的 `portable\` 里。整个目录搬到别的路径、别的盘、别的机器（或 NAS），双击 `DeepSeek Harness.exe` 即可；启动时会重写记录下来的路径，恢复到上次的状态。
- **自更新。** `Update-DSH-Go.cmd` 找到最新的 `go-<commit>` 发布，校验 SHA-256 后只替换程序文件，不碰 `portable\`。
- **删除会话。** 会话行的 ⋯ 菜单在「归档会话」下方提供「删除会话」：经二次确认后先停止该会话正在运行的任务，再永久删除它的日志、注册表记录与分组痕迹。
- **数据维护。** 设置 → 数据维护 扫描并清理已无工作区引用的残留：孤立检查点记录、孤立的会话日志、以及没有任何存活日志引用的附件。
- **主机日志。** `portable\logs\host-<UTC 日期>.log` 记录启动、插件加载失败与维护清理，保留最新 7 个文件。
- **没有厂商更新通道。** 便携版隐藏「检查更新」「意见反馈」「更新渠道」，版本号显示为 `0.2.2-rc.1 (DSH-Go <commit>)`。

安装：从 [Releases](https://github.com/GreatCoffee/DSH-Go/releases) 下载 `DSH-Go-<commit>-win-x64-portable.zip`，解压后运行 `DeepSeek Harness.exe`。压缩包内只有空的 `portable\` 骨架；用新构建替换程序文件时保留你自己的 `portable\`。

DeepSeek Harness（`dsh`）是由 [DeepSeek AI](https://deepseek.com) 开发的开源 agent harness（智能体框架）。

它构建于**一切皆插件**的架构之上，由 [Cordis](https://github.com/cordiverse/cordis) 驱动，其设计参见论文 [_A Programming Paradigm for Spatiotemporal Composability_](https://arxiv.org/abs/2608.25512)。

文档：[https://deepseek-harness.github.io/deepseek-harness/](https://deepseek-harness.github.io/deepseek-harness/)

## 开发者预览

DeepSeek Harness 处于 _开发者预览_ 阶段，正在快速迭代。**未来将出现破坏兼容性的变更。**

运行本项目前，请阅读[安全说明](SAFETY.zh.md)。

<a id="run"></a>

## 运行

### 通过 `npm` 运行

安装 `Node.js`，然后运行：

```sh
npx @deepseek-ai/dsh web
```

该命令默认会在 `http://127.0.0.1:3080` 启动 Web UI，本机启动时还会用默认浏览器打开页面。通过 SSH 启动时只打印宿主机 URL，因为本地转发地址由 SSH 客户端或编辑器持有。传入 `--no-open` 可仅运行服务器而不打开浏览器。详见 [Web UI 指南](docs/user/guide/index.zh.md)。

<a id="run-from-source"></a>

### 从源码运行

如需从仓库源码运行：

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

`pnpm run build` 会准备仓库产物。`pnpm dsh web` 会直接使用这些已构建产物，不会重新构建。

## 社区与支持

本分支没有自己的社区渠道：DSH-Go 的问题请提交到 [GreatCoffee/DSH-Go issues](https://github.com/GreatCoffee/DSH-Go/issues)。以下内容都属于上游 DeepSeek Harness 项目，上游无法回答与本构建相关的问题。

- 上游 [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions)：讨论 harness 本身。
- 为你的插件仓库添加 [`dsh-plugin`](https://github.com/topics/dsh-plugin) 话题，便于被发现。
- 欢迎加入 DeepSeek Harness 企微群！扫描下方二维码填写入群问卷，小助手会定期发送入群邀请。

<table>
  <thead>
    <tr>
      <th align="center">入群问卷</th>
      <th align="center">微信公众号</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td align="center"><a href="https://trtgsjkv6r.feishu.cn/share/base/form/shrcnIt5twSVdLGD52KJBckGCgg"><img src="https://cdn.deepseek.com/harness/readme/community-wecom-survey.png" alt="DeepSeek Harness 入群问卷二维码" width="180" height="180"></a></td>
      <td align="center"><img src="https://cdn.deepseek.com/harness/readme/community-wechat-official-account.png" alt="DeepSeek Harness 团队微信公众号二维码" width="180" height="180"></td>
    </tr>
  </tbody>
</table>

## 参与贡献

参见 [CONTRIBUTING.md](CONTRIBUTING.zh.md)。

## 开发

请先阅读[开发指南](docs/development.zh.md)与[架构文档](docs/architecture.zh.md)。

`pnpm run dev:web` 会在一个终端里完成构建、启动，并在源码修改时重建 client bundle；`make help` 列出 Web 与 Desktop 对应的 Make target。完整表格见开发指南的「应用命令」一节。

面向 agent：请遵循 [AGENTS.md](AGENTS.md)。

## 引用

```bibtex
@misc{deepseek-harness2026,
  title={DeepSeek Harness: Everything is a Plugin},
  author={DeepSeek-AI},
  year={2026},
  publisher={GitHub},
  howpublished={\url{https://github.com/deepseek-ai/deepseek-harness}},
}
```

## 许可证

[MIT](LICENSE)

第三方依赖及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
