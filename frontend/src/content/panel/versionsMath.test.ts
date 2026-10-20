import { describe, expect, it } from 'vitest'
import type { Platform, PostGroup } from '../lib/types'
import { aiAllowed, groupPostsToRefresh, submitReady, versionChoices, versionNote, versionsBody } from './versionsMath'

const group = (more: Partial<PostGroup> = {}): PostGroup => ({
  id: 5,
  posts: [
    { id: 5, platform: 'instagram', status: 'draft', scheduled_date: '2026-10-07', scheduled_time: null },
    { id: 6, platform: 'linkedin', status: 'draft', scheduled_date: '2026-10-07', scheduled_time: null },
  ],
  adapting: [], kept_original: [], kept_reason: null, ...more,
})
const ALL: Platform[] = ['linkedin', 'instagram', 'tiktok', 'facebook', 'x', 'youtube', 'blog', 'email']

describe('versionChoices (spec 2026-10-19 §3.1)', () => {
  it('offers the brand’s platforms not yet in the group, the post’s own left out', () => {
    expect(versionChoices(ALL, { platform: 'instagram' }, null)).toEqual(['linkedin', 'tiktok', 'facebook', 'x', 'youtube', 'blog', 'email'])
    expect(versionChoices(ALL, { platform: 'linkedin' }, group())).toEqual(['tiktok', 'facebook', 'x', 'youtube', 'blog', 'email'])
  })

  // Review Focus 3: a post with a version for every platform is offered none.
  it('offers nothing once every platform has a version', () => {
    expect(versionChoices(['instagram', 'linkedin'], { platform: 'instagram' }, group())).toEqual([])
  })
})

describe('the AI and the request (spec §3.1, §3.3)', () => {
  // Review Focus 2: at the budget cap the versions are copied as they are.
  it('allows the AI until the month’s budget is used up, and never asks for it then', () => {
    expect(aiAllowed('under')).toBe(true)
    expect(aiAllowed('warn')).toBe(true)
    expect(aiAllowed('unlimited')).toBe(true)
    expect(aiAllowed('over')).toBe(false)
    expect(versionsBody(['x', 'linkedin'], ['linkedin', 'tiktok', 'x'], true, 'over')).toEqual({ platforms: ['linkedin', 'x'], ai: false })
    expect(versionsBody(['x'], ['linkedin', 'x'], true, 'under')).toEqual({ platforms: ['x'], ai: true })
    expect(versionsBody(['x'], ['linkedin', 'x'], false, 'under')).toEqual({ platforms: ['x'], ai: false })
  })

  it('sends nothing with no platform picked, and drops a platform no longer offered', () => {
    expect(versionsBody([], ['linkedin'], true, 'under')).toBeNull()
    expect(versionsBody(['blog'], ['linkedin'], false, 'under')).toBeNull()
  })
})

describe('versionNote (spec §3.3)', () => {
  it('says this version is being adapted, the others are, or it kept the original text and why', () => {
    expect(versionNote(null, { id: 5, platform: 'instagram' })).toBeNull()
    expect(versionNote(group(), { id: 5, platform: 'instagram' })).toBeNull()
    expect(versionNote(group({ adapting: [6] }), { id: 6, platform: 'linkedin' })).toEqual({ kind: 'adapting', platform: 'linkedin' })
    expect(versionNote(group({ adapting: [6] }), { id: 5, platform: 'instagram' })).toEqual({ kind: 'adapting_others' })
    expect(versionNote(group({ kept_original: [6], kept_reason: 'budget' }), { id: 6, platform: 'linkedin' })).toEqual({ kind: 'kept', reason: 'budget' })
    expect(versionNote(group({ kept_original: [6], kept_reason: 'ai_failed' }), { id: 6, platform: 'linkedin' })).toEqual({ kind: 'kept', reason: 'ai_failed' })
  })
})

// Final review: the open form's Make versions went ahead while the panel held unsaved edits — the versions copied the
// saved post, without the person's latest words.
describe('submitReady (final review)', () => {
  it('waits for a platform, and for the panel’s unsaved edits to be saved', () => {
    expect(submitReady({ platforms: ['x'], ai: false }, false)).toBe(true)
    expect(submitReady({ platforms: ['x'], ai: false }, true)).toBe(false)
    expect(submitReady(null, false)).toBe(false)
  })
})

// 5A-2 review: the other versions' cached copies showed the old group for up to 30 s after Make versions or Unlink.
describe('the versions to read again', () => {
  const g = (...ids: number[]): PostGroup => ({ id: ids[0], posts: ids.map(id => ({ id, platform: 'instagram' as Platform, status: 'draft' as const, scheduled_date: null, scheduled_time: null })), adapting: [], kept_original: [], kept_reason: null })
  it('are every post of the group before and after, but this one, each once', () => {
    expect(groupPostsToRefresh(g(1, 2), g(1, 2, 3), 1)).toEqual([2, 3])
    expect(groupPostsToRefresh(g(1, 2, 3), null, 2)).toEqual([1, 3])
    expect(groupPostsToRefresh(null, null, 5)).toEqual([])
  })
})
