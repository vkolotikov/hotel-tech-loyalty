import { describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { cardOf, placePost, refreshLists } from './planCache'
import type { PlanPayload, PostCard, PostDetail } from './types'

const card = (id: number, scheduled_date: string | null, more: Partial<PostCard> = {}): PostCard => ({
  id, platform: 'instagram', scheduled_date, scheduled_time: null, status: 'draft',
  title: null, hook: `Hook ${id}`, topic: null, pillar_id: null, image_url: null, updated_at: '2026-10-05T06:00:00.000000Z', ...more,
})
const plan: PlanPayload = {
  posts: [card(1, '2026-10-07'), card(2, '2026-10-08')],
  unscheduled: [card(3, null)],
  slots: [{ date: '2026-10-09', platform: 'linkedin' }],
  figures: { planned: 2, ready: 0, published: 0, open_slots: 1 },
}
const week = ['2026-10-05', '2026-10-11'] as const
const ids = (posts: PostCard[]) => posts.map(p => p.id)

describe('placePost', () => {
  // The plan shows the person's own move or save at once, with its new version, so the next move of
  // that card sends the version the server has (and is not refused as "someone else changed it").
  it('puts a post on its new day inside the range, once, with its new version', () => {
    const moved = card(1, '2026-10-09', { updated_at: '2026-10-05T06:01:00.000000Z' })
    const next = placePost(plan, moved, ...week)
    expect(ids(next.posts)).toEqual([2, 1])
    expect(next.posts.find(p => p.id === 1)).toEqual(moved)
    expect(ids(next.unscheduled)).toEqual([3])
  })

  it('moves a post into the tray, and out of it', () => {
    expect(placePost(plan, card(1, null), ...week)).toMatchObject({ posts: [{ id: 2 }], unscheduled: [{ id: 3 }, { id: 1 }] })
    const scheduled = placePost(plan, card(3, '2026-10-10'), ...week)
    expect(ids(scheduled.posts)).toEqual([1, 2, 3])
    expect(scheduled.unscheduled).toEqual([])
  })

  it('takes a post moved out of the range off it, and leaves the slots and figures to the next read', () => {
    const next = placePost(plan, card(2, '2026-11-20'), ...week)
    expect(ids(next.posts)).toEqual([1])
    expect(next.slots).toBe(plan.slots)
    expect(next.figures).toBe(plan.figures)
  })
})

describe('cardOf', () => {
  it('is the card part of a post the panel holds', () => {
    const detail = { ...card(5, '2026-10-07'), language: 'en', main_copy: 'Text', hashtags: [] } as unknown as PostDetail
    expect(cardOf(detail)).toEqual(card(5, '2026-10-07'))
  })
})

describe('refreshLists', () => {
  it('marks the Plan\'s, the Posts page\'s and the goals\' reads of the brand for a new read', () => {
    const client = new QueryClient()
    const spy = vi.spyOn(client, 'invalidateQueries')
    void refreshLists(client, 3)
    expect(spy.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([['content', 3, 'plan'], ['content', 3, 'posts'], ['content', 3, 'goals'], ['content', 3, 'ideas']])
  })
})

describe('refreshLists and the goals', () => {
  it('reads the week\'s goals again with the plan after a post changes', async () => {
    const client = new QueryClient()
    client.setQueryData(['content', 3, 'goals'], { week: null, platforms: [], streak: { weeks: 0, current_met: false, at_risk: false, short_by: 0 } })
    await refreshLists(client, 3)
    expect(client.getQueryState(['content', 3, 'goals'])?.isInvalidated).toBe(true)
  })
})
