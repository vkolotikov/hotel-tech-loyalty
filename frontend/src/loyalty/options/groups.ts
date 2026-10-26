import type { Hue } from '../ui/sections'
import type { Way } from './types'

/**
 * "Ways to earn" in three sections (design pass, owner 2026-10-26: "colours, icons … not to lose in the app"): how
 * members earn, the bonuses they are given, and the programme's rules. Presentation only — the ways, their order and
 * their fields stay the server's (ProgrammeOptions::WAYS); a way the workspace does not know goes under More, in the
 * server's order. Each section wears its colour family (loyalty.css, data-hue).
 */

export type WayGroup = 'earn' | 'bonus' | 'rule' | 'more'

export const WAY_GROUPS: Record<string, Exclude<WayGroup, 'more'>> = {
  earn_rate: 'earn',
  points_on_spend: 'earn',
  check_in: 'earn',
  desk_earn: 'earn',
  stamp_card: 'earn',
  cashback: 'earn',
  welcome_bonus: 'bonus',
  birthday_bonus: 'bonus',
  referrals: 'bonus',
  points_expiry: 'rule',
  tier_progress: 'rule',
}

export const GROUP_ORDER: readonly WayGroup[] = ['earn', 'bonus', 'rule', 'more']

/** A section's colour family. */
export const GROUP_HUE: Record<WayGroup, Hue> = { earn: 'earn', bonus: 'bonus', rule: 'rule', more: 'offer' }

export const groupOf = (way: string): WayGroup => WAY_GROUPS[way] ?? 'more'

/** The ways by section, in the sections' order and the server's order within each; an empty section is left out. */
export function groupsOf(ways: readonly Way[]): { group: WayGroup; ways: Way[] }[] {
  return GROUP_ORDER
    .map(group => ({ group, ways: ways.filter(w => groupOf(w.key) === group) }))
    .filter(g => g.ways.length > 0)
}

/** The page's tabs (owner 2026-10-26, "additional tabs"): the overview, then one per section that has ways. */
export type OptionsTab = 'overview' | WayGroup

export function tabsOf(ways: readonly Way[]): OptionsTab[] {
  return ['overview', ...groupsOf(ways).map(g => g.group)]
}

/**
 * The tab and the card an address names (`?tab=earn&way=check_in`): a way alone opens its section; a tab the page does
 * not have, or none, is the overview.
 */
export function pageFrom(search: string, ways: readonly Way[]): { tab: OptionsTab; way: string | null } {
  const params = new URLSearchParams(search)
  const way = params.get('way')
  const known = way !== null && ways.some(w => w.key === way) ? way : null
  const tabs = tabsOf(ways)
  const asked = params.get('tab')
  const tab = (tabs as string[]).includes(asked ?? '') ? (asked as OptionsTab) : known ? groupOf(known) : 'overview'
  return { tab, way: known && groupOf(known) === tab ? known : null }
}

/** The address of a tab, and of a card in it. */
export function searchOf(tab: OptionsTab, way?: string | null): string {
  const params = new URLSearchParams()
  if (tab !== 'overview') params.set('tab', tab)
  if (way) params.set('way', way)
  const out = params.toString()
  return out ? `?${out}` : ''
}
