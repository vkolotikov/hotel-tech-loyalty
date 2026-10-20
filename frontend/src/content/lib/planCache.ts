import type { QueryClient } from '@tanstack/react-query'
import type { DateKey, PlanPayload, PostCard, PostDetail } from './types'

/**
 * A post the person just moved or saved, put where it now belongs on one
 * plan read (the range `from`–`to`): on its day inside the range, in the
 * tray without a day, or off the plan. The slots and figures wait for the
 * next read, which follows anyway.
 */
export function placePost(plan: PlanPayload, card: PostCard, from: DateKey, to: DateKey): PlanPayload {
  const posts = plan.posts.filter(p => p.id !== card.id)
  const unscheduled = plan.unscheduled.filter(p => p.id !== card.id)
  const date = card.scheduled_date
  if (date === null) unscheduled.push(card)
  else if (date >= from && date <= to) posts.push(card)
  return { ...plan, posts, unscheduled }
}

/** The card part of a post the panel holds (what the plan shows of it). */
export function cardOf(post: PostDetail): PostCard {
  const { id, platform, scheduled_date, scheduled_time, status, title, hook, topic, pillar_id, image_url, updated_at, comments_count, sent_back, group_size, poster_id, clicks } = post
  return { id, platform, scheduled_date, scheduled_time, status, title, hook, topic, pillar_id, image_url, updated_at, comments_count, sent_back, group_size, poster_id, clicks }
}

/** A post an answer brought without its timeline (a save, an AI answer) keeps the one already read (spec 2026-10-16 §7.1). */
export function keepTimeline(fresh: PostDetail, old: PostDetail | undefined): PostDetail {
  return fresh.timeline === undefined && old?.id === fresh.id && old.timeline !== undefined ? { ...fresh, timeline: old.timeline } : fresh
}

/**
 * A post an answer brought, in the panel's cache: a timeline already read is kept, and an answer without one (a save, an
 * AI answer, a board move) has the post read again — it may have recorded an approval step (spec 2026-10-16 §7.1).
 */
export function putPost(queryClient: QueryClient, brand: number | null, fresh: PostDetail): void {
  queryClient.setQueryData<PostDetail>(['content', brand, 'post', fresh.id], old => keepTimeline(fresh, old))
  if (fresh.timeline === undefined) void queryClient.invalidateQueries({ queryKey: ['content', brand, 'post', fresh.id], exact: true })
}

/**
 * Show the post on every plan read of this brand at once (keys
 * `['content', brand, 'plan', from, to]`), so the next move of its card
 * sends the version the server now has.
 */
export function putInPlans(queryClient: QueryClient, brand: number | null, card: PostCard): void {
  for (const [key, plan] of queryClient.getQueriesData<PlanPayload>({ queryKey: ['content', brand, 'plan'] })) {
    const [, , , from, to] = key as [string, number | null, string, DateKey, DateKey]
    if (plan && from && to) queryClient.setQueryData(key, placePost(plan, card, from, to))
  }
}

/** After a post changes, the Plan's, the Posts page's, the goals' and the Ideas board's reads of the brand are read again (an open page at once, the others when shown). */
export function refreshLists(queryClient: QueryClient, brand: number | null): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['content', brand, 'plan'] }),
    queryClient.invalidateQueries({ queryKey: ['content', brand, 'posts'] }),
    queryClient.invalidateQueries({ queryKey: ['content', brand, 'goals'] }),
    // The Ideas board (spec 2026-10-16 §4) holds the posts without a day: a change can move a card.
    queryClient.invalidateQueries({ queryKey: ['content', brand, 'ideas'] }),
    // The bell (spec §8): a post that enters or leaves review, an approval step or a comment changes what it says.
    queryClient.invalidateQueries({ queryKey: ['content', brand, 'inbox'] }),
    // The website's pages (spec 2026-10-20 §4.6): a promotion post's change moves its page's numbers and "Show posts".
    queryClient.invalidateQueries({ queryKey: ['content', brand, 'site'] }),
    queryClient.invalidateQueries({ queryKey: ['content', brand, 'page-posts'] }),
  ])
}
