import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'

const setPath = vi.fn()
vi.mock('electron', () => ({ app: { setPath: (name: string, value: string) => { setPath(name, value) } } }))

const {
  applyPortableEnvironment, ensurePortableLayout, isNetworkLocation, readPortableState, resolvePortableLayout,
} = await import('../src/portable.ts')

const roots: string[] = []
afterEach(async () => {
  setPath.mockClear()
  delete process.env['DSH_HOME']
  delete process.env['DSH_PERMISSION_MODE']
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function directory(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-portable-layout-'))
  roots.push(root)
  return root
}

it('derives every portable path from the executable directory', async () => {
  const root = await directory()
  const layout = resolvePortableLayout(join(root, 'DSH-Go.exe'), false)
  expect(layout.root).toBe(root)
  expect(layout.portableDirectory).toBe(join(root, 'portable'))
  expect(layout.dshHome).toBe(join(root, 'portable', 'dsh-home'))
  expect(layout.userData).toBe(join(root, 'portable', 'user-data'))
  expect(layout.workspaceDirectory).toBe(join(root, 'portable', 'workspace'))
  expect(layout.stateFile).toBe(join(root, 'portable', 'state.json'))
})

it('creates the directory skeleton idempotently', async () => {
  const root = await directory()
  const layout = resolvePortableLayout(join(root, 'DSH-Go.exe'), false)
  ensurePortableLayout(layout)
  ensurePortableLayout(layout)
  expect(readPortableState(layout)).toBeUndefined()
})

it('reads a recorded state and ignores a damaged one', async () => {
  const root = await directory()
  const layout = resolvePortableLayout(join(root, 'DSH-Go.exe'), false)
  ensurePortableLayout(layout)
  await writeFile(layout.stateFile, JSON.stringify({ schemaVersion: 1, lastRoot: 'D:\\old', lastLaunch: 'now' }))
  expect(readPortableState(layout)).toEqual({ schemaVersion: 1, lastRoot: 'D:\\old', lastLaunch: 'now' })
  await writeFile(layout.stateFile, '{')
  expect(readPortableState(layout)).toBeUndefined()
})

it('points Electron and the Host at the portable layout', async () => {
  const root = await directory()
  const layout = resolvePortableLayout(join(root, 'DSH-Go.exe'), false)
  applyPortableEnvironment(layout)
  expect(setPath).toHaveBeenCalledWith('userData', layout.userData)
  expect(setPath).toHaveBeenCalledWith('logs', join(layout.userData, 'logs'))
  expect(process.env['DSH_HOME']).toBe(layout.dshHome)
  expect(process.env['DSH_DOCUMENTS_DIRECTORY']).toBe(layout.workspaceDirectory)
  expect(process.env['DSH_PERMISSION_MODE']).toBeUndefined()
})

it('widens the sandbox default only when the executable lives on a share', async () => {
  const root = await directory()
  const layout = resolvePortableLayout(join(root, 'DSH-Go.exe'), true)
  applyPortableEnvironment(layout)
  expect(process.env['DSH_PERMISSION_MODE']).toBe('danger-full-access')
})

it('recognizes UNC roots as network locations', () => {
  expect(isNetworkLocation('\\\\server\\share\\DSH-Go')).toBe(true)
})
