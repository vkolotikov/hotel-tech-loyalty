import { describe, expect, it } from 'vitest'
import { insertAt, insertHashtags, tooManyTags } from './snippetInsert'

describe('insertHashtags', () => {
  // Review Focus 3: "#Autumn" and "autumn" are one tag; the group's new ones go at the end.
  it('adds a group\'s tags after the ones typed, skipping any already there whatever its case or #', () => {
    expect(insertHashtags('#Autumn, hair', '#autumn #copper #HAIR')).toEqual({ value: '#Autumn hair #copper', added: 1 })
    expect(insertHashtags('', '#a #b')).toEqual({ value: '#a #b', added: 2 })
    expect(insertHashtags('#a', '#a')).toEqual({ value: '#a', added: 0 })
  })
})

describe('tooManyTags', () => {
  it('warns past Instagram\'s 30, counting what the field holds after the insert, and says nothing for other platforms', () => {
    const thirty = Array.from({ length: 30 }, (_, i) => `#t${i}`).join(' ')
    expect(tooManyTags('instagram', thirty)).toBeNull()
    expect(tooManyTags('instagram', insertHashtags(thirty, '#one-more').value)).toEqual({ count: 31, limit: 30 })
    expect(tooManyTags('linkedin', `${thirty} #more`)).toBeNull()
  })
})

describe('insertAt', () => {
  it('puts a snippet at the cursor, over a selection', () => {
    expect(insertAt('Hello world', 'big ', { start: 6, end: 6 }, true)).toEqual({ value: 'Hello big world', caret: 10 })
    expect(insertAt('Hello world', 'there', { start: 6, end: 11 }, false)).toEqual({ value: 'Hello there', caret: 11 })
  })

  it('without a cursor, at the end: on a line of its own in a text, after a space in a line', () => {
    expect(insertAt('Warm tones.', 'See you!', null, true)).toEqual({ value: 'Warm tones.\nSee you!', caret: 20 })
    expect(insertAt('Book now', 'today', null, false)).toEqual({ value: 'Book now today', caret: 14 })
    expect(insertAt('', 'See you!', null, true)).toEqual({ value: 'See you!', caret: 8 })
  })
})
