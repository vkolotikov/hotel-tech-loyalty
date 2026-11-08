import type { Bootstrap } from '../lib/types'

/**
 * HexaTech Time Planner's areas, in the side panel's order and groups (2026-11-09): My day; Planning (the day and week
 * boards, the backlog and pool); People (the team, their skills and knowledge); Reports (insights); Set up.
 * Each area has its address, whether the phone's top bar has it, and its group (an i18n key under time.nav.groups).
 */
export type AreaKey = 'today' | 'plan' | 'backlog' | 'team' | 'insights' | 'settings'

export type AreaGroup = 'planning' | 'people' | 'reports' | 'setup'

export interface AreaDef { key: AreaKey; to: string; end: boolean; phone: boolean; group?: AreaGroup }

export const AREAS: readonly AreaDef[] = [
  { key: 'today', to: '/time', end: true, phone: true },
  { key: 'plan', to: '/time/plan', end: false, phone: true, group: 'planning' },
  { key: 'backlog', to: '/time/backlog', end: false, phone: true, group: 'planning' },
  { key: 'team', to: '/time/team', end: false, phone: false, group: 'people' },
  { key: 'insights', to: '/time/insights', end: false, phone: true, group: 'reports' },
  { key: 'settings', to: '/time/settings', end: false, phone: false, group: 'setup' },
]

/** Which area an address belongs to (the breadcrumb, the current card). */
export function areaOf(pathname: string): AreaKey {
  const segment = /^\/time\/([a-z]+)/.exec(pathname)?.[1]
  return (AREAS.find(a => a.key === segment)?.key) ?? 'today'
}

/** What waits in an area, from the bootstrap: the count beside its name (none at zero). */
export function countOf(area: AreaKey, boot: Bootstrap | undefined): number | undefined {
  if (!boot) return undefined
  if (area === 'today') return boot.counts.today_open + boot.counts.overdue
  if (area === 'backlog') return boot.counts.pool
  return undefined
}
