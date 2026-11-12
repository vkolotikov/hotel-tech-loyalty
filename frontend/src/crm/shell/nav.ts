import type { Bootstrap } from '../lib/types'

/**
 * HexaTech CRM's areas, in the side panel's order and groups (2026-11-07, round 2: "more logical … structured
 * sections"): Today; Conversations (the website chat); Sales (as the main platform's Leads and Deals); Reports; Set up.
 * Each area has its address, whether the phone's top bar has it, and its group (an i18n key under crm.nav.groups).
 */
export type AreaKey = 'today' | 'inbox' | 'visitors' | 'leads' | 'deals' | 'contacts' | 'tasks' | 'insights' | 'assistant' | 'widget' | 'integrations' | 'settings'

export type AreaGroup = 'conversations' | 'sales' | 'reports' | 'setup'

export interface AreaDef { key: AreaKey; to: string; end: boolean; phone: boolean; group?: AreaGroup }

export const AREAS: readonly AreaDef[] = [
  { key: 'today', to: '/crm', end: true, phone: true },
  { key: 'inbox', to: '/crm/inbox', end: false, phone: true, group: 'conversations' },
  { key: 'visitors', to: '/crm/visitors', end: false, phone: false, group: 'conversations' },
  { key: 'leads', to: '/crm/leads', end: false, phone: true, group: 'sales' },
  { key: 'deals', to: '/crm/deals', end: false, phone: false, group: 'sales' },
  { key: 'contacts', to: '/crm/contacts', end: false, phone: false, group: 'sales' },
  { key: 'tasks', to: '/crm/tasks', end: false, phone: true, group: 'sales' },
  { key: 'insights', to: '/crm/insights', end: false, phone: false, group: 'reports' },
  { key: 'assistant', to: '/crm/assistant', end: false, phone: false, group: 'setup' },
  { key: 'widget', to: '/crm/widget', end: false, phone: false, group: 'setup' },
  { key: 'integrations', to: '/crm/integrations', end: false, phone: false, group: 'setup' },
  { key: 'settings', to: '/crm/settings', end: false, phone: false, group: 'setup' },
]

/** Which area an address belongs to (the breadcrumb, the current card); the old board address is Leads'. */
export function areaOf(pathname: string): AreaKey {
  const segment = /^\/crm\/([a-z]+)/.exec(pathname)?.[1]
  if (segment === 'pipeline') return 'leads'
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
