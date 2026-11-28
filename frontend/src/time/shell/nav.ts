import type { Bootstrap } from '../lib/types'

/**
 * HexaTech Time Planner's areas, in the side panel's order and groups (2026-11-09): My day; Planning (the day and week
 * boards, the backlog and pool); AI (the assistant and the coach, 2026-11-14); People (the team, their skills and
 * knowledge); Reports (insights); Set up.
 * Each area has its address, whether the phone's top bar has it, and its group (an i18n key under time.nav.groups).
 * Achievements (recognition, 2026-11-28) sits under My day, outside the groups, and goes when the organisation switched
 * recognition off; on a phone it is in the menu (the top bar is full) and My day's band leads to it.
 */
export type AreaKey = 'today' | 'wins' | 'plan' | 'backlog' | 'assistant' | 'coach' | 'team' | 'insights' | 'settings'

export type AreaGroup = 'planning' | 'ai' | 'people' | 'reports' | 'setup'

export interface AreaDef { key: AreaKey; to: string; end: boolean; phone: boolean; group?: AreaGroup }

export const AREAS: readonly AreaDef[] = [
  { key: 'today', to: '/time', end: true, phone: true },
  { key: 'wins', to: '/time/wins', end: false, phone: false },
  { key: 'plan', to: '/time/plan', end: false, phone: true, group: 'planning' },
  { key: 'backlog', to: '/time/backlog', end: false, phone: true, group: 'planning' },
  // On a phone too (2026-11-14): staff plan their own day from their phones.
  { key: 'assistant', to: '/time/assistant', end: false, phone: true, group: 'ai' },
  { key: 'coach', to: '/time/coach', end: false, phone: false, group: 'ai' },
  { key: 'team', to: '/time/team', end: false, phone: false, group: 'people' },
  { key: 'insights', to: '/time/insights', end: false, phone: true, group: 'reports' },
  { key: 'settings', to: '/time/settings', end: false, phone: false, group: 'setup' },
]

/** The areas this organisation has: all of them, without Achievements once recognition is switched off. */
export function areasFor(boot: { settings: Pick<Bootstrap['settings'], 'recognition'> } | undefined): readonly AreaDef[] {
  return boot?.settings.recognition === 'off' ? AREAS.filter(area => area.key !== 'wins') : AREAS
}

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
