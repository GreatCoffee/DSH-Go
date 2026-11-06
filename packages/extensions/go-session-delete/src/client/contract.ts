/** Package-private contract shared by the Session menu entry and its overlay dialog. */

import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** One confirmation the menu asked for; held until the dialog consumes or cancels it. */
export interface DeleteSessionRequest {
  /** Session to delete permanently. */
  readonly sessionId: SessionId
  /** The row's display title, named in the dialog. */
  readonly displayTitle: string
}

/** Delete-dialog share: the pending confirmation, its settlement, and the delete hop. */
export interface DeleteSessionInjected {
  hooks: {
    /** The confirmation asked for, until the dialog consumes or cancels it. */
    deleteRequest: HostObservable<DeleteSessionRequest | null>
  }
  /** Consume or cancel the pending confirmation. */
  settleDeleteSession: () => void
  /** Permanently delete one Session; rejects with a localized message on a Host refusal. */
  deleteSession: (sessionId: SessionId) => Promise<void>
}
