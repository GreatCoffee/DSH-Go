import { Context } from '@deepseek-ai/cordis'
import {
  SessionAlreadyOwnedError,
  SessionPersistenceNotFoundError,
} from '@deepseek-ai/dsh-session-persistence'
import * as JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sessionDir } from '../src/format.ts'
import { meta, oneTurnLog } from '../../session-persistence/tests/contract.ts'

let root: string
let ctx: Context

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-session-delete-'))
  ctx = new Context()
  await ctx.plugin(JsonlSessionPersistence, { root, compression: 'none' })
})

afterEach(async () => {
  await ctx.fiber.dispose()
  await rm(root, { recursive: true, force: true })
})

describe('JsonlSessionPersistence.delete', () => {
  it('removes the whole session directory and its listing entry', async () => {
    const header = meta('delete-materialized', '/work')
    const handle = await ctx.sessionPersistence.create(header)
    await handle.append(oneTurnLog())
    await handle.close()
    const dir = sessionDir(root, '/work', header.id)
    expect((await stat(dir)).isDirectory()).toBe(true)

    await ctx.sessionPersistence.delete(header.id)

    // The session's artifact directory is gone, not merely hidden: no
    // generation, lease, or retained frame can rebuild the session later.
    await expect(stat(dir)).rejects.toThrow()
    expect(await ctx.sessionPersistence.stat(header.id)).toBeUndefined()
    expect((await ctx.sessionPersistence.list()).map(s => s.header.id)).not.toContain(header.id)
  })

  it('reports not-found for a created session that never materialized', async () => {
    const header = meta('delete-pending', '/work')
    const handle = await ctx.sessionPersistence.create(header)
    // create() is lazy; closing without an append leaves no artifact behind,
    // so there is nothing to destroy and the call must say so instead of
    // reporting a successful deletion of a log that never existed.
    await handle.close()
    expect((await ctx.sessionPersistence.list()).map(s => s.header.id)).not.toContain(header.id)
    await expect(ctx.sessionPersistence.delete(header.id))
      .rejects.toBeInstanceOf(SessionPersistenceNotFoundError)
    await expect(stat(sessionDir(root, '/work', header.id))).rejects.toThrow()
  })

  it('refuses while a write handle still owns the session', async () => {
    const header = meta('delete-owned', '/work')
    const handle = await ctx.sessionPersistence.create(header)
    await handle.append(oneTurnLog())

    // Deleting under a live writer would let a later append resurrect a log
    // the user asked to destroy, so ownership is refused, not overridden.
    await expect(ctx.sessionPersistence.delete(header.id)).rejects.toBeInstanceOf(SessionAlreadyOwnedError)

    await handle.close()
    expect((await ctx.sessionPersistence.list()).map(s => s.header.id)).toContain(header.id)
    await ctx.sessionPersistence.delete(header.id)
    expect(await ctx.sessionPersistence.stat(header.id)).toBeUndefined()
  })

  it('reports an unknown id instead of succeeding silently', async () => {
    await expect(ctx.sessionPersistence.delete(meta('never-created', '/work').id))
      .rejects.toBeInstanceOf(SessionPersistenceNotFoundError)
  })
})
