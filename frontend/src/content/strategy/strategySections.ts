import type { StrategyOutput } from '../lib/types'
import { safeOutput, strings } from './strategyMath'
/** URL navigation includes only sections present in this saved document (older strategies can be partial). */
export function availableSections(raw: StrategyOutput | null, pillars: readonly { name: string }[]): string[] {
  const o = safeOutput(raw)
  const available: [string, unknown][] = [
    ['summary', o.brand_summary || strings(o.assumptions).length], ['positioning', o.positioning_narrative], ['audiences', o.audience_map?.length],
    ['pillars', o.content_pillars?.some(p => p?.name?.trim()) || pillars.length],
    ['mix', Object.values(o.content_mix ?? {}).some(n => typeof n === 'number' && n > 0)],
    ['rhythm', Object.keys(o.weekly_rhythm ?? {}).length], ['platforms', Object.keys(o.platform_strategy ?? {}).length],
    ['engagement', o.engagement_strategy], ['conversion', o.conversion_strategy], ['visual', o.visual_direction],
    ['themes', strings(o.monthly_themes).length || o.campaign_ideas?.length], ['examples', o.example_posts?.length],
    ['risks', strings(o.risks).length], ['opportunities', strings(o.opportunities).length], ['missing', strings(o.missing_information).length], ['next', strings(o.next_actions).length],
  ]
  return available.filter(([, present]) => Boolean(present)).map(([key]) => key)
}
