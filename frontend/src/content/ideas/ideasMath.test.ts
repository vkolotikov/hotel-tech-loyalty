import { describe, expect, it } from 'vitest'
import type { Channel, IdeasPayload, PostCard, PostStatus } from '../lib/types'
import { ageOf, ageText, canEnter, columnOf, ideaBody, ideaLine, inFlight, moveStatus, moveTargets, placeCard, scheduleDefaults, seeAllLink, stepColumn, stepTarget } from './ideasMath'

describe('the board’s stages (spec 2026-10-16 §4.1)', () => {
  it('puts each status in its stage, and published, skipped or archived posts in none', () => {
    const statuses: PostStatus[] = ['idea', 'draft', 'needs_review', 'needs_visual', 'approved', 'ready_to_publish']
    expect(statuses.map(columnOf)).toEqual(['idea', 'draft', 'review', 'review', 'ready', 'ready'])
    expect([columnOf('published'), columnOf('skipped'), columnOf('archived')]).toEqual([null, null, null])
  })

  // Review Focus 5: a card dropped where it already is sends nothing.
  it('sends the stage’s status on a move, and nothing for a move to the stage the card is in', () => {
    expect(moveStatus({ status: 'idea' }, 'review')).toBe('needs_review')
    expect(moveStatus({ status: 'draft' }, 'ready')).toBe('ready_to_publish')
    expect(moveStatus({ status: 'needs_visual' }, 'review')).toBeNull()
    expect(moveStatus({ status: 'approved' }, 'ready')).toBeNull()
  })

  it('steps one stage left or right (Shift + ← / →), and no further than either end', () => {
    expect([stepColumn('idea', 1), stepColumn('ready', -1)]).toEqual(['draft', 'review'])
    expect([stepColumn('idea', -1), stepColumn('ready', 1)]).toEqual([null, null])
  })

  it('sees all of a stage on the Posts page: no day, its status where it has one, and the board’s filters', () => {
    expect(seeAllLink('idea', { platform: 'instagram', pillarId: 4 })).toBe('/content/posts?status=idea&platform=instagram&pillar=4&unscheduled=1')
    expect(seeAllLink('review', { platform: null, pillarId: null })).toBe('/content/posts?unscheduled=1')
  })
})

describe('a card (spec §4.2)', () => {
  it('shows the topic, else the hook, else the title', () => {
    expect(ideaLine({ topic: ' Autumn ', hook: 'Hook', title: null })).toBe('Autumn')
    expect(ideaLine({ topic: '', hook: 'Hook', title: 'Title' })).toBe('Hook')
    expect(ideaLine({ topic: null, hook: null, title: null })).toBe('')
  })

  it('says how long ago it changed, in the largest whole unit and in the interface’s language', () => {
    const now = Date.parse('2026-10-16T12:00:00Z')
    expect(ageOf('2026-10-16T11:58:30Z', now)).toEqual({ value: 1, unit: 'minute' })
    expect(ageOf('2026-10-16T09:00:00.000000Z', now)).toEqual({ value: 3, unit: 'hour' })
    expect(ageOf('2026-10-13T12:00:00Z', now)).toEqual({ value: 3, unit: 'day' })
    expect(ageOf('2026-09-16T12:00:00Z', now)).toEqual({ value: 4, unit: 'week' })
    expect(ageOf('not a date', now)).toBeNull()
    expect(ageOf('2026-10-16T09:00:00Z', 0)).toBeNull()
    expect(ageText('2026-10-16T09:00:00.000000Z', now, 'en-GB')).toBe('3 hours ago')
    expect(ageText('2026-10-16T09:00:00Z', 0, 'en-GB')).toBe('')
  })

  it('schedules from today at the channel’s usual time, else the first suggested time', () => {
    const channel = { platform: 'linkedin', active: true, post_time: '08:15' } as unknown as Channel
    expect(scheduleDefaults('linkedin', [channel], 'beauty', '2026-10-16')).toEqual({ date: '2026-10-16', time: '08:15' })
    expect(scheduleDefaults('instagram', [channel], 'beauty', '2026-10-16').time).toMatch(/^\d{2}:\d{2}$/)
  })
})

describe('quick capture (spec 2026-10-16 §4.3)', () => {
  const channels = [{ platform: 'facebook', active: false }, { platform: 'linkedin', active: true }] as unknown as Channel[]

  // Review Focus 5: an idea of only spaces sends nothing.
  it('makes an idea post with the words as its topic on the brand’s first active channel, and nothing from spaces', () => {
    expect(ideaBody('  Autumn colour trends  ', channels, ['instagram'])).toEqual({ platform: 'linkedin', status: 'idea', topic: 'Autumn colour trends' })
    expect(ideaBody('x', [], ['instagram', 'linkedin'])?.platform).toBe('instagram')
    expect(ideaBody('y'.repeat(300), channels, [])?.topic).toHaveLength(255)
    expect(ideaBody('   ', channels, ['instagram'])).toBeNull()
  })
})

// Final review (Plan 4A-2): three quick Shift+→ presses sent the 2nd and 3rd moves with the card's old version; the server
// refused them as "changed elsewhere" and the card stopped half way.
describe('a moved card, at once', () => {
  const card = (id: number, status: PostStatus, more: Partial<PostCard> = {}): PostCard => ({
    id, platform: 'instagram', scheduled_date: null, scheduled_time: null, status, title: null, hook: null, topic: `Idea ${id}`,
    pillar_id: null, image_url: null, updated_at: 'old', ...more,
  })
  const board = (): IdeasPayload => ({
    columns: { idea: { posts: [card(1, 'idea')], total: 1 }, draft: { posts: [card(2, 'draft')], total: 1 }, review: { posts: [], total: 0 }, ready: { posts: [], total: 0 } },
  })

  it('leaves its old stage and tops its new one in the cached board, totals with it; a card given a day leaves the board', () => {
    const moved = placeCard(board(), card(1, 'draft', { updated_at: 'new' }))
    expect(moved.columns.idea).toEqual({ posts: [], total: 0 })
    expect(moved.columns.draft.posts.map(p => [p.id, p.updated_at])).toEqual([[1, 'new'], [2, 'old']])
    expect(moved.columns.draft.total).toBe(2)
    const scheduled = placeCard(board(), card(1, 'idea', { scheduled_date: '2026-10-20' }))
    expect(scheduled.columns.idea).toEqual({ posts: [], total: 0 })
  })

  it('sends one move of a card at a time', () => {
    const moving = inFlight()
    expect(moving.start(5)).toBe(true)
    expect(moving.start(5)).toBe(false)
    expect(moving.start(6)).toBe(true)
    moving.done(5)
    expect(moving.start(5)).toBe(true)
  })
})

describe('approvals on the board (spec 2026-10-16 §6.2)', () => {
  it('keeps staff out of Ready while approvals are on, by drop, by "Move to…" and by Shift + →', () => {
    expect(canEnter('ready', true)).toBe(false)
    expect(canEnter('ready', false)).toBe(true)
    expect(canEnter('review', true)).toBe(true)
    expect(moveTargets('review', true)).toEqual(['idea', 'draft'])
    expect(moveTargets('review', false)).toEqual(['idea', 'draft', 'ready'])
    expect(stepTarget('review', 1, true)).toBeNull()
    expect(stepTarget('review', 1, false)).toBe('ready')
  })

  it('lets a card already in Ready move out', () => {
    expect(moveTargets('ready', true)).toEqual(['idea', 'draft', 'review'])
    expect(stepTarget('ready', -1, true)).toBe('review')
  })
})
