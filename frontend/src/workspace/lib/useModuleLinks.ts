import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '../../stores/authStore'
import { planModules, type WorkspaceName } from './landing'

/** The workspaces' names as products (brand names: not translated). */
const PRODUCT_NAMES: Record<WorkspaceName, string> = {
  appointments: 'HexaTech Appointments',
  loyalty: 'HexaTech Loyalty',
  content: 'HexaTech Content',
  crm: 'HexaTech CRM',
  time: 'HexaTech Time Planner',
}

export interface ModuleLink { to: string; label: string }

/** What an organisation on modules gets in a workspace's Settings instead of "Full admin": its other workspaces, then Team and Plan & products. */
export function moduleLinksFor(modules: WorkspaceName[] | null, current: WorkspaceName, planLabel: string, teamLabel = 'Team'): ModuleLink[] {
  if (!modules) return []
  return [
    ...modules.filter(name => name !== current).map(name => ({ to: `/${name}`, label: PRODUCT_NAMES[name] })),
    { to: '/account/team', label: teamLabel },
    { to: '/account/products', label: planLabel },
  ]
}

/**
 * For a workspace's frame (owner 2026-11-02): whether the signed-in organisation is on modules (no full admin, so no
 * "Full admin" link), and the links it gets instead. Read from the sign-in answer the store keeps.
 */
export function useModuleLinks(current: WorkspaceName): { onModules: boolean; links: ModuleLink[] } {
  const { t } = useTranslation()
  // A string, so the store hands back the same value while nothing changed (a fresh array would re-render forever).
  const key = useAuthStore(s => (planModules(s.user) ?? []).join(','))
  const planLabel = t('workspace.shell.plan', 'Plan & products')
  const teamLabel = t('workspace.shell.team', 'Team')
  return useMemo(() => {
    const modules = key === '' ? null : (key.split(',') as WorkspaceName[])
    return { onModules: modules !== null, links: moduleLinksFor(modules, current, planLabel, teamLabel) }
  }, [key, current, planLabel, teamLabel])
}
