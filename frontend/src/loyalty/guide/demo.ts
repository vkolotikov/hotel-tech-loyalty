import type { MemberRow, TierRef } from '../lib/types'
import type { ScanAnswer, TierBadge } from '../scan/scanApi'
import { DEMO_WORDS } from './words'

/**
 * "Try a scan" (the Guide, owner 2026-10-26): four made-up answers a door can give, read by the scan screen's own
 * verdict (scan/verdict.ts), so the Guide shows exactly the band, the words and the colours staff will see. The venue's
 * own lowest and highest tiers are used when it has two, so the example speaks its language. Nothing is sent or kept.
 */

export type Scenario = 'welcome' | 'ending' | 'wrong_tier' | 'ended'

export const SCENARIOS: readonly Scenario[] = ['welcome', 'ending', 'wrong_tier', 'ended']

/** A word of the demo in the reader's language. */
export type DemoSay = (key: keyof typeof DEMO_WORDS) => string

/** The venue's lowest and highest active tiers, or two named in the reader's language when it has fewer than two. */
export function demoTiers(tiers: readonly TierRef[], say: DemoSay): { low: TierBadge; top: TierBadge } {
  const active = tiers.filter(t => t.is_active).slice().sort((a, b) => a.min_points - b.min_points || a.id - b.id)
  if (active.length >= 2) {
    const [low, top] = [active[0], active[active.length - 1]]
    return { low: { id: low.id, name: low.name, color: low.color }, top: { id: top.id, name: top.name, color: top.color } }
  }
  return { low: { id: -1, name: say('low_tier'), color: '#9ca3af' }, top: { id: -2, name: say('top_tier'), color: '#c9a227' } }
}

/** The answer the scan screen would get for a scenario, at a place that admits only the top tier. */
export function demoAnswer(scenario: Scenario, tiers: { low: TierBadge; top: TierBadge }, say: DemoSay): ScanAnswer {
  const tier = scenario === 'wrong_tier' ? tiers.low : tiers.top
  const member: MemberRow = {
    id: 0, name: say('name'), email: null, phone: null, member_number: 'DEMO-0001', tier_id: tier.id, points: 1250, lifetime_points: 4200,
    is_active: true, joined_at: null, last_activity_at: null,
  }
  const place = { id: 0, name: say('place') }
  const benefits = [
    { name: say('benefit_drink'), value: null, category: null },
    { name: say('benefit_priority'), value: null, category: null },
  ]
  const base = { valid_until: null, expires_in_days: null, tier, allowed_tiers: [] as string[], place }
  switch (scenario) {
    case 'welcome': return { member, benefits, verdict: { ...base, granted: true, reason: 'welcome' } }
    case 'ending': return { member, benefits, verdict: { ...base, granted: true, reason: 'welcome', expires_in_days: 3 } }
    case 'wrong_tier': return { member, benefits, verdict: { ...base, granted: false, reason: 'tier_not_allowed', allowed_tiers: [tiers.top.name] } }
    case 'ended': return { member, benefits, verdict: { ...base, granted: false, reason: 'expired' } }
  }
}
