import type { Way } from './types'

/**
 * "Ways to earn" in three sections (design pass, owner 2026-10-26: "colours, icons … not to lose in the app"): how
 * members earn, the bonuses they are given, and the programme's rules. Presentation only — the ways, their order and
 * their fields stay the server's (ProgrammeOptions::WAYS); a way the workspace does not know goes under More, in the
 * server's order. Each section wears its colour family (loyalty.css, data-hue).
 */

export type WayGroup = 'earn' | 'bonus' | 'rule' | 'more'

export const WAY_GROUPS: Record<string, Exclude<WayGroup, 'more'>> = {
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
export const GROUP_HUE: Record<WayGroup, string> = { earn: 'earn', bonus: 'bonus', rule: 'rule', more: 'offer' }

export const groupOf = (way: string): WayGroup => WAY_GROUPS[way] ?? 'more'

/** The ways by section, in the sections' order and the server's order within each; an empty section is left out. */
export function groupsOf(ways: readonly Way[]): { group: WayGroup; ways: Way[] }[] {
  return GROUP_ORDER
    .map(group => ({ group, ways: ways.filter(w => groupOf(w.key) === group) }))
    .filter(g => g.ways.length > 0)
}
