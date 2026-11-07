/** Portable runtime layout: one directory beside the executable owns every mutable file. */

import { execFileSync } from 'node:child_process'
import { createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, type WriteStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, parse } from 'node:path'
import { app } from 'electron'

/** Directory, beside the executable, that owns all portable state. */
export const PORTABLE_DIRECTORY_NAME = 'portable'
/** Current schema of `portable/state.json`. */
export const PORTABLE_STATE_SCHEMA_VERSION = 1

/** Absolute paths a portable launch owns. */
export interface PortableLayout {
  /** The directory holding the executable; moving it moves the whole installation. */
  readonly root: string
  /** `<root>/portable`. */
  readonly portableDirectory: string
  /** Harness home handed to the Host as `$DSH_HOME`, holding sessions, profiles, and storage. */
  readonly dshHome: string
  /** Electron `userData` (Chromium profile, desktop settings, logs). */
  readonly userData: string
  /** Parent of the default workspace; the Host appends `deepseek-harness/default-workspace`. */
  readonly workspaceDirectory: string
  /** Package-manager and shell caches that must not escape the portable directory. */
  readonly cacheDirectory: string
  /** `XDG_CONFIG_HOME`, so XDG-aware tools keep their configuration beside the executable. */
  readonly configDirectory: string
  /** `XDG_STATE_HOME`, so XDG-aware tools keep their state and logs beside the executable. */
  readonly stateDirectory: string
  /** Host console captures; a portable install has no other place to leave a trace of a warning. */
  readonly logsDirectory: string
  /** Scratch directory handed to Electron as `temp`. */
  readonly scratchDirectory: string
  /** `portable/state.json`, recording the last launch root. */
  readonly stateFile: string
  /** Whether the executable currently runs from a UNC path or a mapped network drive. */
  readonly networkLocation: boolean
}

/** Durable portable metadata; `lastRoot` is what a move is detected against. */
export interface PortableState {
  readonly schemaVersion: number
  /** Absolute executable directory of the previous launch. */
  readonly lastRoot: string
  /** ISO timestamp of the previous launch. */
  readonly lastLaunch: string
}

/**
 * Resolve every portable path without touching the filesystem.
 * @param exePath - Electron's executable path; its directory becomes the root.
 * @param networkLocation - Whether the root lives on a network share; injected for tests.
 * @returns the absolute portable layout.
 */
export function resolvePortableLayout(exePath: string, networkLocation?: boolean): PortableLayout {
  const root = dirname(exePath)
  const portableDirectory = join(root, PORTABLE_DIRECTORY_NAME)
  return {
    root,
    portableDirectory,
    dshHome: join(portableDirectory, 'dsh-home'),
    userData: join(portableDirectory, 'user-data'),
    workspaceDirectory: join(portableDirectory, 'workspace'),
    cacheDirectory: join(portableDirectory, 'cache'),
    configDirectory: join(portableDirectory, 'config'),
    stateDirectory: join(portableDirectory, 'state'),
    logsDirectory: join(portableDirectory, 'logs'),
    scratchDirectory: join(portableDirectory, 'temp'),
    stateFile: join(portableDirectory, 'state.json'),
    networkLocation: networkLocation ?? isNetworkLocation(root),
  }
}

/**
 * Whether the environment asks this launch to skip the portable layout.
 *
 * A packaged build normally owns `<executable directory>/portable`; `DSH_PORTABLE=0`
 * exists for embedders and for tests that drive the desktop entry point against an
 * Electron double, where rebasing `setPath` and the Host environment would leak into
 * the surrounding process. DSH-Go itself never sets it.
 * @param env - environment to read; defaults to the process environment.
 * @returns true when portable mode is explicitly disabled.
 */
export function portableDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = env['DSH_PORTABLE']?.trim().toLowerCase()
  return value === '0' || value === 'false' || value === 'off'
}

/**
 * Create the portable directory skeleton. Existing content is preserved.
 * @param layout - the resolved portable layout.
 * @returns whether the portable directory itself was absent, which means the
 * shipped data directory was removed or moved away rather than merely initialized.
 */
export function ensurePortableLayout(layout: PortableLayout): boolean {
  const wasAbsent = !existsSync(layout.portableDirectory)
  for (const directory of [
    layout.portableDirectory, layout.dshHome, layout.userData, layout.workspaceDirectory,
    layout.cacheDirectory, layout.configDirectory, layout.stateDirectory, layout.logsDirectory,
    layout.scratchDirectory,
  ]) mkdirSync(directory, { recursive: true })
  return wasAbsent
}

/**
 * Read the recorded portable state.
 * @param layout - the resolved portable layout.
 * @returns the parsed state, or `undefined` when the file is absent or unusable.
 */
export function readPortableState(layout: PortableLayout): PortableState | undefined {
  if (!existsSync(layout.stateFile)) return undefined
  try {
    const value: unknown = JSON.parse(readFileSync(layout.stateFile, 'utf8'))
    if (typeof value !== 'object' || value === null) return undefined
    const record = value as Record<string, unknown>
    if (typeof record['lastRoot'] !== 'string' || record['lastRoot'].length === 0) return undefined
    return {
      schemaVersion: typeof record['schemaVersion'] === 'number' ? record['schemaVersion'] : PORTABLE_STATE_SCHEMA_VERSION,
      lastRoot: record['lastRoot'],
      lastLaunch: typeof record['lastLaunch'] === 'string' ? record['lastLaunch'] : '',
    }
  } catch (_error: unknown) {
    // A partially written state file records no usable previous root; the rebase then has no baseline.
    return undefined
  }
}

/** Build identity written beside the executable by the packaging script. */
export interface PortableBuild {
  /** Upstream release the runtime was assembled from, such as `0.2.2-rc.1`. */
  readonly version?: string | undefined
  /** Source commit the runtime was assembled from. */
  readonly commit?: string | undefined
}

/**
 * Read the build identity a portable installation carries beside its executable.
 *
 * The window shows it so a user can tell which DSH-Go build is running without
 * opening a terminal, and a bug report can quote one string instead of a path.
 * @param directory - directory holding the executable and `BUILD-INFO.txt`.
 * @returns the recorded fields; empty when the file is absent or unreadable.
 */
export function readPortableBuild(directory: string): PortableBuild {
  try {
    const text = readFileSync(join(directory, 'BUILD-INFO.txt'), 'utf8')
    const field = (name: string): string | undefined => {
      const match = new RegExp(`^${name}:\\s*(.+)$`, 'm').exec(text)
      const value = match?.[1]?.trim()
      return value === undefined || value.length === 0 ? undefined : value
    }
    return { version: field('version'), commit: field('commit') }
  } catch (_error: unknown) {
    // A hand-assembled directory has no build file; the window then shows the runtime version alone.
    return {}
  }
}

/**
 * Host console captures kept beside the executable; older files are pruned at launch.
 */
export const PORTABLE_LOG_FILES_KEPT = 7

const ANSI_ESCAPE = /\u001B\[[0-9;]*[A-Za-z]/g

/**
 * Mirror the Host console into `<portable>/logs/host-<date>.log`.
 *
 * A packaged installation has no terminal anyone can scroll back through, so a
 * warning that matters after the fact — a failed cache eviction, a refused
 * deletion, a rebase that could not rewrite a file — would otherwise be lost.
 * The mirror is best effort: an unwritable log directory never breaks startup,
 * and the console keeps receiving everything the file does.
 * @param layout - the resolved portable layout.
 * @param streams - console streams to mirror; defaults to stdout and stderr.
 * @returns a disposer that restores both streams and closes the file.
 */
export function installPortableLogging(
  layout: PortableLayout,
  streams: readonly NodeJS.WriteStream[] = [process.stdout, process.stderr],
): () => void {
  mkdirSync(layout.logsDirectory, { recursive: true })
  prunePortableLogs(layout.logsDirectory)
  let stream: WriteStream | undefined
  let day = ''
  const sink = (): WriteStream | undefined => {
    const today = new Date().toISOString().slice(0, 10)
    if (day !== today) {
      stream?.end()
      const opened = createWriteStream(join(layout.logsDirectory, `host-${today}.log`), { flags: 'a' })
      opened.on('error', () => { if (stream === opened) stream = undefined })
      stream = opened
      day = today
    }
    return stream
  }
  const restores = streams.map((target) => {
    const original = target.write.bind(target)
    target.write = ((chunk: unknown, encoding?: unknown, callback?: unknown): boolean => {
      const file = sink()
      if (file !== undefined) {
        const text = typeof chunk === 'string'
          ? chunk
          : chunk instanceof Uint8Array ? Buffer.from(chunk).toString('utf8') : String(chunk)
        file.write(text.replace(ANSI_ESCAPE, ''))
      }
      return (original as (value: unknown, first?: unknown, second?: unknown) => boolean)(chunk, encoding, callback)
    }) as typeof target.write
    return () => { target.write = original as typeof target.write }
  })
  return () => {
    for (const restore of restores) restore()
    stream?.end()
    stream = undefined
  }
}

/**
 * Drop the oldest console captures beyond {@link PORTABLE_LOG_FILES_KEPT}.
 * @param directory - the portable log directory.
 */
function prunePortableLogs(directory: string): void {
  try {
    const files = readdirSync(directory)
      .filter(name => name.startsWith('host-') && name.endsWith('.log'))
      .sort()
    for (const name of files.slice(0, Math.max(0, files.length - PORTABLE_LOG_FILES_KEPT))) {
      try { unlinkSync(join(directory, name)) } catch (_error: unknown) { /* A locked capture stays until the next launch. */ }
    }
  } catch (_error: unknown) {
    // An unreadable directory just means no pruning this launch.
  }
}

/**
 * Point Electron and the Host at the portable layout before any path is read.
 * @param layout - the resolved portable layout.
 */
export function applyPortableEnvironment(layout: PortableLayout): void {
  app.setPath('userData', layout.userData)
  app.setPath('sessionData', layout.userData)
  app.setPath('logs', join(layout.userData, 'logs'))
  app.setPath('crashDumps', join(layout.userData, 'crash-dumps'))
  app.setPath('cache', join(layout.cacheDirectory, 'chromium'))
  app.setPath('temp', layout.scratchDirectory)

  const environment = process.env
  environment['DSH_HOME'] = layout.dshHome
  environment['DSH_AGENTS_HOME'] = join(layout.dshHome, '.agents')
  environment['DSH_DOCUMENTS_DIRECTORY'] = layout.workspaceDirectory
  environment['DSH_DESKTOP_PORTABLE'] = '1'
  environment['npm_config_cache'] = join(layout.cacheDirectory, 'npm')
  environment['pnpm_config_store_dir'] = join(layout.cacheDirectory, 'pnpm-store')
  // XDG-aware tools, plugins among them, default to the user profile on Windows and
  // would leave configuration, cache, and state behind when the directory moves.
  environment['XDG_CONFIG_HOME'] = layout.configDirectory
  environment['XDG_CACHE_HOME'] = layout.cacheDirectory
  environment['XDG_STATE_HOME'] = layout.stateDirectory
  // The Windows write-restriction sandbox cannot own an ACL on a share; the
  // deployment default keeps confined commands working by running unconfined.
  if (layout.networkLocation) environment['DSH_PERMISSION_MODE'] = 'danger-full-access'
}

/**
 * Decide whether a root is a UNC path or a mapped network drive.
 * @param root - absolute executable directory.
 * @returns whether writes there are served by a remote filesystem.
 */
export function isNetworkLocation(root: string): boolean {
  if (process.platform !== 'win32') return false
  if (root.startsWith('\\\\')) return true
  const volume = parse(root).root
  if (!/^[A-Za-z]:\\$/.test(volume)) return false
  try {
    // `net use X:` succeeds only for a mapped network drive and fails for local volumes.
    execFileSync('cmd.exe', ['/c', 'net', 'use', volume.slice(0, 2)], { stdio: 'ignore', windowsHide: true, timeout: 5000 })
    return true
  } catch (_error: unknown) {
    // A local volume or a missing mapping both land here; neither is a network location.
    return false
  }
}

/**
 * Record this launch's root so the next launch can tell whether the directory moved.
 * @param layout - the resolved portable layout.
 */
export async function writePortableState(layout: PortableLayout): Promise<void> {
  const state: PortableState = {
    schemaVersion: PORTABLE_STATE_SCHEMA_VERSION,
    lastRoot: layout.root,
    lastLaunch: new Date().toISOString(),
  }
  await mkdir(dirname(layout.stateFile), { recursive: true })
  await writeFile(layout.stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}
