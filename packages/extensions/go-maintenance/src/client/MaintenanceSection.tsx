/**
 * The maintenance settings page: one row per leftover category, each showing
 * what a clear would reclaim, with a per-row clear and one clear-all. Nothing
 * runs on its own — a long-lived install would pay for a scan on every start,
 * so the user asks for one here.
 */
import { useState } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { MaintenanceInjected, MaintenanceReport, MaintenanceTarget } from './contract.ts'
import styles from './MaintenanceSection.module.css'

/** Props the renderer binds for the maintenance page. */
export type MaintenanceSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'go-maintenance'>
  & InjectFace<MaintenanceInjected>

type T = MaintenanceSectionProps['t']

/** What is pending, so one button reports its own progress. */
type Pending = 'scan' | MaintenanceTarget | undefined

/**
 * Format a byte count for display.
 * @param t - the page's locale reader.
 * @param bytes - the count to render.
 * @returns the count with one decimal in MB or GB.
 */
function formatBytes(t: T, bytes: number): string {
  if (bytes < 1024) return t('bytes', { size: `${String(bytes)} B` })
  const megabytes = bytes / (1024 * 1024)
  if (megabytes < 1024) return t('bytes', { size: `${megabytes.toFixed(1)} MB` })
  return t('bytes', { size: `${(megabytes / 1024).toFixed(1)} GB` })
}

/**
 * Render the maintenance section.
 * @param props - runtime shell props, the section's copy, and the Remote face.
 * @returns the settings section element.
 */
export function MaintenanceSection({ t, scan, clean }: MaintenanceSectionProps) {
  const [report, setReport] = useState<MaintenanceReport | undefined>(undefined)
  const [pending, setPending] = useState<Pending>(undefined)
  const [error, setError] = useState<string | undefined>(undefined)
  const [note, setNote] = useState<string | undefined>(undefined)

  const runScan = async (): Promise<void> => {
    setPending('scan')
    setError(undefined)
    setNote(undefined)
    try {
      setReport(await scan())
    } catch (failure: unknown) {
      setError(t('scanError', { message: failure instanceof Error ? failure.message : String(failure) }))
    } finally {
      setPending(undefined)
    }
  }

  const runClean = async (target: MaintenanceTarget): Promise<void> => {
    setPending(target)
    setError(undefined)
    setNote(undefined)
    try {
      const outcome = await clean(target)
      setNote(t('freed', { size: formatBytes(t, outcome.freedBytes) }))
      setReport(await scan())
    } catch (failure: unknown) {
      setError(t('cleanError', { message: failure instanceof Error ? failure.message : String(failure) }))
    } finally {
      setPending(undefined)
    }
  }

  const rows: readonly { target: MaintenanceTarget; title: string; description: string; amount: string }[] =
    report === undefined
      ? []
      : [
          {
            target: 'projections',
            title: t('projections.title'),
            description: t('projections.description'),
            amount: t('count.records', { count: report.projections.count }),
          },
          {
            target: 'sessions',
            title: t('sessions.title'),
            description: t('sessions.description'),
            amount: `${t('count.records', { count: report.sessions.count })} · ${formatBytes(t, report.sessions.bytes)}`,
          },
          {
            target: 'attachments',
            title: t('attachments.title'),
            description: t('attachments.description'),
            amount: `${t('count.records', { count: report.attachments.count })} · ${formatBytes(t, report.attachments.bytes)}`,
          },
        ]

  const empty = report !== undefined
    && report.projections.count === 0
    && report.sessions.count === 0
    && report.attachments.count === 0

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h2 className={styles.title}>{t('title')}</h2>
          <p className={styles.description}>{t('description')}</p>
        </div>
        <div className={styles.actions}>
          <Button variant="outline" disabled={pending !== undefined} onClick={() => { void runScan() }}>
            {pending === 'scan' ? t('scanning') : t('scan')}
          </Button>
          <Button
            variant="outline"
            disabled={pending !== undefined || report === undefined || empty}
            onClick={() => { void runClean('all') }}
          >
            {pending === 'all' ? t('cleaning') : t('cleanAll')}
          </Button>
        </div>
      </header>

      {report === undefined
        ? null
        : empty
          ? <p className={styles.status}>{t('nothing')}</p>
          : (
            <ul className={styles.rows}>
              {rows.map(row => (
                <li key={row.target} className={styles.row}>
                  <div className={styles.rowText}>
                    <span className={styles.rowTitle}>{row.title}</span>
                    <span className={styles.rowDescription}>{row.description}</span>
                  </div>
                  <span className={styles.amount}>{row.amount}</span>
                  <Button
                    variant="outline"
                    disabled={pending !== undefined}
                    onClick={() => { void runClean(row.target) }}
                  >
                    {pending === row.target ? t('cleaning') : t('clean')}
                  </Button>
                </li>
              ))}
            </ul>
          )}

      {note === undefined ? null : <p role="status" className={styles.status}>{note}</p>}
      {error === undefined ? null : <p role="alert" className={styles.error}>{error}</p>}
    </div>
  )
}
