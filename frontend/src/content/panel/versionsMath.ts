import type { BudgetStatus, Platform, PostDetail, PostGroup } from '../lib/types'

/** The platforms a new version can be for (spec 2026-10-19 §3.1): the brand's, minus those already in the group — the post's own included. */
export function versionChoices(platforms: readonly Platform[], post: Pick<PostDetail, 'platform'>, group: PostGroup | null): Platform[] {
  const taken = new Set<Platform>([post.platform, ...(group?.posts ?? []).map(p => p.platform)])
  return platforms.filter(p => !taken.has(p))
}

/** "Adapt with AI" is the default while the month's AI budget is not used up, and unavailable when it is (§3.1). */
export const aiAllowed = (budget: BudgetStatus): boolean => budget !== 'over'

/** What the panel says of the AI's work on this post's group (§3.3). */
export type VersionNote =
  | { kind: 'adapting'; platform: Platform }
  | { kind: 'adapting_others' }
  | { kind: 'kept'; reason: 'budget' | 'ai_failed' }
  | null

/** This version being adapted, the other versions being adapted, or this one kept as written (and why). */
export function versionNote(group: PostGroup | null, post: Pick<PostDetail, 'id' | 'platform'>): VersionNote {
  if (!group) return null
  if (group.adapting.includes(post.id)) return { kind: 'adapting', platform: post.platform }
  if (group.kept_original.includes(post.id)) return { kind: 'kept', reason: group.kept_reason === 'ai_failed' ? 'ai_failed' : 'budget' }
  return group.adapting.length > 0 ? { kind: 'adapting_others' } : null
}

/** Make versions goes only with a platform picked and nothing unsaved in the panel: a version copies the post as saved (final review). */
export const submitReady = (body: { platforms: Platform[]; ai: boolean } | null, dirty: boolean): boolean => body !== null && !dirty

/** The request: the platforms picked, in the brand's order, the AI only where allowed; null with none picked (the portal's own `invalid`). */
export function versionsBody(picked: readonly Platform[], choices: readonly Platform[], ai: boolean, budget: BudgetStatus): { platforms: Platform[]; ai: boolean } | null {
  const platforms = choices.filter(p => picked.includes(p))
  return platforms.length === 0 ? null : { platforms, ai: ai && aiAllowed(budget) }
}
