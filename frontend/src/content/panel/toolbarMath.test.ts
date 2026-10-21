import { describe, expect, it } from 'vitest'
import { EMOJI, EMOJI_GROUPS } from './emojiData'
import { gridMove, linkToInsert, pushRecent, searchEmoji, spacedWord } from './toolbarMath'

describe('the emoji list (spec 2026-10-21 §7.5)', () => {
  it('holds about 160 emoji in eight groups, each emoji once and with a keyword to name it by', () => {
    expect(EMOJI_GROUPS).toHaveLength(8)
    expect(EMOJI.length).toBeGreaterThanOrEqual(150)
    expect(new Set(EMOJI.map(e => e.char)).size).toBe(EMOJI.length)
    expect(EMOJI.every(e => e.keys.length > 0 && e.keys.every(k => k === k.toLowerCase()))).toBe(true)
  })
})

describe('searchEmoji', () => {
  it('finds an emoji by the start of any of its keywords, ignoring case', () => {
    expect(searchEmoji('hea', EMOJI).map(e => e.char)).toContain('❤️')
    expect(searchEmoji('CAKE', EMOJI).map(e => e.char)).toContain('🎂')
    expect(searchEmoji('  party ', EMOJI).map(e => e.char)).toContain('🎉')
  })

  it('gives every emoji for an empty search and none for words it does not know', () => {
    expect(searchEmoji('', EMOJI)).toHaveLength(EMOJI.length)
    expect(searchEmoji('zzzz', EMOJI)).toEqual([])
  })
})

describe('pushRecent', () => {
  it('puts the emoji first, once, and keeps at most 16', () => {
    expect(pushRecent(['😀', '🎉'], '🎉')).toEqual(['🎉', '😀'])
    expect(pushRecent([], '🎉')).toEqual(['🎉'])
    const full = pushRecent(Array.from({ length: 16 }, (_, i) => String(i)), 'x')
    expect(full).toHaveLength(16)
    expect(full[0]).toBe('x')
    expect(full).not.toContain('15')
  })
})

describe('linkToInsert', () => {
  it('puts the post’s short link, else a web address typed in the Link field, else asks for one', () => {
    expect(linkToInsert('https://sites.hexa-tech.uk/go/abc', '')).toBe('https://sites.hexa-tech.uk/go/abc')
    expect(linkToInsert('https://sites.hexa-tech.uk/go/abc', 'https://lumiere.example')).toBe('https://sites.hexa-tech.uk/go/abc')
    expect(linkToInsert(null, ' https://lumiere.example/autumn ')).toBe('https://lumiere.example/autumn')
    expect(linkToInsert(null, 'http://lumiere.example')).toBe('http://lumiere.example')
    expect(linkToInsert(null, 'lumiere')).toBeNull()
    expect(linkToInsert(null, 'javascript:alert(1)')).toBeNull()
    expect(linkToInsert(null, '')).toBeNull()
  })
})

// Found by the release check's browser pass: a link put at the cursor stuck to the word before it ("hour.https://…"),
// which the networks then do not read as a link.
describe('spacedWord', () => {
  it('gives a link a space on each side where the text has none, and none where it has', () => {
    expect(spacedWord('A trim.', 7, 7, 'https://x.example')).toBe(' https://x.example')
    expect(spacedWord('A trim. ', 8, 8, 'https://x.example')).toBe('https://x.example')
    expect(spacedWord('Book now', 0, 0, 'https://x.example')).toBe('https://x.example ')
    expect(spacedWord('Book\nnow', 5, 5, 'https://x.example')).toBe('https://x.example ')
    expect(spacedWord('Book here now', 5, 9, 'https://x.example')).toBe('https://x.example')
    expect(spacedWord('', 0, 0, 'https://x.example')).toBe('https://x.example')
  })
})

describe('gridMove', () => {
  it('moves through the emoji grid with the arrows, a row at a time up and down, and stays inside it', () => {
    expect(gridMove(0, 'ArrowRight', 20, 8)).toBe(1)
    expect(gridMove(3, 'ArrowLeft', 20, 8)).toBe(2)
    expect(gridMove(3, 'ArrowDown', 20, 8)).toBe(11)
    expect(gridMove(11, 'ArrowUp', 20, 8)).toBe(3)
    expect(gridMove(0, 'ArrowLeft', 20, 8)).toBe(0)
    expect(gridMove(19, 'ArrowRight', 20, 8)).toBe(19)
    expect(gridMove(15, 'ArrowDown', 20, 8)).toBe(19)
    expect(gridMove(5, 'ArrowUp', 20, 8)).toBe(5)
    expect(gridMove(4, 'Home', 20, 8)).toBe(0)
    expect(gridMove(4, 'End', 20, 8)).toBe(19)
    expect(gridMove(4, 'Enter', 20, 8)).toBeNull()
  })
})
