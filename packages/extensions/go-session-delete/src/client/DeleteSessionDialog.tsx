/** Permanent-delete confirmation for the Session row menu. */
import { useState } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsHooks, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { DeleteSessionInjected, DeleteSessionRequest } from './contract.ts'
import css from './DeleteSessionDialog.module.css'
import { NS } from './locales.ts'

/** Full browser props of the `shell.overlay` entry: runtime share, locale seat, and injected delete face. */
export type DeleteSessionDialogProps =
  PropsRuntime<'shell.overlay'>
  & PropsLocale<typeof NS>
  & Omit<DeleteSessionInjected, 'hooks'>
  & PropsHooks<DeleteSessionInjected['hooks']>

/**
 * The `shell.overlay` entry: nothing while no confirmation is pending,
 * otherwise one dialog per request (keyed by the Session). Confirming asks the
 * Host to delete the Session permanently; cancelling leaves it in place.
 * @param props - the request hook, its settlement, the delete hop, and the locale seat.
 * @returns the open dialog, or null.
 */
export function DeleteSessionDialog({
  useDeleteRequest, settleDeleteSession, deleteSession, t,
}: DeleteSessionDialogProps) {
  const request = useDeleteRequest(pending => pending)
  if (request === null) return null
  return (
    <DeleteSessionForm
      key={request.sessionId}
      request={request}
      deleteSession={deleteSession}
      onSettle={settleDeleteSession}
      t={t}
    />
  )
}

/** One request's dialog: in-flight and error state die with it. */
function DeleteSessionForm({ request, deleteSession, onSettle, t }: {
  request: DeleteSessionRequest
  deleteSession: DeleteSessionInjected['deleteSession']
  onSettle: () => void
  t: DeleteSessionDialogProps['t']
}) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const close = () => {
    if (deleting) return
    onSettle()
  }
  const confirm = () => {
    setDeleting(true)
    setError(null)
    deleteSession(request.sessionId).then(() => {
      setDeleting(false)
      onSettle()
    }).catch((reason: unknown) => {
      setDeleting(false)
      setError(reason instanceof Error ? reason.message : String(reason))
    })
  }
  const feedback = deleting || error !== null
    ? (
      <>
        {deleting && <div className={css.status} role="status">{t('confirm.pending')}</div>}
        {error !== null && <div className={css.error} role="alert">{error}</div>}
      </>
    )
    : undefined
  return (
    <Modal
      open
      onClose={close}
      closeLabel={t('confirm.cancel')}
      title={t('confirm.title')}
      tone="warning"
      description={t('confirm.description', { title: request.displayTitle })}
      footer={(
        <>
          <Button variant="outline" data-modal-autofocus disabled={deleting} onClick={close}>
            {t('confirm.cancel')}
          </Button>
          <Button
            variant="outline"
            className={css.deleteAction}
            disabled={deleting}
            onClick={confirm}
          >
            {t('confirm.action')}
          </Button>
        </>
      )}
    >
      {feedback}
    </Modal>
  )
}
