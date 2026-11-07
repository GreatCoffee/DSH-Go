---
description: "DSH-Go 会话彻底删除：会话菜单「归档会话」下方的一行入口及其确认对话框。"
kind: "package-reference"
---

# @deepseek-ai/dsh-go-session-delete

[English](README.md) | 中文

## 概述

`dsh-go-session-delete` 是 DSH-Go 增加的插件，让人可以彻底删除会话，而不只是归档。打开会话行的 `⋯` 菜单，会在**归档会话**下方看到**删除会话**；点选后先弹确认，确认后才删除该会话的持久日志与所有归组痕迹。这一行只是界面：真正的删除经由 Workspace 导航接缝（`ctx.uiWorkspace.deleteSession`）完成——与归档一样，它会在删除当前视图后清空该视图。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发说明](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

按普通 bundle 发布：DSH-Go 安装包内置本包，`web` 档案模板默认启用，因此新建档案无需设置即可看到该菜单项。已存在的档案可以在插件管理器里打开；关掉后这一行消失，已保存的会话不受影响。

入口位于菜单页脚分组，与其他破坏性操作同组，排序比归档低一档，并使用垃圾桶图标。它没有键盘快捷键：删除是深思熟虑的动作，在归组行上误触一个快捷键并不值得。确认对话框会写出会话标题，说明聊天记录无法恢复；被拒绝时对话框保持打开并给出宿主的原因——会话仍在运行、或宿主已不认识该会话，都会以读者的语言说明，而不是抛出原始错误码。

### 删除意味着什么

确认删除后会移除档案会话存储下该会话自己的目录，从每个 Workspace 行中移除该 id，并把它从归档集合与置顶集合中移除。归档则相反：保留日志，只改变归组方式。Workspace 目录本身不受影响，因此删掉一个 Workspace 的最后一个会话后，该 Workspace 仍然存在，只是为空。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部——点击展开</summary>

宿主能力是共享的，不属于本包：`SessionPersistence.delete` 删除一个已存储会话（写入句柄占用时拒绝），`WorkspaceRegistry.deleteSession` 先排队持久删除、再修改任何归组状态，Workspace Controller 把两者放在 `workspace.deleteSession` 之后，并以 `session/not-found` 与 `workspace/session-active` 表示失败。本包只提供浏览器侧：一行 order 650、`danger: true`、`afterContent: true` 的 `ctx.contextMenus.register`（因此留在页脚、位于归档下方），以及一个承载确认对话框与其待确认请求的 `shell.overlay` 条目。两者都随插件 fiber 释放，所以禁用 bundle 后不会留下菜单行或对话框。

</details>

-----

<a id="model-experience"></a>
## 模型体验

本包不新增工具、提示词文本或 schema，因此不改变模型能调用的任何东西。删除会话后，该对话记录会从此后本应包含它的所有上下文中消失；被删除的会话之后无法再生成压缩摘要。删除屏幕上正显示的会话时，界面也会回到工作区默认页，因为导航接缝会清空被删除的当前视图。

-----

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- 宿主在删除后发布 Workspace 帧时该行消失；调用成功时客户端模型也会在本地剪除，因此无论哪种情况，重连前该行都已不在。
- 仅当子代理或定时任务仍在运行时，删除其引用的会话才会被拒绝；之后的引用会表现为「会话不存在」，与归档后被清理的会话完全一致。
- 批量删除（一个 Workspace 的全部会话，或全部已归档会话）不属于本包范围。

-----

<a id="dev-note"></a>
## 开发说明

确认对话框按请求、以会话为键保存进行中与错误状态，因此失败的请求仍可继续使用对话框，取消的请求则丢弃状态。测试把浏览器侧挂在真实的菜单注册表与语言运行时上，overlay 与 Remote 使用桩，足以证明排序、分组、没有快捷键、先确认后删除的约定，以及本地化的拒绝提示。
