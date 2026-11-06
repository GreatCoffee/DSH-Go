/**
 * DSH-Go storage maintenance, browser half: one Settings section listing the
 * leftovers a deleted Session can leave behind and clearing them on request.
 * Nothing scans on its own — on a long-lived install a boot-time sweep would
 * cost more than the feature saves, so the buttons here drive everything.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: the generated ClientRemote augmentation that types `remote.goMaintenance`.
import type {} from '@deepseek-ai/dsh-go-maintenance/remote'
import type { MaintenanceInjected } from './contract.ts'
import { MaintenanceSection } from './MaintenanceSection.tsx'
import { en, NS, zh } from './locales.ts'

/** Required services: the settings ledger, copy, and the maintenance Remote. */
export const inject = ['slots', 'locale', 'remote', 'remote.goMaintenance']

/**
 * Client plugin body: register the dictionaries and contribute the Settings
 * section whose buttons drive the Host scan and clean.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'go-maintenance: dictionaries')
  const t = ctx.locale.bind(NS)

  const injected = (): MaintenanceInjected => ({
    scan: async () => {
      const result = await ctx.remote.goMaintenance.scan()
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
      return result.value
    },
    clean: async (target) => {
      const result = await ctx.remote.goMaintenance.clean({ target })
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
      return result.value
    },
  })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'maintenance',
    order: 60,
    label: () => t('nav'),
    locale: NS,
    inject: injected,
  }, MaintenanceSection))
}
