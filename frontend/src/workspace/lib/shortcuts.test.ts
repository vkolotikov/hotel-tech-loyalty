import { describe, expect, it } from 'vitest'
import { onShortcuts, shortcutFor, type KeyLike, type ShortcutKeys } from './shortcuts'

type Mine = 'new' | 'today' | 'month' | 'prev' | 'next'
const KEYS: ShortcutKeys<Mine> = { letters: { n: 'new', t: 'today', m: 'month' }, arrows: { left: 'prev', right: 'next' } }
const NO_ARROWS: ShortcutKeys<'new'> = { letters: { n: 'new' } }
const body = { tagName: 'BODY', getAttribute: () => null, closest: () => null }
const key = (k: string, extra: Partial<KeyLike> = {}): KeyLike => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, target: body as unknown as EventTarget, ...extra })
const free = { modal: false }

describe('the shared shortcut engine', () => {
  it('reads each workspace\'s own letters, either case', () => {
    expect(shortcutFor(key('m'), free, KEYS)).toBe('month')
    expect(shortcutFor(key('M'), free, KEYS)).toBe('month')
    expect(shortcutFor(key('d'), free, KEYS)).toBeNull()
  })

  it('gives every workspace Find (Ctrl/⌘ K, "/") and the list of shortcuts ("?")', () => {
    expect(shortcutFor(key('k', { ctrlKey: true }), free, NO_ARROWS)).toBe('find')
    expect(shortcutFor(key('k', { metaKey: true }), free, NO_ARROWS)).toBe('find')
    expect(shortcutFor(key('/'), free, NO_ARROWS)).toBe('find')
    expect(shortcutFor(key('?'), free, NO_ARROWS)).toBe('help')
  })

  it('reaches the letters by their places on a Cyrillic layout, and Find and help by theirs', () => {
    expect(shortcutFor(key('ь', { code: 'KeyM' }), free, KEYS)).toBe('month')
    expect(shortcutFor(key('.', { code: 'Slash' }), free, KEYS)).toBe('find')
    expect(shortcutFor(key(',', { code: 'Slash', shiftKey: true }), free, KEYS)).toBe('help')
    // A Latin letter is never read by its place: AZERTY types "q" where a US keyboard has "a".
    expect(shortcutFor(key('q', { code: 'KeyA' }), free, KEYS)).toBeNull()
  })

  it('moves with the arrows only where the workspace gives them a meaning, and never on a grid stop', () => {
    expect(shortcutFor(key('ArrowLeft'), free, KEYS)).toBe('prev')
    expect(shortcutFor(key('ArrowRight'), free, KEYS)).toBe('next')
    expect(shortcutFor(key('ArrowLeft'), free, NO_ARROWS)).toBeNull()
    const stop = { ...body, closest: (s: string) => (s === '[data-stop]' ? {} : null) }
    expect(shortcutFor(key('ArrowRight', { target: stop as unknown as EventTarget }), free, KEYS)).toBeNull()
  })

  it('stays out of the way while typing and under a modal, except Ctrl K', () => {
    const input = { tagName: 'INPUT', getAttribute: () => 'text', closest: () => null }
    expect(shortcutFor(key('n', { target: input as unknown as EventTarget }), free, KEYS)).toBeNull()
    expect(shortcutFor(key('k', { ctrlKey: true, target: input as unknown as EventTarget }), free, KEYS)).toBe('find')
    expect(shortcutFor(key('n'), { modal: true }, KEYS)).toBeNull()
  })

  it('listens on a window and removes that same listener', () => {
    const listeners = new Set<(e: KeyboardEvent) => void>()
    const win = {
      addEventListener: (_: 'keydown', fn: (e: KeyboardEvent) => void) => { listeners.add(fn) },
      removeEventListener: (_: 'keydown', fn: (e: KeyboardEvent) => void) => { listeners.delete(fn) },
    }
    const hits: string[] = []
    const stop = onShortcuts(win, { querySelector: () => null }, KEYS, hit => { hits.push(hit) })
    for (const fn of listeners) fn(key('m') as unknown as KeyboardEvent)
    expect(hits).toEqual(['month'])
    stop()
    expect(listeners.size).toBe(0)
  })
})
