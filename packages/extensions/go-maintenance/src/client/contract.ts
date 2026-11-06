/**
 * Shapes shared by the maintenance Settings page and its Remote hop.
 * They mirror `src/types.ts` on the Host side; the client bundle never imports
 * Host code, so the contract is declared once here.
 */

/** Category a clean targets; `all` clears every category in one pass. */
export type MaintenanceTarget = 'projections' | 'sessions' | 'attachments' | 'all'

/** What a clean would reclaim, per category. */
export interface MaintenanceReport {
  /** Checkpoint records whose Session the store no longer lists. */
  readonly projections: { readonly count: number }
  /** Session directories no listed header names. */
  readonly sessions: { readonly count: number; readonly bytes: number }
  /** Image objects no surviving Session log references. */
  readonly attachments: { readonly count: number; readonly bytes: number }
}

/** What a clean actually removed. */
export interface MaintenanceOutcome {
  /** Removed record counts per category. */
  readonly removed: { readonly projections: number; readonly sessions: number; readonly attachments: number }
  /** Bytes freed on disk; projection records are counted as records only. */
  readonly freedBytes: number
}

/** Callable surface the section component receives through `inject`. */
export interface MaintenanceInjected {
  /** Count what a clean would reclaim. */
  readonly scan: () => Promise<MaintenanceReport>
  /** Remove one category, or every category for `'all'`. */
  readonly clean: (target: MaintenanceTarget) => Promise<MaintenanceOutcome>
}
