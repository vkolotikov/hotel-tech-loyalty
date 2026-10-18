import { describe, expect, it } from 'vitest'
import en from '../i18n/content.en.json'
import type { InboxItem } from '../lib/types'
import { BELL_LIST_CLASS, BELL_TEXT, badgeText, bellItems } from './bellMath'

// Found by eyes on a 390 px phone: right-aligned to the bell (left of New post and the menu), the 320 px list ran off
// the screen's left edge. On a phone it is pinned to the screen with the page's 16 px gutters.
describe('the bell’s list on a phone', () => {
  it('is pinned inside the screen below the header, 16 px from each side', () => {
    expect(BELL_LIST_CLASS.split(' ')).toEqual(expect.arrayContaining(['w-80', 'max-sm:fixed', 'max-sm:inset-x-4', 'max-sm:top-14', 'max-sm:w-auto']))
  })
})

const t = (_key: string, fallback: string, vars?: Record<string, unknown>) => fallback.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
const when = (at: string) => `at ${at.slice(11, 16)}`
const item = (kind: InboxItem['kind'], more: Partial<InboxItem> = {}): InboxItem => ({
  id: `${kind}:1`, kind, post: { id: 5, platform: 'instagram', title: null, hook: 'Three colours', topic: 'Autumn', scheduled_date: '2026-10-07' },
  by: { id: 9, name: 'Maria' }, note: null, at: '2026-10-05T08:00:00.000000Z', unread: true, ...more,
})

describe('the "For you" bell (spec 2026-10-16 §8)', () => {
  it('words each kind as the English bundle does', () => {
    expect(en.bell.kind).toEqual(BELL_TEXT)
  })

  // Review Focus 4.
  it('shows no badge at zero, the number up to 99, then "99+"', () => {
    expect(badgeText(0)).toBe('')
    expect(badgeText(7)).toBe('7')
    expect(badgeText(99)).toBe('99')
    expect(badgeText(100)).toBe('99+')
  })

  it('says what happened to which post, with who, the note and when beneath, marking the news', () => {
    const [waiting, approved, back, comment] = bellItems([
      item('waiting', { by: { id: 7, name: 'Anna' }, unread: false }),
      item('approved'),
      item('sent_back', { note: 'Shorter, please.' }),
      item('comment', { note: 'Love it', post: { id: 6, platform: 'linkedin', title: null, hook: null, topic: null, scheduled_date: null } }),
    ], t, when)
    expect(waiting).toEqual({ id: 'waiting:1', label: 'Waiting for approval: Three colours', sub: 'Anna · at 08:00', mark: false })
    expect(approved).toEqual({ id: 'approved:1', label: 'Maria approved: Three colours', sub: 'at 08:00', mark: true })
    expect(back.sub).toBe('Shorter, please. · at 08:00')
    expect(comment.label).toBe('Maria commented: Untitled post')
  })

  // Review Focus 5.
  it('names someone who has left "Former team member", and nobody for a waiting post the AI wrote', () => {
    const [left, ai] = bellItems([item('comment', { by: null, note: 'Hi' }), item('waiting', { by: null })], t, when)
    expect(left.label).toBe('Former team member commented: Three colours')
    expect(ai.sub).toBe('at 08:00')
  })
})
