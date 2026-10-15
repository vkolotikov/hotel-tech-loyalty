import { describe, expect, it } from 'vitest'
import { shortcutFor, type KeyLike } from '../../workspace/lib/shortcuts'
import { CONTENT_KEYS } from './shortcuts'

const key = (k: string, more: Partial<KeyLike> = {}): KeyLike => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, target: null, ...more })
const hit = (e: KeyLike) => shortcutFor(e, { modal: false }, CONTENT_KEYS)
const card = { tagName: 'BUTTON', getAttribute: () => null, closest: (s: string) => (s === '[data-stop]' ? {} : null) }

describe('Content shortcuts', () => {
  it('N new post, T this week, W M L the views, the arrows page, / and Ctrl K find, ? help', () => {
    expect([hit(key('n')), hit(key('t')), hit(key('w')), hit(key('m')), hit(key('l'))]).toEqual(['new', 'today', 'week', 'month', 'list'])
    expect([hit(key('ArrowLeft')), hit(key('ArrowRight'))]).toEqual(['prev', 'next'])
    expect([hit(key('/')), hit(key('k', { ctrlKey: true })), hit(key('?'))]).toEqual(['find', 'find', 'help'])
  })

  it('reaches the letters by their place on a Cyrillic layout', () => {
    expect(hit(key('т', { code: 'KeyN' }))).toBe('new')
    expect(hit(key('ь', { code: 'KeyM' }))).toBe('month')
  })

  it('leaves a focused card its own arrows, and a key the card already took (Shift+arrow) alone', () => {
    expect(hit(key('ArrowLeft', { target: card as unknown as EventTarget }))).toBeNull()
    expect(hit(key('ArrowRight', { shiftKey: true, defaultPrevented: true }))).toBeNull()
  })
})
