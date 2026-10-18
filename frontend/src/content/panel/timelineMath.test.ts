import { describe, expect, it } from 'vitest'
import en from '../i18n/content.en.json'
import type { PostDetail, TimelineComment, TimelineEvent } from '../lib/types'
import { COMMENT_MAX, EVENT_TEXT, commentProblem, commentRights, sendsOnEnter, withComment, withEdited, withoutComment } from './timelineMath'

const comment = (id: number, more: Partial<TimelineComment> = {}): TimelineComment => ({
  type: 'comment', id, user: { id: 2, name: 'Maria' }, body: `Comment ${id}`, edited: false, mine: false, at: '2026-10-05T06:00:00.000000Z', ...more,
})
const event: TimelineEvent = { type: 'event', id: 1, kind: 'approved', user: { id: 2, name: 'Maria' }, note: null, at: '2026-10-05T05:00:00.000000Z' }
const post = { id: 5, comments_count: 1, timeline: [event, comment(1)] } as unknown as PostDetail
const keys = (p: PostDetail) => (p.timeline ?? []).map(i => `${i.type}${i.id}`)

describe('comments and history (spec 2026-10-16 §7.1)', () => {
  it('words each approval step as the English bundle does', () => {
    expect(en.timeline.event).toEqual(EVENT_TEXT)
  })

  // Review Focus 3: nothing is sent that the server would refuse; the limit is named.
  it('holds back a comment of nothing but spaces, or past 2,000 characters counted as characters', () => {
    expect(commentProblem('')).toBe('invalid')
    expect(commentProblem(' \n\t ')).toBe('invalid')
    expect(commentProblem('Love it')).toBeNull()
    expect(commentProblem('a'.repeat(COMMENT_MAX))).toBeNull()
    expect(commentProblem(`  ${'a'.repeat(COMMENT_MAX)}  `)).toBeNull()
    expect(commentProblem('a'.repeat(COMMENT_MAX + 1))).toBe('too_long')
    expect(commentProblem('😀'.repeat(COMMENT_MAX))).toBeNull()
  })

  it('sends on Enter, adds a line on Shift + Enter, and sends nothing on the Enter that ends a composition', () => {
    expect(sendsOnEnter({ key: 'Enter', shiftKey: false })).toBe(true)
    expect(sendsOnEnter({ key: 'Enter', shiftKey: true })).toBe(false)
    expect(sendsOnEnter({ key: 'Enter', shiftKey: false, isComposing: true })).toBe(false)
    expect(sendsOnEnter({ key: 'a', shiftKey: false })).toBe(false)
  })

  it('puts a new comment at the end with the new count, an edited one in its place, and takes a deleted one out', () => {
    const added = withComment(post, comment(2, { mine: true }), 2)
    expect(keys(added)).toEqual(['event1', 'comment1', 'comment2'])
    expect(added.comments_count).toBe(2)
    const edited = withEdited(added, comment(1, { body: 'Changed', edited: true }))
    expect(edited.timeline?.find(i => i.type === 'comment' && i.id === 1)).toMatchObject({ body: 'Changed', edited: true })
    expect(edited.timeline?.find(i => i.type === 'event')).toBe(event)
    const removed = withoutComment(edited, 1, 1)
    expect(keys(removed)).toEqual(['event1', 'comment2'])
    expect(removed.comments_count).toBe(1)
  })

  it('keeps the newest 200', () => {
    const full = { id: 5, timeline: Array.from({ length: 200 }, (_, i) => comment(i + 1)) } as unknown as PostDetail
    const added = withComment(full, comment(201), 201)
    expect(added.timeline).toHaveLength(200)
    expect(added.timeline?.[0].id).toBe(2)
    expect(added.timeline?.[199].id).toBe(201)
  })

  it('lets people edit their own comments, and delete their own or, as a manager, anyone’s', () => {
    expect(commentRights({ mine: true }, false)).toEqual({ edit: true, remove: true })
    expect(commentRights({ mine: false }, false)).toEqual({ edit: false, remove: false })
    expect(commentRights({ mine: false }, true)).toEqual({ edit: false, remove: true })
  })
})
