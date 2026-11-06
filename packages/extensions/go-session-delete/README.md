---
description: "DSH-Go permanent Session deletion: one Session-menu row under Archive plus its confirmation dialog."
kind: "package-reference"
---

# @deepseek-ai/dsh-go-session-delete

English | [中文](README.zh.md)

## Summary

`dsh-go-session-delete` is the DSH-Go addition that lets a person delete a Session for good instead of archiving it. Opening a Session row's `⋯` menu shows **Delete session** directly below **Archive session**; choosing it asks for confirmation, and confirming removes the Session's durable log and every grouping trace. The row is UI only: the deletion itself is the `workspace.deleteSession` Remote owned by the Workspace Controller.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Ship it as an ordinary bundle: the DSH-Go installation carries the package, and the `web` profile template enables it, so a fresh profile shows the row with no setup. A profile that already exists can switch it on from the plugin manager, and switching it off removes the row without touching stored Sessions.

The entry sits in the menu footer group with the other destructive rows, one order step below Archive, and carries the trash glyph. It has no keyboard shortcut: deletion is deliberate, and a mis-typed accelerator on a grouping row is not worth the risk. The confirmation dialog names the Session's title, says the chat history cannot be recovered, and keeps the dialog open with the Host's reason when the deletion is refused — a running Session or a Session the Host no longer knows are reported in the reader's language instead of a raw error code.

### What deletion means

A confirmed delete removes the Session's own directory under the profile's session storage, drops the id from every Workspace row, and drops it from the archived and pinned sets. Archiving, by contrast, keeps the log and only changes how the row is grouped. The Workspace directory itself is untouched, so deleting the last Session of a Workspace leaves the Workspace listed and empty.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The Host capability is shared, not owned here: `SessionPersistence.delete` removes one stored Session (refusing while a write handle owns it), `WorkspaceRegistry.deleteSession` queues the durable delete before it edits any grouping state, and the Workspace Controller exposes both behind `workspace.deleteSession` with `session/not-found` and `workspace/session-active` failures. This package contributes only the browser face — one `ctx.contextMenus.register` row at order 650 with `danger: true`, `afterContent: true` so it stays in the footer beneath Archive, and one `shell.overlay` entry holding the confirmation dialog and its pending request. Both registrations are disposed with the plugin fiber, so disabling the bundle leaves no row and no dialog behind.

</details>

-----

<a id="model-experience"></a>
## Model Experience

This package adds no tool, prompt text, or schema, so it changes nothing the model can call. Deleting a Session removes that transcript from every later context that would have included it; a compacted summary of the deleted Session cannot be produced afterwards. Because a running Session is refused rather than stopped, deletion never interrupts an in-flight turn or its tool calls.

-----

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- The row disappears on the Workspace frame the Host publishes after the delete; the client model also prunes it locally when the call succeeds, so the row is gone before the next reconnect either way.
- Deleting a Session that a subagent or a scheduled task still references is refused only while that work is active; a later reference resolves as a missing Session, exactly like an archived-then-purged one.
- Bulk deletion (all Sessions of a Workspace, or every archived Session) is not part of this package.

-----

<a id="dev-note"></a>
## Dev Note

The confirmation dialog keeps its in-flight and error state per request, keyed by Session, so a request that fails leaves the dialog usable and a cancelled request discards the state. Tests mount the browser half over the real menu registry and locale runtime with a stub overlay and a stub Remote, which is enough to prove ordering, grouping, absence of a shortcut, the confirm-before-delete contract, and the localized refusal.
