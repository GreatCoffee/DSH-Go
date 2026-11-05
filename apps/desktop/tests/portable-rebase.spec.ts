import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { constants, zstdCompressSync } from 'node:zlib'
import { afterEach, expect, it } from 'vitest'
import { projectKey as upstreamProjectKey } from '@deepseek-ai/dsh-session-persistence-jsonl/src/format.ts'
import { projectKey, rebasePortableData } from '../src/portable-rebase.ts'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-portable-rebase-'))
  roots.push(root)
  return root
}

function frame(text: string): Buffer {
  return zstdCompressSync(text, { params: { [constants.ZSTD_c_checksumFlag]: 1 } })
}

function header(cwd: string, id = 'session-1'): string {
  return `${JSON.stringify({ version: 4, id, createdAt: 1, cwd, isSeeded: false, delegationDepth: 0 })}\n`
}

it('encodes project directories exactly like the session backend', () => {
  const samples = [
    'C:\\work\\agent', 'D:\\DSH-Go\\portable\\workspace\\deepseek-harness\\default-workspace',
    '/Users/a/鏂囨。', '\\\\server\\share\\folder', 'E:\\a-b-c', '/a/b-c',
  ]
  for (const sample of samples) expect(projectKey(sample)).toBe(upstreamProjectKey(sample))
})

it('rewrites the workspace table, session artifacts, and project directories', async () => {
  const root = await workspace()
  const previousRoot = join(root, 'old place')
  const currentRoot = join(root, 'new place')
  const dshHome = join(root, 'dsh-home')
  const workspacePath = join(previousRoot, 'portable', 'workspace', 'deepseek-harness', 'default-workspace')
  const project = join(dshHome, 'sessions', upstreamProjectKey(workspacePath))
  await mkdir(join(project, 'session-1'), { recursive: true })
  await mkdir(join(dshHome, 'storages', 'session_projcache'), { recursive: true })
  await mkdir(join(dshHome, 'attachments'), { recursive: true })

  const log = join(project, 'session-1', 'session.v4.jsonl.zstd')
  const events = `${JSON.stringify({ type: 'user', cwd: workspacePath, text: `open ${workspacePath}\\README.md` })}\n`
  await writeFile(log, Buffer.concat([frame(header(workspacePath)), frame(events)]))
  await writeFile(join(dshHome, 'storages', 'workspace.json'), JSON.stringify({
    tables: { workspaces: { w1: { path: workspacePath, title: 'default-workspace' } } },
  }, null, 2))
  await writeFile(join(dshHome, 'attachments', 'blob'), 'no paths here')

  const summary = await rebasePortableData({
    previousRoot, currentRoot, dshHome, userData: join(root, 'user-data'), workspaceDirectory: join(root, 'ws'),
  })

  expect(summary.failures).toEqual([])
  expect(summary.rewrittenSessions).toBe(1)
  expect(summary.renamedProjects).toBe(1)
  expect(summary.removedCaches).toBe(1)

  const nextWorkspacePath = join(currentRoot, 'portable', 'workspace', 'deepseek-harness', 'default-workspace')
  const table = JSON.parse(await readFile(join(dshHome, 'storages', 'workspace.json'), 'utf8')) as {
    tables: { workspaces: Record<string, { path: string }> }
  }
  expect(table.tables.workspaces['w1']?.path).toBe(nextWorkspacePath)

  const movedLog = join(dshHome, 'sessions', upstreamProjectKey(nextWorkspacePath), 'session-1', 'session.v4.jsonl.zstd')
  expect(existsSync(movedLog)).toBe(true)
  expect(existsSync(log)).toBe(false)
  expect(existsSync(join(dshHome, 'storages', 'session_projcache'))).toBe(false)
  expect(await readFile(join(dshHome, 'attachments', 'blob'), 'utf8')).toBe('no paths here')
})

it('leaves exports whose paths never mention the previous root untouched', async () => {
  const root = await workspace()
  const dshHome = join(root, 'dsh-home')
  const unrelated = join(dshHome, 'profiles', 'desktop', 'cordis.patch.yml')
  await mkdir(join(dshHome, 'profiles', 'desktop'), { recursive: true })
  await writeFile(unrelated, '[]\n')

  const summary = await rebasePortableData({
    previousRoot: join(root, 'old'), currentRoot: join(root, 'new'),
    dshHome, userData: join(root, 'user-data'), workspaceDirectory: join(root, 'ws'),
  })

  expect(summary.rewrittenFiles).toBe(0)
  expect(await readFile(unrelated, 'utf8')).toBe('[]\n')
})
