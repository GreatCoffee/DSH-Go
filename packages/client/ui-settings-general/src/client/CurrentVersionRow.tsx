/** Installed release version in General Settings for Web and Desktop. */
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './CurrentVersionRow.module.css'

/** Build identity injected by the shell; a portable DSH-Go build names the commit it was assembled from. */
export interface CurrentVersionRowInjected {
  readonly build?: string | undefined
}

/**
 * Render the version embedded by the client build; partial builds without metadata omit the row.
 * @param props - runtime share, injected build identity, and localized copy.
 * @returns the current release label, or nothing when build metadata is absent.
 */
export function CurrentVersionRow(
  { t, build }: PropsRuntime<'settings.general.item'> & PropsLocale<'settings'> & InjectFace<CurrentVersionRowInjected>,
) {
  const version = process.env.DSH_CLIENT_VERSION
  if (version === undefined) return null
  return <div className={css.row}>{build === undefined
    ? t('general.currentVersion', { version })
    : t('general.currentVersionBuild', { version, build })}</div>
}
