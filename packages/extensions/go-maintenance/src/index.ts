/**
 * DSH-Go storage maintenance, Host half: counts and clears the leftovers a
 * deleted Session can leave behind — checkpoints no workspace references, log
 * directories no workspace references, and image objects no surviving log
 * mentions. Liveness is always the workspace answer: a log the backend still
 * lists but no workspace owns is residue, not a Session.
 *
 * Everything here is on demand. A boot-time sweep would cost more the longer
 * an installation lives, so the Settings page drives these two Remotes
 * instead. Nothing is guessed: a category whose truth cannot be established
 * (an unreadable Session log, a backend without a directory) reports nothing
 * and is never cleared.
 * @module @deepseek-ai/dsh-go-maintenance
 */

import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import type {} from '@deepseek-ai/dsh-session-persistence'
import type {} from '@deepseek-ai/dsh-session-projection-cache'
import type {} from '@deepseek-ai/dsh-workspace'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import { collectLogDigests, hasReferences, orphanDirectories, orphanObjects, type ScannedFile } from './scan.ts'
import type { MaintenanceOutcome, MaintenanceReport, MaintenanceTarget } from './types.ts'

/**
 * What the three scans found, plus the ids each kind of question uses.
 *
 * `live` is the workspace answer — every Session some workspace shows,
 * archives, or pins. `stored` is the disk answer — every log the backend still
 * lists. They differ exactly by the residue this page exists to clear: a
 * conversation the UI can no longer reach still has a log on disk.
 */
interface Survey {
  readonly live: ReadonlySet<SessionId>
  readonly stored: ReadonlySet<SessionId>
  readonly projections: readonly SessionId[]
  readonly directories: readonly ScannedFile[]
  readonly objects: readonly ScannedFile[]
}

/**
 * Storage maintenance Remote: the Settings page's scan and clean.
 */
export default class StorageMaintenance extends TypertRemoteService {
  static inject = ['sessionPersistence', 'sessionProjectionCache', 'workspaceRegistry']

  constructor(ctx: Context) {
    super(ctx, 'goMaintenance')
  }

  /**
   * Count what a clean would reclaim, without removing anything.
   * @returns per-category counts and byte totals.
   */
  @Remote('scan')
  async remoteScan(): Promise<MaintenanceReport> {
    return report(await this.survey())
  }

  /**
   * Remove one category, or every category for `all`.
   * @param request - the category to clear.
   * @returns what was removed and how many bytes that freed.
   */
  @Remote('clean')
  async remoteClean(request: { readonly target: MaintenanceTarget }): Promise<MaintenanceOutcome> {
    const survey = await this.survey()
    const targets = request.target === 'all'
      ? (['projections', 'sessions', 'attachments'] as const)
      : [request.target]
    let projections = 0
    let sessions = 0
    let attachments = 0
    let freedBytes = 0

    for (const target of targets) {
      if (target === 'projections') {
        projections = await this.ctx.sessionProjectionCache.pruneOrphans(survey.live)
        continue
      }
      const files = target === 'sessions' ? survey.directories : survey.objects
      for (const file of files) {
        if (target === 'sessions' && await this.isRunning(file.id)) continue
        await rm(file.path, { recursive: true, force: true })
        if (target === 'sessions') sessions += 1
        else attachments += 1
        freedBytes += file.bytes
      }
    }

    const summary = `cleared ${String(projections)} checkpoint record(s), ${String(sessions)} `
      + `directory(ies), and ${String(attachments)} attachment(s), freeing ${String(freedBytes)} byte(s)`
    this.ctx.logger.info(`storage maintenance: ${summary}`)
    // `ctx.logger` never reaches `portable/logs`; console output does, and the
    // whole point of this line is to be readable after the fact.
    console.log(`[dsh-go-maintenance] ${summary}`)
    return { removed: { projections, sessions, attachments }, freedBytes }
  }

  /**
   * Whether a Session still has work running, in which case its log must stay.
   * @param id - session id the artifact names, when it names one.
   * @returns `true` when some activity provider reports work for the id.
   */
  private async isRunning(id: string | undefined): Promise<boolean> {
    if (id === undefined || id === '') return false
    const sessionId = SessionId(id)
    const activity = await this.ctx.waterfall(
      'workspace/session-activity',
      { sessionId },
      () => Promise.resolve([]),
    )
    return activity.length > 0
  }

  /** Collect the orphans behind every category, once per call. */
  private async survey(): Promise<Survey> {
    const snapshots = await this.ctx.sessionPersistence.list()
    const stored = new Set(snapshots.map(snapshot => snapshot.header.id))
    const live = this.liveSessionIds()
    // No workspace references anything: that is a registry which has not
    // loaded, not an installation to strip bare, so report nothing.
    const reachable = hasReferences(live)
    const root = this.ctx.sessionPersistence.root
    const names = new Set<string>([...live].map(String))
    const projections = reachable ? await this.ctx.sessionProjectionCache.orphanIds(live) : []
    const directories = reachable && root !== undefined ? await orphanDirectories(root, names) : []
    const objects = await this.orphanAttachments(stored)
    return { live, stored, projections, directories, objects }
  }

  /**
   * Every Session some workspace still shows, archives, or pins.
   *
   * Liveness is the workspace answer, not the store's: a log the backend still
   * lists but no workspace references is exactly the residue this page clears,
   * and counting it as live made the scan report zero forever.
   * @returns the ids a workspace still owns.
   */
  private liveSessionIds(): Set<SessionId> {
    const live = new Set<SessionId>()
    const registry = this.ctx.workspaceRegistry
    for (const workspace of registry.list()) {
      for (const id of workspace.sessionIds) live.add(id)
    }
    for (const id of registry.archivedSessionIds) live.add(id)
    for (const id of registry.pinnedSessionIds) live.add(id)
    return live
  }

  /**
   * Image objects no surviving Session log references.
   *
   * A log that cannot be read proves nothing, so an unreadable log (or a
   * store without a directory) reports no orphan rather than freeing a blob
   * another Session may still show.
   * @param ids - ids the store still lists.
   */
  private async orphanAttachments(ids: ReadonlySet<SessionId>): Promise<ScannedFile[]> {
    const referenced = await this.referencedDigests(ids)
    if (referenced === undefined) return []
    return await orphanObjects(join(dshHomePath('attachments', 'v1'), 'objects'), referenced)
  }

  /**
   * Every attachment digest the surviving Session logs mention.
   * @param ids - ids the store still lists.
   * @returns the referenced digests, or `undefined` when a log could not be read.
   */
  private async referencedDigests(ids: ReadonlySet<SessionId>): Promise<Set<string> | undefined> {
    const digests = new Set<string>()
    for (const id of ids) {
      let handle
      try {
        handle = await this.ctx.sessionPersistence.open(id, 'read')
      } catch (_absent: unknown) {
        // A Session listed and then removed between the two calls owns no log.
        continue
      }
      try {
        await collectLogDigests(handle, digests)
      } catch (_unreadable: unknown) {
        return undefined
      } finally {
        await handle.close()
      }
    }
    return digests
  }
}

/**
 * Shape one survey into the report the page renders.
 * @param survey - the collected orphans.
 * @returns counts and byte totals per category.
 */
function report(survey: Survey): MaintenanceReport {
  const sessions = survey.directories.reduce((total, file) => total + file.bytes, 0)
  const attachments = survey.objects.reduce((total, file) => total + file.bytes, 0)
  return {
    projections: { count: survey.projections.length },
    sessions: { count: survey.directories.length, bytes: sessions },
    attachments: { count: survey.objects.length, bytes: attachments },
  }
}

/** Re-export the Host-side shapes the generated Typert face publishes. */
export type { MaintenanceOutcome, MaintenanceReport, MaintenanceTarget } from './types.ts'
