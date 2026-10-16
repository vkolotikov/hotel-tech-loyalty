import { describe, expect, it } from 'vitest'
import type { PostCard, Slot } from '../lib/types'
import { byTime, filtered, inMonth, keepWithinBrand, opensAfterFill, plansFor, presentPlatforms, rangeFor, rangeLabel, shiftDate, slotKey, togglePlatform } from './planMath'

const post = (id: number, more: Partial<PostCard> = {}): PostCard => ({
  id, platform: 'instagram', scheduled_date: '2026-10-07', scheduled_time: null, status: 'draft',
  title: null, hook: `Post ${id}`, topic: null, pillar_id: null, image_url: null, updated_at: '2026-10-05T06:00:00.000000Z', ...more,
})

describe('rangeFor and shiftDate', () => {
  it('a week is Monday to Sunday around the day; a month is the six Monday-first weeks that hold it', () => {
    expect(rangeFor('week', '2026-10-08')).toMatchObject({ from: '2026-10-05', to: '2026-10-11' })
    expect(rangeFor('list', '2026-10-08').days).toHaveLength(7)
    const month = rangeFor('month', '2026-10-08')
    expect(month).toMatchObject({ from: '2026-09-28', to: '2026-11-08' })
    expect(month.days).toHaveLength(42)
  })

  it('pages by a week, or by a month landing on its first day', () => {
    expect(shiftDate('week', '2026-10-08', 1)).toBe('2026-10-15')
    expect(shiftDate('list', '2026-10-08', -1)).toBe('2026-10-01')
    expect(shiftDate('month', '2026-10-31', 1)).toBe('2026-11-01')
    expect(shiftDate('month', '2026-01-15', -1)).toBe('2025-12-01')
  })
})

describe('plansFor', () => {
  it('gives each day its posts — untimed first, then by time — and its slots', () => {
    const posts = [post(1, { scheduled_time: '14:00' }), post(2), post(3, { scheduled_time: '09:30' }), post(4, { scheduled_date: '2026-10-08' })]
    const slots: Slot[] = [{ date: '2026-10-07', platform: 'linkedin' }]
    const [wed, thu] = plansFor(['2026-10-07', '2026-10-08'], posts, slots)
    expect(wed.posts.map(p => p.id)).toEqual([2, 3, 1])
    expect(wed.slots).toEqual(slots)
    expect(thu.posts.map(p => p.id)).toEqual([4])
    expect(thu.slots).toEqual([])
    expect([post(5), post(6)].sort(byTime).map(p => p.id)).toEqual([5, 6])
  })
})

describe('filters', () => {
  const posts = [post(1), post(2, { platform: 'linkedin', status: 'published' })]
  const slots: Slot[] = [{ date: '2026-10-07', platform: 'instagram' }, { date: '2026-10-07', platform: 'linkedin' }]

  it('no platform chosen means every platform; the status filters posts, never slots', () => {
    expect(filtered(posts, slots, { platforms: [], status: 'all' })).toEqual({ posts, slots })
    expect(filtered(posts, slots, { platforms: ['linkedin'], status: 'all' })).toEqual({ posts: [posts[1]], slots: [slots[1]] })
    expect(filtered(posts, slots, { platforms: [], status: 'draft' })).toEqual({ posts: [posts[0]], slots })
  })

  it('toggles a chip, and offers the chips the plan shows (or the person chose), in the brand\'s order', () => {
    expect(togglePlatform(['instagram'], 'linkedin')).toEqual(['instagram', 'linkedin'])
    expect(togglePlatform(['instagram', 'linkedin'], 'instagram')).toEqual(['linkedin'])
    expect(presentPlatforms(['linkedin', 'instagram', 'tiktok', 'x'], posts, [{ date: '2026-10-07', platform: 'tiktok' }], ['x']))
      .toEqual(['linkedin', 'instagram', 'tiktok', 'x'])
    expect(presentPlatforms(['linkedin', 'instagram'], [], [], [])).toEqual([])
  })
})

describe('labels', () => {
  it('names a week by its first and last day, and a month by its name', () => {
    expect(rangeLabel('week', rangeFor('week', '2026-10-08'), '2026-10-08', 'en-GB')).toBe('5 Oct – 11 Oct 2026')
    expect(rangeLabel('month', rangeFor('month', '2026-10-08'), '2026-10-08', 'en-GB')).toBe('October 2026')
  })

  it('tells the month grid which days belong to the month shown, and names a slot', () => {
    expect(inMonth('2026-10-31', '2026-10-08')).toBe(true)
    expect(inMonth('2026-11-01', '2026-10-08')).toBe(false)
    expect(slotKey({ date: '2026-10-07', platform: 'instagram' })).toBe('2026-10-07|instagram')
  })
})

describe('brand changes while something is on its way', () => {
  // Plan B deferred: a Fill finishing after a brand switch opened the old brand's post id under the new brand.
  it('opens a filled post only while the portal still shows the brand it was made for', () => {
    expect(opensAfterFill(3, 3)).toBe(true)
    expect(opensAfterFill(3, 4)).toBe(false)
  })

  // Plan B deferred: a fallback to another brand briefly showed the old brand's plan (keepPreviousData).
  it('keeps the last plan on screen only while it is the same brand\'s', () => {
    const plan = { posts: [] }
    expect(keepWithinBrand(3)(plan, { queryKey: ['content', 3, 'plan', '2026-10-05', '2026-10-11'] })).toBe(plan)
    expect(keepWithinBrand(4)(plan, { queryKey: ['content', 3, 'plan', '2026-10-05', '2026-10-11'] })).toBeUndefined()
    expect(keepWithinBrand(3)(undefined, undefined)).toBeUndefined()
  })
})
