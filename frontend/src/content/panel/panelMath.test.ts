import { describe, expect, it } from 'vitest'
import { activityCount, dayLine, foldOpens, hookRows, openingTab, panelMode, saveLabelKey, tabAfter } from './panelMath'

describe('the panel\'s place and header (spec 2026-10-21 §7.1, §7.2)', () => {
  it('sits beside the page from 1280 px, over it from 640 px, and fills a phone', () => {
    expect(panelMode(1440)).toBe('docked')
    expect(panelMode(1280)).toBe('docked')
    expect(panelMode(1279)).toBe('over')
    expect(panelMode(640)).toBe('over')
    expect(panelMode(639)).toBe('full')
  })

  it('names the post\'s day under the header in full, and nothing without a day', () => {
    expect(dayLine('2026-10-23', 'en-GB')).toBe('Friday, 23 October 2026')
    expect(dayLine(null, 'en-GB')).toBeNull()
    expect(dayLine('', 'en-GB')).toBeNull()
  })
})

describe('the panel\'s tabs and footer (spec 2026-10-21 §7.3, §7.6)', () => {
  it('moves through Content, AI tools and Activity with the arrows, wrapping, and Home and End', () => {
    expect(tabAfter('content', 'ArrowRight')).toBe('ai')
    expect(tabAfter('ai', 'ArrowRight')).toBe('activity')
    expect(tabAfter('activity', 'ArrowRight')).toBe('content')
    expect(tabAfter('content', 'ArrowLeft')).toBe('activity')
    expect(tabAfter('ai', 'Home')).toBe('content')
    expect(tabAfter('content', 'End')).toBe('activity')
    expect(tabAfter('content', 'Enter')).toBeNull()
  })

  it('says Create post for a new post, Save draft for a draft, and Save for any other status', () => {
    expect(saveLabelKey(false, 'draft')).toEqual(['content.panel.create', 'Create post'])
    expect(saveLabelKey(true, 'draft')).toEqual(['content.panel.save_draft', 'Save draft'])
    expect(saveLabelKey(true, 'idea')).toEqual(['content.panel.save', 'Save'])
    expect(saveLabelKey(true, 'approved')).toEqual(['content.panel.save', 'Save'])
  })
})

describe('the tab the panel opens on (final review)', () => {
  it('opens a new post on Content, a post the AI is writing on AI tools, and any other on the tab last used', () => {
    expect(openingTab(true, false, 'activity')).toBe('content')
    expect(openingTab(false, true, 'content')).toBe('ai')
    expect(openingTab(true, true, 'activity')).toBe('content')
    expect(openingTab(false, false, 'activity')).toBe('activity')
  })
})

describe('the Activity tab\'s number (final review)', () => {
  it('counts the comments of the post as last read, which a comment changes without a new version', () => {
    const post = { id: 5, comments_count: 1 } as Parameters<typeof activityCount>[1]
    expect(activityCount({ id: 5, comments_count: 3 } as Parameters<typeof activityCount>[0], post)).toBe(3)
    expect(activityCount({ id: 9, comments_count: 3 } as Parameters<typeof activityCount>[0], post)).toBe(1)
    expect(activityCount(undefined, post)).toBe(1)
    expect(activityCount(undefined, null)).toBe(0)
  })
})

describe('the hook box\'s height (final review)', () => {
  it('grows with the hook where the browser cannot size it to its words: two rows at least, six at most', () => {
    expect(hookRows('')).toBe(2)
    expect(hookRows('Three autumn shades')).toBe(2)
    expect(hookRows('A'.repeat(70))).toBe(3)
    expect(hookRows('one\ntwo\nthree')).toBe(3)
    expect(hookRows('A'.repeat(500))).toBe(6)
  })
})

describe('a folding section opening by itself (spec 2026-10-21 §7.4, §7.5)', () => {
  it('opens when something to see to appears in it or a tool puts something in it, and never closes by itself', () => {
    expect(foldOpens({ alert: false, reveal: 0 }, { alert: true, reveal: 0 })).toBe(true)
    expect(foldOpens({ alert: false, reveal: 0 }, { alert: false, reveal: 1 })).toBe(true)
    expect(foldOpens({ alert: true, reveal: 0 }, { alert: true, reveal: 0 })).toBe(false)
    expect(foldOpens({ alert: true, reveal: 0 }, { alert: false, reveal: 0 })).toBe(false)
  })
})
