import type { Bootstrap } from '../lib/types'

/** HexaTech CRM's areas, in the side panel's order: the address, its i18n key, and whether the phone's top bar has it. */
export type AreaKey = 'today' | 'inbox' | 'visitors' | 'leads' | 'pipeline' | 'contacts' | 'tasks' | 'assistant' | 'widget' | 'insights' | 'settings'

export interface AreaDef { key: AreaKey; to: string; end: boolean; phone: boolean }

export const AREAS: readonly AreaDef[] = [
  { key: 'today', to: '/crm', end: true, phone: true },
  { key: 'inbox', to: '/crm/inbox', end: false, phone: true },
  { key: 'visitors', to: '/crm/visitors', end: false, phone: false },
  { key: 'leads', to: '/crm/leads', end: false, phone: true },
  { key: 'pipeline', to: '/crm/pipeline', end: false, phone: false },
  { key: 'contacts', to: '/crm/contacts', end: false, phone: false },
  { key: 'tasks', to: '/crm/tasks', end: false, phone: true },
  { key: 'assistant', to: '/crm/assistant', end: false, phone: false },
  { key: 'widget', to: '/crm/widget', end: false, phone: false },
  { key: 'insights', to: '/crm/insights', end: false, phone: false },
  { key: 'settings', to: '/crm/settings', end: false, phone: false },
]

/** Which area an address belongs to (the breadcrumb, the current card). */
export function areaOf(pathname: string): AreaKey {
  const segment = /^\/crm\/([a-z]+)/.exec(pathname)?.[1]
  return (AREAS.find(a => a.key === segment)?.key) ?? 'today'
}

/** What waits in an area, from the bootstrap: the count beside its name in the side panel (none at zero). */
export function countOf(area: AreaKey, boot: Bootstrap | undefined): number | undefined {
  if (!boot) return undefined
  if (area === 'inbox') return boot.counts.chats_waiting
  if (area === 'leads') return boot.counts.leads_new
  if (area === 'tasks') return boot.counts.tasks_due
  return undefined
}
