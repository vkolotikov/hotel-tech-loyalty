import { suggestedTimes } from '../lib/bestTimes'
import type { Channel, DateKey, IdeasColumn, IdeasPayload, Platform, PostCard, PostFields, PostStatus } from '../lib/types'
import { usualTimes } from '../plan/addMath'
import { NO_FILTERS, writeFilters } from '../posts/postsFilters'

/** The board's four stages (spec 2026-10-16 §4.1), left to right. */
export const COLUMNS: readonly IdeasColumn[] = ['idea', 'draft', 'review', 'ready']

/** Each stage's English name, the fallback under the bundles' `content.ideas.column.*`. */
export const COLUMN_TEXT: Record<IdeasColumn, string> = { idea: 'Idea', draft: 'Draft', review: 'In review', ready: 'Ready' }

/** The statuses each stage holds (the server's ContentIdeas::COLUMNS). */
export const COLUMN_STATUSES: Record<IdeasColumn, readonly PostStatus[]> = {
  idea: ['idea'], draft: ['draft'], review: ['needs_review', 'needs_visual'], ready: ['approved', 'ready_to_publish'],
}

/** What a card dropped on a stage becomes. */
export const DROP_STATUS: Record<IdeasColumn, PostStatus> = { idea: 'idea', draft: 'draft', review: 'needs_review', ready: 'ready_to_publish' }

/** The sentence that tells a screen reader how a focused card moves (each card points at it). */
export const IDEAS_HINT_ID = 'content-ideas-hint'

export const columnOf = (status: PostStatus): IdeasColumn | null => COLUMNS.find(c => COLUMN_STATUSES[c].includes(status)) ?? null

/** The status a move sends, or null when the card is already in that stage (then nothing is sent). */
export function moveStatus(post: Pick<PostCard, 'status'>, to: IdeasColumn): PostStatus | null {
  return columnOf(post.status) === to ? null : DROP_STATUS[to]
}

/** The stage beside this one (Shift + ← / →), or null past either end. */
export function stepColumn(from: IdeasColumn, step: -1 | 1): IdeasColumn | null {
  return COLUMNS[COLUMNS.indexOf(from) + step] ?? null
}

/** Whether a card may enter a stage: staff may not move one into Ready while the brand's approvals are on (spec 2026-10-16 §6.2). */
export const canEnter = (column: IdeasColumn, locked: boolean): boolean => !(locked && column === 'ready')

/** The stages "Move to…" offers a card in `column`. */
export const moveTargets = (column: IdeasColumn, locked: boolean): IdeasColumn[] => COLUMNS.filter(c => c !== column && canEnter(c, locked))

/** The stage Shift + ← / → moves a card to, or null: past either end, or a stage it may not enter. */
export function stepTarget(column: IdeasColumn, step: -1 | 1, locked: boolean): IdeasColumn | null {
  const to = stepColumn(column, step)
  return to !== null && canEnter(to, locked) ? to : null
}

/** "See all": the Posts page with no day, the stage's status where it holds only one, and the board's filters. */
export function seeAllLink(column: IdeasColumn, filters: { platform: Platform | null; pillarId: number | null }): string {
  const statuses = COLUMN_STATUSES[column]
  const params = writeFilters({
    ...NO_FILTERS, unscheduled: true, status: statuses.length === 1 ? statuses[0] : '', platform: filters.platform ?? '', pillar_id: filters.pillarId,
  })
  return `/content/posts?${params.toString()}`
}

/** A card's words (spec §4.2): the topic, else the hook, else the title. */
export const ideaLine = (post: Pick<PostCard, 'topic' | 'hook' | 'title'>): string =>
  [post.topic, post.hook, post.title].map(v => (v ?? '').trim()).find(v => v !== '') ?? ''

type AgeUnit = 'minute' | 'hour' | 'day' | 'week'

/** How long ago a card changed, in the largest whole unit; null when unknown (no read yet, or no date). */
export function ageOf(updatedAt: string, now: number): { value: number; unit: AgeUnit } | null {
  const then = Date.parse(updatedAt)
  if (Number.isNaN(then) || now <= 0) return null
  const minutes = Math.max(0, Math.floor((now - then) / 60_000))
  if (minutes < 60) return { value: minutes, unit: 'minute' }
  if (minutes < 1_440) return { value: Math.floor(minutes / 60), unit: 'hour' }
  if (minutes < 10_080) return { value: Math.floor(minutes / 1_440), unit: 'day' }
  return { value: Math.floor(minutes / 10_080), unit: 'week' }
}

/** The age in the interface's language ("3 hours ago"): the browser's Intl says it, plural forms included. */
export function ageText(updatedAt: string, now: number, locale: string): string {
  const age = ageOf(updatedAt, now)
  return age ? new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(-age.value, age.unit) : ''
}

/** Schedule's first answer (spec §4.2): today, at the channel's usual time (release 3), else the first suggested time. */
export function scheduleDefaults(platform: Platform, channels: readonly Channel[], industry: string | null | undefined, today: DateKey): { date: DateKey; time: string } {
  return { date: today, time: usualTimes(channels, industry)[platform] ?? suggestedTimes(platform, industry)[0] ?? '' }
}

/** Quick capture (spec §4.3): an idea post, the words its topic (255 at most), no day, on the brand's first active channel. */
export function ideaBody(text: string, channels: readonly Channel[], platforms: readonly Platform[]): (PostFields & { platform: Platform }) | null {
  const topic = text.trim().slice(0, 255)
  if (topic === '') return null
  return { platform: channels.find(c => c.active)?.platform ?? platforms[0] ?? 'instagram', status: 'idea', topic }
}

/** The most a stage shows (the server's ContentIdeas::PER_COLUMN). */
const PER_COLUMN = 50

/**
 * The board with a card just saved in its new place (final review): out of its old stage, at the top of its new one
 * (none for a card given a day, or published), totals with it — so the next move reads the card's new version.
 */
export function placeCard(board: IdeasPayload, card: PostCard): IdeasPayload {
  const to = card.scheduled_date ? null : columnOf(card.status)
  const columns = { ...board.columns }
  for (const column of COLUMNS) {
    const was = columns[column]
    const posts = was.posts.filter(p => p.id !== card.id)
    const total = was.total - (posts.length < was.posts.length ? 1 : 0)
    columns[column] = column === to ? { posts: [card, ...posts].slice(0, PER_COLUMN), total: total + 1 } : { posts, total }
  }
  return { columns }
}

/** The cards whose move is on its way: a second move of the same card waits for the first (it would send an old version). */
export function inFlight(): { start: (id: number) => boolean; done: (id: number) => void } {
  const ids = new Set<number>()
  return {
    start: (id) => {
      if (ids.has(id)) return false
      ids.add(id)
      return true
    },
    done: (id) => { ids.delete(id) },
  }
}
