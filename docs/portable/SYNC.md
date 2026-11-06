# Following official updates

English | [中文](SYNC.zh.md)

The DSH-Go repository is a copy of the official repository with its full history, plus a few local commits. Following official updates is an ordinary `git merge`.

## Why keep the full history

Upstream changes frequently, and only a shared ancestor lets git do a three-way merge: files the official project changed merge automatically, and manual intervention is needed only when both sides changed the same line.

If you import only the latest code (a single-commit repository), `git merge` degrades into whole-file conflicts because there is "no common ancestor", which makes following updates far more expensive instead.

## One command

```powershell
pwsh scripts/sync-upstream.ps1 -DryRun    # 先看落后多少、上游改了什么
pwsh scripts/sync-upstream.ps1            # 合并（默认）
pwsh scripts/sync-upstream.ps1 -Rebase    # 或把本地提交变基到上游之上
```

What the script does:

1. when the `upstream` remote is missing, add `https://github.com/deepseek-ai/deepseek-harness.git`;
2. `git fetch upstream --tags --prune`;
3. print the commit list of `HEAD..upstream/master`;
4. `git merge --no-edit upstream/master` (or `git rebase` with `-Rebase`).

## Where conflicts land

Local changes are deliberately kept to the smallest possible footprint:

| File | Nature | Conflict likelihood |
|---|---|---|
| `apps/desktop/src/portable.ts`, `portable-rebase.ts`, `apps/desktop/tests/portable*.spec.ts` | Purely additive | None |
| `docs/portable/`, `scripts/build-portable.ps1`, `scripts/sync-upstream.ps1` | Purely additive | None |
| `apps/desktop/src/main.ts` | Three small changes: the import, the bootstrap at the top of the module, the call at the start of `main()`, and a null check on the policy configuration | Low, and concentrated at the start and end of the file |
| `apps/desktop/package.json` | One `devDependencies` entry | Low |
| `packages/api/workspace-controller/src/default-directory.ts` | One environment-variable read | Low |

The principle for resolving conflicts: **take upstream as authoritative, then re-add our hooks**. There are only four hooks, under a hundred lines of code in total, so re-adding them costs far less than a line-by-line merge.

## After merging

```powershell
pnpm install --frozen-lockfile
pnpm exec tsc -b apps/desktop/tsconfig.host.json packages/api/workspace-controller/tsconfig.host.json
pnpm exec vitest run apps/desktop/tests/portable.spec.ts apps/desktop/tests/portable-rebase.spec.ts
pwsh scripts/build-portable.ps1
```

If upstream changes the session directory naming rule (`projectKey`) or the compression of session logs, the same-named implementation in `portable-rebase.ts` must be updated in step — a test that compares character-for-character against the upstream function goes red here first.

## Version identification

`scripts/build-portable.ps1` writes the current commit hash into the artifact's `BUILD-INFO.txt`, which identifies which upstream commit a given zip is based on.
