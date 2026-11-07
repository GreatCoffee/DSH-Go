/**
 * Filesystem scans behind the maintenance page: which Session directories and
 * attachment objects count as leftovers, and how references are read out of a
 * log page. Each case builds a tiny tree under a temporary root.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { collectDigests, collectLogDigests, directoryBytes, orphanDirectories, orphanObjects } from '../src/scan.ts'

let root: string

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'go-maintenance-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

/** Write one file with `bytes` of content, creating parents. */
async function seed(path: string, content: string): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, content)
}

describe('orphan session directories', () => {
  it('keeps named directories and reports the rest with their sizes', async () => {
    const project = join(root, '--work--')
    await seed(join(project, 'session-live', 'session.v4.jsonl.zstd'), 'x'.repeat(10))
    await seed(join(project, 'session-gone', 'session.v4.jsonl.zstd'), 'x'.repeat(7))
    await seed(join(project, 'legacy-gone', 'session.v4.jsonl.zstd'), 'x'.repeat(3))

    const orphans = await orphanDirectories(root, new Set(['session-live']))

    expect(orphans.map(orphan => orphan.path.split(/[\\/]/).pop()).sort()).toEqual(['legacy-gone', 'session-gone'])
    expect(orphans.reduce((total, orphan) => total + orphan.bytes, 0)).toBe(10)
  })

  it('keeps a live directory whether the store spells its id plain or prefixed', async () => {
    const project = join(root, '--work--')
    await seed(join(project, 'session-plain', 'session.v4.jsonl.zstd'), 'x')
    await seed(join(project, 'session-prefixed', 'session.v4.jsonl.zstd'), 'x')

    expect(await orphanDirectories(root, new Set(['plain', 'session-prefixed']))).toEqual([])
  })

  it('reports nothing when the root does not exist', async () => {
    expect(await orphanDirectories(join(root, 'missing'), new Set())).toEqual([])
  })
})

describe('attachment digest walk', () => {
  it('pages through a log instead of asking for all of it at once', async () => {
    const digest = 'c'.repeat(64)
    const events = Array.from({ length: 1200 }, (_, index) => ({ seq: index + 1, body: index === 900 ? `sha256:${digest}` : 'plain' }))
    const reads: number[] = []
    const source = {
      async read(offset = 0, length = Number.MAX_SAFE_INTEGER) {
        reads.push(length)
        return { events: events.slice(offset, offset + length) }
      },
    }

    const digests = await collectLogDigests(source, new Set<string>(), 500)

    expect([...digests]).toEqual([digest])
    expect(reads).toEqual([500, 500, 500, 500])
  })

  it('stops on the first empty page', async () => {
    const source = { async read() { return { events: [] } } }
    expect([...(await collectLogDigests(source, new Set<string>()))]).toEqual([])
  })
})

describe('orphan attachment objects', () => {
  it('keeps referenced digests and reports the others', async () => {
    const live = 'a'.repeat(64)
    const dead = 'b'.repeat(64)
    const objects = join(root, 'objects')
    await seed(join(objects, live.slice(0, 2), live), 'x'.repeat(4))
    await seed(join(objects, dead.slice(0, 2), dead), 'x'.repeat(6))

    const orphans = await orphanObjects(objects, new Set([live]))

    expect(orphans).toHaveLength(1)
    expect(orphans[0]?.path.endsWith(dead)).toBe(true)
    expect(orphans[0]?.bytes).toBe(6)
  })
})

describe('digest collection', () => {
  it('finds every sha256 mention in one serialized page', () => {
    const digests = collectDigests({
      events: [
        { type: 'user/message', data: { content: [{ type: 'image', attachment: { id: `sha256:${'c'.repeat(64)}` } }] } },
        { type: 'tool/result', data: { message: { content: [{ type: 'file', attachment: { id: `sha256:${'d'.repeat(64)}` } }] } } },
      ],
    }, new Set<string>())

    expect([...digests].sort()).toEqual(['c'.repeat(64), 'd'.repeat(64)])
  })
})

describe('directoryBytes', () => {
  it('sums a nested tree', async () => {
    await seed(join(root, 'tree', 'one.txt'), 'abc')
    await seed(join(root, 'tree', 'deep', 'two.txt'), 'de')

    expect(await directoryBytes(join(root, 'tree'))).toBe(5)
    expect(await directoryBytes(join(root, 'missing'))).toBe(0)
  })
})
