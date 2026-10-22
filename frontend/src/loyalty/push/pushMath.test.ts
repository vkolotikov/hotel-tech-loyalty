import { describe, expect, it } from 'vitest'
import {
  bodyOf, canCount, confirmationOf, draftProblems, formOf, handled, isDirty, isLive, lengthGuide, messageFrom, outcomesOf, previewTitle,
  progressOf, pushActions, pushSearch, sendBlockers, sendRefusalRefreshes, serverProblems, statusTone, viewOf,
} from './pushMath'
import type { Push, PushAudience, PushOptions, SegmentChoice } from './types'

const options: PushOptions = { categories: ['offers', 'points', 'tier', 'stays'], max_name: 120, max_title: 100, title_guide: 40, max_body: 500, body_guide: 150, limit: 5000 }
const none = { sent: 0, failed: 0, inbox_only: 0, skipped: 0, pending: 0 }
const draft = (more: Partial<Push> = {}): Push => ({
  id: 7, name: 'Autumn', title: 'Double points', category: 'offers', status: 'draft', segment: { id: 3, name: 'Gold' }, recipient_count: 0, results: none,
  sent_at: null, scheduled_at: null, scheduled_for: null, schedule_problem: null,
  created_at: null, updated_at: null, body: 'All week.', segment_id: 3, missing: [], last_progress_at: null, created_by: 'Ada', sent_by: null,
  revision: '2026-10-20T09:00:00+00:00', ...more,
})
const segments: SegmentChoice[] = [{ id: 3, name: 'Gold', members: 40, problem: null }, { id: 9, name: 'Lapsed', members: 4, problem: { index: 0, reason: 'unknown_op' } }]

describe('push messages: addresses', () => {
  it('names a message in the tab\'s address and reads it back, and anything else is the list', () => {
    expect(pushSearch(null)).toBe('?tab=push')
    expect(pushSearch(12)).toBe('?tab=push&message=12')
    expect(messageFrom('?tab=push&message=12')).toBe(12)
    for (const bad of ['?tab=push', '?tab=push&message=0', '?tab=push&message=-1', '?tab=push&message=1.5', '?tab=push&message=abc', '?message=01']) {
      expect(messageFrom(bad), bad).toBeNull()
    }
  })
})

describe('push messages: state', () => {
  it('gives each status its tone and what the page offers', () => {
    expect(['draft', 'sending', 'sent', 'failed', 'cancelled', 'later'].map(statusTone)).toEqual(['pending', 'approved', 'fulfilled', 'declined', 'cancelled', 'cancelled'])
    expect(isLive('sending')).toBe(true)
    expect(isLive('sent')).toBe(false)
    expect(viewOf({ status: 'draft' })).toBe('editor')
    expect(viewOf({ status: 'cancelled' })).toBe('results')
    expect(pushActions({ status: 'draft' })).toEqual({ edit: true, send: true, cancel: false, duplicate: true, remove: true })
    expect(pushActions({ status: 'sending' })).toEqual({ edit: false, send: false, cancel: true, duplicate: true, remove: false })
    expect(pushActions({ status: 'sent' })).toEqual({ edit: false, send: false, cancel: false, duplicate: true, remove: false })
  })

  it('counts how far it got, and once it is over the members it never reached', () => {
    const results = { sent: 50, failed: 3, inbox_only: 2, skipped: 4, pending: 1 }
    expect(handled(results)).toBe(60)
    expect(progressOf({ status: 'sending', recipient_count: 120, results })).toEqual({ done: 60, total: 120, percent: 50, gone: 0 })
    expect(progressOf({ status: 'sent', recipient_count: 62, results })).toEqual({ done: 60, total: 62, percent: 100, gone: 2 })
    expect(progressOf({ status: 'draft', recipient_count: 0, results: none })).toEqual({ done: 0, total: 0, percent: 0, gone: 0 })
    expect(outcomesOf({ ...none, sent: 5, skipped: 1 })).toEqual([{ code: 'sent', count: 5 }, { code: 'skipped', count: 1 }])
  })
})

describe('push messages: the draft', () => {
  it('holds the draft as a form and sends it back trimmed, an empty choice as none', () => {
    const form = formOf(draft({ category: null, segment_id: null }))
    expect(form).toEqual({ name: 'Autumn', title: 'Double points', body: 'All week.', category: '', segment_id: '' })
    expect(bodyOf({ ...form, title: '  Hi  ' })).toEqual({ name: 'Autumn', title: 'Hi', body: 'All week.', category: null, segment_id: null })
    expect(bodyOf({ ...form, category: 'tier', segment_id: '9' })).toMatchObject({ category: 'tier', segment_id: 9 })
  })

  it('is dirty only when it says something the saved draft does not', () => {
    const p = draft()
    expect(isDirty(formOf(p), p)).toBe(false)
    expect(isDirty({ ...formOf(p), title: 'Double points ' }, p)).toBe(false)
    expect(isDirty({ ...formOf(p), category: 'tier' }, p)).toBe(true)
    expect(isDirty({ ...formOf(p), segment_id: '' }, p)).toBe(true)
  })

  it('names what stops a save, by field, and reads the server\'s field errors in the same codes', () => {
    const f = formOf(draft())
    expect(draftProblems(f, options)).toEqual({})
    expect(draftProblems({ ...f, name: ' ', title: 'x'.repeat(101), body: 'x'.repeat(501), category: 'campaign' }, options))
      .toEqual({ name: 'name', title: 'title_long', body: 'body_long', category: 'category' })
    expect(serverProblems({ segment_id: ['x'], title: ['x'] })).toEqual({ segment_id: 'segment_gone', title: 'title_long' })
    expect(serverProblems(undefined)).toEqual({})
  })

  it('says how a text fits on a phone, from the server\'s guide and limit', () => {
    expect(lengthGuide('  Double points  ', 40, 100)).toEqual({ count: 13, state: 'fits' })
    expect(lengthGuide('x'.repeat(41), 40, 100)).toEqual({ count: 41, state: 'may_cut' })
    expect(lengthGuide('x'.repeat(101), 40, 100)).toEqual({ count: 101, state: 'too_long' })
  })

  it('cuts a long title for the preview at a word where it can, as phones do', () => {
    expect(previewTitle('Double points', 40)).toEqual({ text: 'Double points', cut: false })
    expect(previewTitle('Double points on every visit this whole weekend long', 40)).toEqual({ text: 'Double points on every visit this whole…', cut: true })
    expect(previewTitle('x'.repeat(50), 40)).toEqual({ text: `${'x'.repeat(40)}…`, cut: true })
  })
})

describe('push messages: Send', () => {
  it('says why Send waits: unsaved, what is missing, then the segment', () => {
    expect(sendBlockers(draft(), false, segments)).toEqual([])
    expect(sendBlockers(draft(), true, segments)).toEqual(['unsaved'])
    expect(sendBlockers(draft({ missing: ['title', 'body', 'category'], segment_id: null }), false, segments)).toEqual(['title', 'body', 'category', 'no_segment'])
    expect(sendBlockers(draft({ segment_id: 4 }), false, segments)).toEqual(['segment_gone'])
    expect(sendBlockers(draft({ segment_id: 9 }), false, segments)).toEqual(['segment_problem'])
    // Segments still loading say nothing yet.
    expect(sendBlockers(draft({ segment_id: 4 }), false, undefined)).toEqual([])
  })

  it('counts the saved draft only with a segment and a kind and nothing unsaved', () => {
    expect(canCount(draft(), false)).toBe(true)
    expect(canCount(draft(), true)).toBe(false)
    expect(canCount(draft({ category: null }), false)).toBe(false)
    expect(canCount(draft({ segment_id: null }), false)).toBe(false)
  })

  it('says what the confirmation rests on: who it reaches and why the rest are left out', () => {
    const a: PushAudience = { segment: { id: 3, name: 'Gold' }, category: 'offers', members: 10, reached: 6, push_off: 1, no_device: 3, opted_out: 0, limit: 5000 }
    expect(confirmationOf(a)).toEqual({ state: 'ok', reached: 6, left_out: 4, reasons: [{ code: 'push_off', count: 1 }, { code: 'no_device', count: 3 }] })
    expect(confirmationOf({ ...a, reached: 0 }).state).toBe('nobody')
    expect(confirmationOf({ ...a, reached: 5001, members: 6000 }).state).toBe('over')
  })

  it('reads again what a refused Send makes stale', () => {
    expect(sendRefusalRefreshes('audience_changed')).toEqual({ audience: true, message: false })
    expect(sendRefusalRefreshes('already_started')).toEqual({ audience: false, message: true })
    expect(sendRefusalRefreshes('network')).toEqual({ audience: false, message: false })
  })
})
