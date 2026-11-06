# 跟进官方更新

[English](SYNC.md) | 中文

DSH-Go 的仓库是一份带完整历史的官方仓库副本，另加少量本地提交。跟进官方更新就是一次普通的 `git merge`。

## 为什么保留完整历史

上游改动频繁，只有保留共同祖先，git 才能做三方合并：官方改过的文件自动合并，只有双方都动过同一行时才需要人工介入。

若只导入最新代码（单提交仓库），`git merge` 会因为"没有共同祖先"退化为全文件冲突，跟进成本反而高得多。

## 一条命令

```powershell
pwsh scripts/sync-upstream.ps1 -DryRun    # 先看落后多少、上游改了什么
pwsh scripts/sync-upstream.ps1            # 合并（默认）
pwsh scripts/sync-upstream.ps1 -Rebase    # 或把本地提交变基到上游之上
```

脚本做的事：

1. 缺少 `upstream` 远程时自动添加 `https://github.com/deepseek-ai/deepseek-harness.git`；
2. `git fetch upstream --tags --prune`；
3. 打印 `HEAD..upstream/master` 的提交列表；
4. `git merge --no-edit upstream/master`（或 `-Rebase` 时 `git rebase`）。

## 冲突会落在哪里

本地改动刻意压在最小面积上：

| 文件 | 性质 | 冲突可能性 |
|---|---|---|
| `apps/desktop/src/portable.ts`、`portable-rebase.ts`、`apps/desktop/tests/portable*.spec.ts` | 纯新增 | 无 |
| `docs/portable/`、`scripts/build-portable.ps1`、`scripts/sync-upstream.ps1` | 纯新增 | 无 |
| `apps/desktop/src/main.ts` | 三处小改：import、模块顶部引导、`main()` 起始处调用、策略配置判空 | 低，且集中在文件首尾 |
| `apps/desktop/package.json` | 一个 `devDependencies` 条目 | 低 |
| `packages/api/workspace-controller/src/default-directory.ts` | 一个环境变量读取 | 低 |

解决冲突的原则：**以上游为准，再把我们的挂点重新加回去**。挂点只有四处，代码量不足一百行，重加的成本远低于逐行合并。

## 合并之后

```powershell
pnpm install --frozen-lockfile
pnpm exec tsc -b apps/desktop/tsconfig.host.json packages/api/workspace-controller/tsconfig.host.json
pnpm exec vitest run apps/desktop/tests/portable.spec.ts apps/desktop/tests/portable-rebase.spec.ts
pwsh scripts/build-portable.ps1
```

若上游改了会话目录命名规则（`projectKey`）或会话日志的压缩方式，`portable-rebase.ts` 里的同名实现需要同步更新 —— 测试里有一条与上游函数逐字对比的用例，会在这里先红。

## 版本标识

`scripts/build-portable.ps1` 会把当前提交号写进产物的 `BUILD-INFO.txt`，用于确认某个 zip 基于哪个上游提交。
