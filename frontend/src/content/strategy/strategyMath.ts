import type { PillarBalance, StrategyOutput, StrategySummary } from '../lib/types'

/** The strategy the page opens on: the active one, else the one being made, else the newest (the list is newest first). */
export function pickStrategy(list: readonly StrategySummary[]): StrategySummary | null {
  return list.find(s => s.status === 'active') ?? list.find(s => s.status === 'generating') ?? list[0] ?? null
}

export interface BalanceRow { id: number; name: string; posts: number; actual: number; target: number }

/** Each pillar's share of this month's posts against its share of the target weights, in whole percent. */
export function balanceRows(balance: PillarBalance): BalanceRow[] {
  const posts = balance.pillars.reduce((sum, p) => sum + p.posts, 0)
  const weights = balance.pillars.reduce((sum, p) => sum + (p.target_weight ?? 0), 0)
  return balance.pillars.map(p => ({
    id: p.id,
    name: p.name,
    posts: p.posts,
    actual: posts > 0 ? Math.round((p.posts / posts) * 100) : 0,
    target: weights > 0 ? Math.round(((p.target_weight ?? 0) / weights) * 100) : 0,
  }))
}

/** What the AI wrote, as a list of non-empty lines: a list of strings, one string, or nothing usable. */
export function strings(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() === '' ? [] : [value]
  if (!Array.isArray(value)) return []
  return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '')
}

/** After this long the server lets a new strategy start (StrategyController::GENERATING_MINUTES), and the page stops waiting. */
export const GENERATION_STUCK_MS = 15 * 60_000

export type Generation = { state: 'none' } | { state: 'running'; id: number; minutes: number } | { state: 'stuck'; id: number }

/**
 * Whether a strategy is being made, at `now` (the time the list was last
 * read, so rendering stays pure): running with its minutes, or stuck once
 * the server would let a new one start.
 */
export function generationState(list: readonly StrategySummary[], now: number): Generation {
  // A placeholder older than a strategy that has since finished (or failed) belongs to a lost job: it is over.
  const newestDone = Math.max(0, ...list.filter(s => s.status !== 'generating').map(s => s.id))
  const making = list.filter(s => s.status === 'generating' && s.id > newestDone).sort((a, b) => b.id - a.id)[0]
  if (!making) return { state: 'none' }
  const started = making.created_at ? Date.parse(making.created_at) : NaN
  const elapsed = Number.isNaN(started) ? 0 : Math.max(0, now - started)
  if (elapsed > GENERATION_STUCK_MS) return { state: 'stuck', id: making.id }
  return { state: 'running', id: making.id, minutes: Math.floor(elapsed / 60_000) }
}

/** The server's clock when it answered the list (this computer's may be off); the time the list was read when it sent none. */
export function serverClock(data: { now?: string } | undefined, fetchedAt: number): number {
  const at = data?.now ? Date.parse(data.now) : NaN
  return Number.isNaN(at) ? fetchedAt : at
}

/** A generation that was running is over (made, failed or stuck): every cached strategy detail is out of date. */
export const generationFinished = (before: Generation['state'], now: Generation['state']): boolean =>
  before === 'running' && now !== 'running'

/**
 * A new strategy that failed after the active one was made (or with none
 * active): the newest strategy, when it is a failed one. The page says so,
 * since the old active strategy stays on screen.
 */
export function freshFailure(list: readonly StrategySummary[]): StrategySummary | null {
  const newest = [...list].sort((a, b) => b.id - a.id)[0]
  return newest && newest.status === 'failed' ? newest : null
}

/**
 * A strategy's name: the AI's title, or for a strategy being made or one that
 * could not be made the portal's words (the server's placeholder title is English).
 */
export function strategyTitle(strategy: StrategySummary, t: (key: string, english: string) => string): string {
  if (strategy.status === 'generating') return t('content.strategy.making_title', 'A new strategy, being made')
  if (strategy.status === 'failed') return t('content.strategy.failed_title', 'A strategy that could not be made')
  return strategy.title || t('content.strategy.untitled', 'Untitled strategy')
}

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value)
const records = (value: unknown): Record<string, unknown>[] => (Array.isArray(value) ? value.filter(isRecord) : [])
const recordOf = (value: unknown): Record<string, Record<string, unknown>> | undefined =>
  isRecord(value) ? Object.fromEntries(Object.entries(value).filter(([, part]) => isRecord(part))) as Record<string, Record<string, unknown>> : undefined

/**
 * What the AI wrote, as the document reads it (the server stores it as it
 * came): lists of things are lists of objects, maps are objects, and any part
 * in another shape is left out rather than breaking the page.
 */
export function safeOutput(value: unknown): StrategyOutput {
  const o = isRecord(value) ? value : {}
  const engagement = isRecord(o.engagement_strategy) ? o.engagement_strategy : undefined
  return {
    ...o,
    title: typeof o.title === 'string' ? o.title : undefined,
    positioning_narrative: isRecord(o.positioning_narrative) ? o.positioning_narrative : undefined,
    audience_map: records(o.audience_map),
    content_pillars: records(o.content_pillars),
    content_mix: isRecord(o.content_mix) ? o.content_mix : undefined,
    weekly_rhythm: recordOf(o.weekly_rhythm),
    platform_strategy: recordOf(o.platform_strategy),
    engagement_strategy: engagement ? { ...engagement, mechanics: records(engagement.mechanics) } : undefined,
    conversion_strategy: isRecord(o.conversion_strategy) ? o.conversion_strategy : undefined,
    campaign_ideas: records(o.campaign_ideas),
    example_posts: records(o.example_posts),
  } as StrategyOutput
}
