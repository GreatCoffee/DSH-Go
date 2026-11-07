/**
 * DSH-Go permanent Session deletion, browser half: one entry under Archive in
 * the Session row context menu, its confirmation dialog in `shell.overlay`,
 * and the Workspace-navigation delete hop the dialog calls.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls the `ctx.uiWorkspace` Context merge (Workspace navigation).
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ContextMenuTargetMap } from '@deepseek-ai/dsh-client-ui-context-menu/client'
import type {} from '@deepseek-ai/dsh-client-ui-context-menu/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { DeleteSessionDialog } from './DeleteSessionDialog.tsx'
import type { DeleteSessionInjected, DeleteSessionRequest } from './contract.ts'
import { en, NS, zh } from './locales.ts'

/** Required services: the menu ledger, the overlay slot, copy, and the Workspace navigation. */
export const inject = ['contextMenus', 'slots', 'locale', 'uiWorkspace']

/**
 * Client plugin body: register the dictionaries, contribute the delete entry
 * one order step below Archive in the Session menu, and seat the confirmation
 * dialog in the frame-wide overlay.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'go-session-delete: dictionaries')
  const t = ctx.locale.bind(NS)
  const deleteRequest = createSnapshotStore<DeleteSessionRequest | null>(null)

  ctx.effect(() => ctx.contextMenus.register({
    id: 'session.delete',
    target: 'session',
    order: 650,
    observe: () => [ctx.locale],
    resolve: (target: ContextMenuTargetMap['session']) => [{
      id: 'delete',
      label: t('menu.deleteSession'),
      icon: { key: 'workspace.delete' },
      danger: true,
      separatorBefore: false,
      // Archive also lives in the footer group; sharing it keeps this entry below Archive.
      afterContent: true,
      run: () => { deleteRequest.set({ sessionId: target.sessionId, displayTitle: target.displayTitle }) },
    }],
  }), 'go-session-delete: delete menu')

  const deleteSession = async (sessionId: SessionId): Promise<void> => {
    // Deletion goes through the navigation seam, not the Remote directly: a
    // deleted current view also clears back to the Workspace home there.
    try {
      await ctx.uiWorkspace.deleteSession(sessionId)
      return
    } catch (reason: unknown) {
      // Client plugin bundles share no error-class identity; the name decides.
      const rpc = reason instanceof Error && reason.name === 'WorkspaceDeleteSessionError'
        ? (reason as { rpcError?: { code?: string; message?: string } }).rpcError
        : undefined
      if (rpc === undefined) throw new Error(t('confirm.error', { message: String(reason) }))
      if (rpc.code === 'workspace/session-active') throw new Error(t('confirm.error.active'))
      if (rpc.code === 'session/not-found') throw new Error(t('confirm.error.missing'))
      throw new Error(t('confirm.error', { message: `${rpc.code}: ${rpc.message}` }))
    }
  }

  const deleteDialogInjected = (): DeleteSessionInjected => ({
    hooks: { deleteRequest },
    settleDeleteSession: () => { deleteRequest.set(null) },
    deleteSession,
  })

  ctx.slots.inject('shell.overlay', function* () {
    yield ctx.slots.register({
      name: 'shell.overlay', id: 'go-session-delete.dialog', locale: NS, inject: deleteDialogInjected,
    }, DeleteSessionDialog)
  })
}
