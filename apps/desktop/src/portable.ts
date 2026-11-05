/** Portable runtime layout: one directory beside the executable owns every mutable file. */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
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
    scratchDirectory: join(portableDirectory, 'temp'),
    stateFile: join(portableDirectory, 'state.json'),
    networkLocation: networkLocation ?? isNetworkLocation(root),
  }
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
    layout.cacheDirectory, layout.scratchDirectory,
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
