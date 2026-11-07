/**
 * Filesystem scans behind the maintenance page, kept apart from the service
 * so they can be exercised against a temporary tree. Every helper is
 * conservative: a missing or unreadable directory yields nothing to remove,
 * never an error the Settings page would have to explain.
 * @module @deepseek-ai/dsh-go-maintenance/scan
 */

import { readdir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'

/** Attachment ids are `sha256:<hex>`; any mention in a log counts as a reference. */
const ATTACHMENT_REFERENCE = /sha256:([0-9a-f]{64})/g

/** A Session directory is named `session-<id>` in current builds, `<id>` in older ones. */
export const SESSION_DIRECTORY_PREFIX = 'session-'

/** One file the scan would remove. */
export interface ScannedFile {
  /** Absolute path. */
  readonly path: string
  /** Size in bytes at scan time. */
  readonly bytes: number
}

/**
 * Session directories no listed header names.
 * @param root - the sessions root.
 * @param names - session ids the store still lists, spelled plain or `session-<id>`.
 * @returns the orphan directories with their sizes.
 */
export async function orphanDirectories(root: string, names: ReadonlySet<string>): Promise<ScannedFile[]> {
  const orphans: ScannedFile[] = []
  for (const project of await subdirectories(root)) {
    for (const directory of await subdirectories(project)) {
      const name = basename(directory)
      const id = name.startsWith(SESSION_DIRECTORY_PREFIX) ? name.slice(SESSION_DIRECTORY_PREFIX.length) : name
      if (names.has(id) || names.has(SESSION_DIRECTORY_PREFIX + id)) continue
      orphans.push({ path: directory, bytes: await directoryBytes(directory) })
    }
  }
  return orphans
}

/**
 * Image objects whose digest no surviving log mentions.
 * @param objectsRoot - the content-addressed `objects` directory.
 * @param referenced - digests some log still mentions.
 * @returns the unreferenced files with their sizes.
 */
export async function orphanObjects(objectsRoot: string, referenced: ReadonlySet<string>): Promise<ScannedFile[]> {
  const orphans: ScannedFile[] = []
  for (const bucket of await subdirectories(objectsRoot)) {
    for (const file of await filesBelow(bucket)) {
      if (referenced.has(basename(file))) continue
      orphans.push({ path: file, bytes: await fileSize(file) })
    }
  }
  return orphans
}

/**
 * Every attachment digest one log page mentions.
 * @param page - one event page, serialized as JSON before scanning.
 * @param into - the accumulator to add to.
 * @returns the same accumulator, for chaining.
 */
export function collectDigests(page: unknown, into: Set<string>): Set<string> {
  for (const match of JSON.stringify(page).matchAll(ATTACHMENT_REFERENCE)) into.add(String(match[1]))
  return into
}

/**
 * Events requested per page while walking a Session log for attachment digests.
 * `SessionHandle.read` defaults to the rest of the log, so an unpaged walk
 * never reaches an empty page.
 */
export const DIGEST_PAGE_EVENTS = 500

/** The slice of a log a digest walk needs; a `SessionHandle` satisfies it. */
export interface LogPageSource {
  /** Read at most `length` events starting at positional index `offset`. */
  read(offset?: number, length?: number): Promise<{ readonly events: readonly unknown[] }>
}

/**
 * Every attachment digest a whole Session log mentions.
 * @param source - the open read handle.
 * @param into - the accumulator to add to.
 * @param pageSize - events per read; must be positive.
 * @returns the same accumulator, for chaining.
 */
export async function collectLogDigests(
  source: LogPageSource,
  into: Set<string>,
  pageSize: number = DIGEST_PAGE_EVENTS,
): Promise<Set<string>> {
  for (let offset = 0; ;) {
    const page = await source.read(offset, pageSize)
    if (page.events.length === 0) return into
    collectDigests(page.events, into)
    offset += page.events.length
  }
}

/**
 * Immediate subdirectories of one directory; a missing directory yields none.
 * @param directory - the parent to list.
 * @returns the child directory paths.
 */
export async function subdirectories(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true })
    return entries.filter(entry => entry.isDirectory()).map(entry => join(directory, entry.name))
  } catch (_missing: unknown) {
    return []
  }
}

/**
 * Regular files directly below one directory; a missing directory yields none.
 * @param directory - the parent to list.
 * @returns the child file paths.
 */
async function filesBelow(directory: string): Promise<string[]> {
  try {
    const entries = await readdir(directory, { withFileTypes: true })
    return entries.filter(entry => entry.isFile()).map(entry => join(directory, entry.name))
  } catch (_missing: unknown) {
    return []
  }
}

/**
 * Bytes one file holds; a vanished file counts as zero.
 * @param file - the file to measure.
 * @returns its size.
 */
async function fileSize(file: string): Promise<number> {
  try {
    return (await stat(file)).size
  } catch (_missing: unknown) {
    return 0
  }
}

/**
 * Bytes one directory tree holds.
 * @param directory - the tree root.
 * @returns the summed size of every readable entry.
 */
export async function directoryBytes(directory: string): Promise<number> {
  let total = 0
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    const path = join(directory, entry.name)
    total += entry.isDirectory() ? await directoryBytes(path) : await fileSize(path)
  }
  return total
}
