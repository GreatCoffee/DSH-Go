/** Rewrites stored absolute paths after the portable directory moves. */

import { existsSync } from 'node:fs'
import { readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { constants, zstdCompressSync, zstdDecompressSync, type ZstdOptions } from 'node:zlib'

/** Directories under the Chromium profile that hold derived caches, never stored paths. */
const CHROMIUM_CACHE_DIRECTORIES = new Set([
  'Cache', 'Code Cache', 'DawnGraphiteCache', 'DawnWebGPUCache', 'GPUCache', 'GPUPersistentCache',
  'GrShaderCache', 'ShaderCache', 'Network', 'blob_storage', 'Service Worker', 'Shared Dictionary',
])

/** File suffixes whose contents are text that can carry a stored absolute path. */
const REWRITABLE_FILE = /\.(?:json|jsonl|yml|yaml|txt|md|log|csv|toml|ini)$/i

/** One stored-path rewrite invocation. */
export interface PortableRebaseRequest {
  /** Executable directory recorded by the previous launch. */
  readonly previousRoot: string
  /** Executable directory of this launch. */
  readonly currentRoot: string
  /** Portable harness home holding sessions and storage. */
  readonly dshHome: string
  /** Portable Electron profile directory. */
  readonly userData: string
  /** Parent of the default workspace. */
  readonly workspaceDirectory: string
}

/** Observable result of a rewrite; failures are reported, never thrown. */
export interface PortableRebaseSummary {
  readonly previousRoot: string
  readonly currentRoot: string
  readonly rewrittenSessions: number
  readonly renamedProjects: number
  readonly rewrittenFiles: number
  readonly removedCaches: number
  readonly failures: readonly string[]
}

interface PathReplacement {
  readonly pattern: RegExp
  readonly variants: readonly { readonly match: string; readonly replacement: string }[]
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildReplacement(previousRoot: string, currentRoot: string): PathReplacement {
  const styles = [
    (value: string): string => value.replace(/\\/g, '\\\\'),
    (value: string): string => value,
    (value: string): string => value.replace(/\\/g, '/'),
  ]
  const variants = styles.map(style => ({ match: style(previousRoot), replacement: style(currentRoot) }))
    .filter(variant => variant.match.length > 0)
    .sort((left, right) => right.match.length - left.match.length)
  return {
    pattern: new RegExp(variants.map(variant => escapeRegExp(variant.match)).join('|'), 'gi'),
    variants,
  }
}

function replacePaths(text: string, replacement: PathReplacement): string {
  return text.replace(replacement.pattern, (matched: string) => {
    const folded = matched.toLowerCase()
    const variant = replacement.variants.find(candidate => candidate.match.toLowerCase() === folded)
    return variant?.replacement ?? matched
  })
}

function containsPreviousRoot(text: string, replacement: PathReplacement): boolean {
  replacement.pattern.lastIndex = 0
  const found = replacement.pattern.test(text)
  replacement.pattern.lastIndex = 0
  return found
}

const CHECKSUM_OPTIONS: ZstdOptions = { params: { [constants.ZSTD_c_checksumFlag]: 1 } }

interface FrameRange { readonly start: number; readonly end: number }

/** Locate complete frames in a concatenated Zstandard stream. */
function scanFrames(buffer: Buffer): FrameRange[] {
  const frames: FrameRange[] = []
  let offset = 0
  while (offset < buffer.length) {
    const start = offset
    if (buffer.length - offset < 5) throw new Error(`incomplete frame header at byte ${offset}`)
    if (buffer.readUInt32LE(offset) !== 0xFD2FB528) throw new Error(`invalid frame magic at byte ${offset}`)
    offset += 4
    const descriptor = buffer.readUInt8(offset)
    offset += 1
    if ((descriptor & 0x18) !== 0) throw new Error(`reserved frame-header bit at byte ${offset - 1}`)
    const contentSizeFlag = descriptor >>> 6
    const singleSegment = (descriptor & 0x20) !== 0
    const checksum = (descriptor & 0x04) !== 0
    const dictionaryFlag = descriptor & 0x03
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag
    offset += (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes
    if (offset > buffer.length) throw new Error(`incomplete frame header at byte ${start}`)
    for (;;) {
      if (buffer.length - offset < 3) throw new Error(`incomplete block header at byte ${offset}`)
      const blockHeader = buffer.readUIntLE(offset, 3)
      offset += 3
      const lastBlock = (blockHeader & 1) !== 0
      const blockType = (blockHeader >>> 1) & 0x03
      const blockSize = blockHeader >>> 3
      if (blockType === 0x03) throw new Error(`reserved block type at byte ${offset - 3}`)
      offset += blockType === 0x01 ? 1 : blockSize
      if (offset > buffer.length) throw new Error(`incomplete block payload at byte ${start}`)
      if (lastBlock) break
    }
    if (checksum) {
      offset += 4
      if (offset > buffer.length) throw new Error(`incomplete checksum at byte ${start}`)
    }
    frames.push({ start, end: offset })
  }
  return frames
}

/**
 * Rewrite absolute paths inside one concatenated-frame session log.
 * @param content - the complete stored artifact.
 * @param replacement - the root substitution.
 * @returns rewritten bytes, or `undefined` when the log carries no stored root.
 */
function rewriteSessionContent(content: Buffer, replacement: PathReplacement): Buffer | undefined {
  let changed = false
  const frames: Buffer[] = []
  for (const frame of scanFrames(content)) {
    const encoded = content.subarray(frame.start, frame.end)
    const plaintext = zstdDecompressSync(encoded).toString('utf8')
    if (!containsPreviousRoot(plaintext, replacement)) {
      frames.push(encoded)
      continue
    }
    frames.push(zstdCompressSync(replacePaths(plaintext, replacement), CHECKSUM_OPTIONS))
    changed = true
  }
  return changed ? Buffer.concat(frames) : undefined
}

async function writeFileAtomicBytes(path: string, content: Buffer): Promise<void> {
  const temporary = `${path}.rebase-tmp-${process.pid}`
  await writeFile(temporary, content)
  await rename(temporary, path)
}

/** Read the `cwd` recorded by a session artifact's header frame. */
function readSessionCwd(content: Buffer): string | undefined {
  const [header] = scanFrames(content)
  if (header === undefined) return undefined
  const line = zstdDecompressSync(content.subarray(header.start, header.end)).toString('utf8').split('\n', 1)[0]
  if (line === undefined) return undefined
  try {
    const value: unknown = JSON.parse(line)
    if (typeof value !== 'object' || value === null) return undefined
    const cwd = (value as Record<string, unknown>)['cwd']
    return typeof cwd === 'string' ? cwd : undefined
  } catch (_error: unknown) {
    // An unreadable header leaves the project directory name untouched.
    return undefined
  }
}

async function listSessionLogs(directory: string): Promise<string[]> {
  const logs: string[] = []
  let entries
  try { entries = await readdir(directory, { withFileTypes: true }) } catch (_error: unknown) { return logs }
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) logs.push(...await listSessionLogs(path))
    else if (entry.isFile() && entry.name.endsWith('.jsonl.zstd')) logs.push(path)
  }
  return logs
}

async function listProjectDirectories(sessionsDirectory: string): Promise<string[]> {
  try {
    const entries = await readdir(sessionsDirectory, { withFileTypes: true })
    return entries.filter(entry => entry.isDirectory()).map(entry => join(sessionsDirectory, entry.name))
  } catch (_error: unknown) {
    // A portable directory with no sessions yet has nothing to rewrite.
    return []
  }
}

async function rewriteTree(
  root: string,
  replacement: PathReplacement,
  skip: (path: string) => boolean,
): Promise<{ files: number; failures: string[] }> {
  let files = 0
  const failures: string[] = []
  const walk = async (directory: string): Promise<void> => {
    let entries
    try { entries = await readdir(directory, { withFileTypes: true }) } catch (_error: unknown) { return }
    for (const entry of entries) {
      const path = join(directory, entry.name)
      if (skip(path)) continue
      if (entry.isDirectory()) { await walk(path); continue }
      if (!entry.isFile() || !REWRITABLE_FILE.test(entry.name)) continue
      try {
        const info = await stat(path)
        if (info.size > 64 * 1024 * 1024) continue
        const text = await readFile(path, 'utf8')
        if (!containsPreviousRoot(text, replacement)) continue
        await writeFileAtomicBytes(path, Buffer.from(replacePaths(text, replacement), 'utf8'))
        files += 1
      } catch (error: unknown) {
        failures.push(`${path}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
  await walk(root)
  return { files, failures }
}

/**
 * Rewrite every stored absolute path after the portable directory moved.
 *
 * Session artifacts are rewritten frame by frame so their checksums stay valid,
 * then each project directory is renamed to the key its rewritten header now
 * implies. Derived query caches are deleted because they index the old paths.
 * @param request - the previous and current executable directories plus portable roots.
 * @returns counts and per-path failures; the caller reports them without aborting startup.
 */
export async function rebasePortableData(request: PortableRebaseRequest): Promise<PortableRebaseSummary> {
  const replacement = buildReplacement(request.previousRoot, request.currentRoot)
  const failures: string[] = []
  let rewrittenSessions = 0
  let renamedProjects = 0
  let rewrittenFiles = 0
  let removedCaches = 0

  const sessionsDirectory = join(request.dshHome, 'sessions')
  for (const project of await listProjectDirectories(sessionsDirectory)) {
    const logs = await listSessionLogs(project)
    let firstCwd: string | undefined
    for (const log of logs) {
      try {
        const content = await readFile(log)
        const cwd = readSessionCwd(content)
        if (cwd !== undefined) firstCwd ??= replacePaths(cwd, replacement)
        const rewritten = rewriteSessionContent(content, replacement)
        if (rewritten === undefined) continue
        await writeFileAtomicBytes(log, rewritten)
        rewrittenSessions += 1
      } catch (error: unknown) {
        failures.push(`${log}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    if (firstCwd === undefined) continue
    const expected = join(sessionsDirectory, projectKey(firstCwd))
    if (expected === project) continue
    if (existsSync(expected)) {
      failures.push(`${project}: target project directory already exists (${expected})`)
      continue
    }
    try {
      await rename(project, expected)
      renamedProjects += 1
    } catch (error: unknown) {
      failures.push(`${project}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  for (const root of [request.dshHome, request.userData]) {
    const result = await rewriteTree(root, replacement, (path: string) => {
      const relative = path.slice(root.length + 1)
      if (relative === 'sessions' || relative.startsWith('sessions\\')) return true
      if (relative === 'attachments' || relative.startsWith('attachments\\')) return true
      const [head] = relative.split('\\')
      return head !== undefined && CHROMIUM_CACHE_DIRECTORIES.has(head)
    })
    rewrittenFiles += result.files
    failures.push(...result.failures)
  }

  const derived = join(request.dshHome, 'storages', 'session_projcache')
  if (existsSync(derived)) {
    try {
      await rm(derived, { recursive: true, force: true })
      removedCaches += 1
    } catch (error: unknown) {
      failures.push(`${derived}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return {
    previousRoot: request.previousRoot,
    currentRoot: request.currentRoot,
    rewrittenSessions,
    renamedProjects,
    rewrittenFiles,
    removedCaches,
    failures,
  }
}

/**
 * Encode a project path the way the Session backend names its directory.
 * @param cwd - absolute project directory.
 * @returns a single filesystem-safe component.
 */
export function projectKey(cwd: string): string {
  if (cwd.length === 0) throw new Error('cannot encode an empty project path')
  let readable = ''
  let separatorRun = false
  for (let index = 0; index < cwd.length; index += 1) {
    const code = cwd.charCodeAt(index)
    const character = String.fromCharCode(code)
    if (character === '/' || character === '\\' || character === ':') {
      if (!separatorRun) readable += '-'
      separatorRun = true
    } else if (character !== '~' && /^[A-Za-z0-9._-]$/.test(character)) {
      readable += character
      separatorRun = false
    } else {
      readable += `~${code.toString(16).toUpperCase().padStart(4, '0')}`
      separatorRun = false
    }
  }
  const slug = readable.replace(/^-+/, '') || 'root'
  return `--${slug.slice(0, 251)}--`
}
