import { Context } from '@deepseek-ai/cordis'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { MenuRegistry } from '@deepseek-ai/dsh-client-ui-context-menu/src/client/registry.ts'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { expect, it, onTestFinished, vi } from 'vitest'
import type { DeleteSessionInjected } from '../src/client/contract.ts'
import { apply, inject } from '../src/client/index.ts'

/**
 * Mount the browser half over a real menu registry, locale runtime, and
 * overlay stub, with a stub `uiWorkspace` navigation the test drives.
 * @returns the mounted fiber, the overlay entries the plugin seated, and the stub navigation.
 */
function bench() {
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  const registry = new MenuRegistry(vi.fn())
  onTestFinished(() => { registry.dispose() })
  ctx.provide('contextMenus', { register: registry.register.bind(registry) } as never)
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  const registered: { readonly name: string; readonly id?: string; readonly locale?: string
    readonly inject?: () => DeleteSessionInjected }[] = []
  ctx.provide('slots', {
    // The plugin hands `inject` a generator; a real slots service drives it, so the stub does too.
    inject: (_name: string, register: () => Generator) => {
      const iterator = register()
      iterator.next()
      return () => { iterator.return?.(undefined) }
    },
    register: (entry: { readonly name: string; readonly id?: string; readonly locale?: string
      readonly inject?: () => DeleteSessionInjected }) => {
      registered.push(entry)
      return () => {}
    },
  } as never)
  const deleteSession = vi.fn(async (_sessionId: SessionId) => {})
  ctx.provide('uiWorkspace', { deleteSession } as never)
  const fiber = ctx.plugin({ inject, apply })
  const target = { kind: 'session' as const, value: { sessionId: SessionId('gone'), displayTitle: 'Doomed' } }
  return { ctx, fiber, registry, locale, registered, deleteSession, target }
}

it('adds one dangerous delete row in the footer group, below Archive and without a shortcut', async () => {
  const b = bench()
  await b.fiber.await()
  b.locale.setLocale('zh')
  const menu = b.registry.resolve(b.target)
  onTestFinished(() => menu.dispose())
  const views = menu.source.getSnapshot()
  expect(views).toEqual([expect.objectContaining({
    id: 'session.delete/delete',
    label: '删除会话',
    danger: true,
    icon: expect.objectContaining({ key: 'workspace.delete' }),
    separatorBefore: false,
    afterContent: true,
  })])
  // The person asked for a menu entry only: no keyboard shortcut rides with it.
  expect(views.some(view => view.commandId !== undefined)).toBe(false)
})

it('asks for confirmation before deleting and settles the request either way', async () => {
  const b = bench()
  await b.fiber.await()
  b.locale.setLocale('en')
  expect(b.registered.filter(entry => entry.name === 'shell.overlay')).toEqual([
    expect.objectContaining({ id: 'go-session-delete.dialog', locale: 'go-session-delete' }),
  ])
  const dialog = b.registered[0]?.inject?.()
  expect(dialog).toBeDefined()
  expect(dialog?.hooks.deleteRequest.getSnapshot()).toBeNull()

  // Choosing the row only asks; nothing is deleted until the dialog confirms.
  const menu = b.registry.resolve(b.target)
  onTestFinished(() => menu.dispose())
  menu.select('session.delete/delete')
  expect(b.deleteSession).not.toHaveBeenCalled()
  expect(dialog?.hooks.deleteRequest.getSnapshot()).toEqual({ sessionId: 'gone', displayTitle: 'Doomed' })

  await dialog?.deleteSession(SessionId('gone'))
  expect(b.deleteSession).toHaveBeenCalledWith(SessionId('gone'))
  dialog?.settleDeleteSession()
  expect(dialog?.hooks.deleteRequest.getSnapshot()).toBeNull()
})

it('turns a refusal carried by the navigation error into a localized message', async () => {
  const b = bench()
  await b.fiber.await()
  b.locale.setLocale('zh')
  const dialog = b.registered[0]?.inject?.()
  // Client plugin bundles share no error-class identity, so the name decides.
  b.deleteSession.mockRejectedValueOnce(Object.assign(
    new Error('workspace session deletion failed: workspace/session-active: still running'),
    { name: 'WorkspaceDeleteSessionError', rpcError: { code: 'workspace/session-active', message: 'still running' } },
  ))
  await expect(dialog?.deleteSession(SessionId('gone')))
    .rejects.toThrow('该会话仍在运行，请先停止其任务后再删除。')
})

it('turns a missing-session refusal into a localized message', async () => {
  const b = bench()
  await b.fiber.await()
  b.locale.setLocale('zh')
  const dialog = b.registered[0]?.inject?.()
  b.deleteSession.mockRejectedValueOnce(Object.assign(
    new Error('workspace session deletion failed: session/not-found: gone'),
    { name: 'WorkspaceDeleteSessionError', rpcError: { code: 'session/not-found', message: 'gone' } },
  ))
  await expect(dialog?.deleteSession(SessionId('gone')))
    .rejects.toThrow('该会话已不存在，可能已被删除。')
})
