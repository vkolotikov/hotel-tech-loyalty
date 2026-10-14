import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { firstFocus, focusTarget, fold, nextActive, opensShortcuts } from './findCore'

describe('fold', () => {
  it('lowers the case and takes the accents off, so "emilie" finds "Émilie"', () => {
    expect(fold('Émilie')).toBe('emilie')
    expect(fold('MIA')).toBe('mia')
  })

  // Raw combining marks in a regex are invisible, attach to the bracket beside them, and vanish under any tool
  // that strips or normalises them — and accent folding would silently stop working. The range is written as escapes.
  it('writes the accent range as escapes, not as invisible combining marks', () => {
    const source = readFileSync(new URL('./findCore.ts', import.meta.url), 'utf8')
    const mark = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`)
    const slash = String.fromCharCode(92)
    expect(mark.test(source), 'raw combining marks in findCore.ts').toBe(false)
    expect(source).toContain(`${slash}u0300-${slash}u036f`)
  })
})

describe('nextActive', () => {
  const ids = ['a', 'b', 'c']
  it('moves down and up one option at a time', () => {
    expect(nextActive(ids, 'a', 1)).toBe('b')
    expect(nextActive(ids, 'c', -1)).toBe('b')
  })
  it('wraps at both ends', () => {
    expect(nextActive(ids, 'c', 1)).toBe('a')
    expect(nextActive(ids, 'a', -1)).toBe('c')
  })
  it('starts from the first option when the current one is gone, and has nowhere to go when there is nothing', () => {
    expect(nextActive(ids, 'zzz', 1)).toBe('b')
    expect(nextActive(ids, null, -1)).toBe('c')
    expect(nextActive([], 'a', 1)).toBeNull()
  })
})

describe('opensShortcuts', () => {
  it('is "?" in an empty box, the one place the footer says it works', () => {
    expect(opensShortcuts('?', '')).toBe(true)
    expect(opensShortcuts('?', 'a')).toBe(false) // a question mark in a search is a character
    expect(opensShortcuts('?', ' ')).toBe(false)
    expect(opensShortcuts('/', '')).toBe(false)
    expect(opensShortcuts('Enter', '')).toBe(false)
  })
})

describe('focusTarget', () => {
  const el = (isConnected = true, disabled?: boolean) => ({ isConnected, disabled, focus: () => {} })
  const body = {}
  it('is where the person was', () => {
    const before = el()
    expect(focusTarget(before, body, [el(), el()])).toBe(before)
  })
  it('falls back, in order, when the person was on nothing in particular (Safari leaves the page body after a click on a button)', () => {
    const button = el(), main = el()
    expect(focusTarget(body as never, body, [button, main])).toBe(button)
    expect(focusTarget(null, body, [button, main])).toBe(button)
    expect(focusTarget(body as never, body, [null, main])).toBe(main)
  })
  it('falls back when the place is gone from the page, and is nothing when nothing is left', () => {
    const button = el(), main = el()
    expect(focusTarget(el(false), body, [button, main])).toBe(button)
    expect(focusTarget(el(false), body, [el(false), main])).toBe(main)
    expect(focusTarget(el(false), body, [el(false)])).toBeNull()
    expect(focusTarget(null, body, [])).toBeNull()
  })
  it('skips a place that cannot take focus: a disabled button (Find is switched off when the workspace stops) goes to main', () => {
    const button = el(true, true), main = el()
    expect(focusTarget(null, body, [button, main])).toBe(main)
    expect(focusTarget(body as never, body, [button, main])).toBe(main)
    // Where the person was can be disabled by now, too.
    expect(focusTarget(button, body, [main])).toBe(main)
    expect(focusTarget(null, body, [button])).toBeNull()
    // An enabled control, and one with no `disabled` at all (main), are fine.
    const enabled = el(true, false)
    expect(focusTarget(null, body, [enabled, main])).toBe(enabled)
    expect(focusTarget(null, body, [button, main])).toBe(main)
  })
})

describe('firstFocus', () => {
  it('keeps where the focus was when a dialog first opened: React\'s development re-run finds the dialog\'s own button focused', () => {
    const card = { name: 'card' }, close = { name: 'close' }
    const slot: { current: { name: string } | null | undefined } = { current: undefined }
    expect(firstFocus(slot, card)).toBe(card)
    expect(firstFocus(slot, close)).toBe(card)
    expect(slot.current).toBe(card)
  })
  it('counts "nothing focused" as an answer, not as no answer', () => {
    const slot: { current: object | null | undefined } = { current: undefined }
    expect(firstFocus(slot, null)).toBeNull()
    expect(firstFocus(slot, { name: 'close' })).toBeNull()
  })
})
