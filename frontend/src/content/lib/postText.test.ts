import { describe, expect, it } from 'vitest'
import { cardLine, copyText, parseHashtags } from './postText'

describe('cardLine', () => {
  it('is the hook, else the title, else the topic, skipping blanks', () => {
    expect(cardLine({ hook: 'Hook', title: 'Title', topic: 'Topic' })).toBe('Hook')
    expect(cardLine({ hook: '  ', title: 'Title', topic: 'Topic' })).toBe('Title')
    expect(cardLine({ hook: null, title: null, topic: 'Topic' })).toBe('Topic')
    expect(cardLine({ hook: null, title: '', topic: null })).toBe('')
  })
})

describe('copyText', () => {
  it('joins hook, text, call to action and hashtags with a blank line, adding the # a tag lacks', () => {
    expect(copyText({ hook: 'Three colours for October', main_copy: 'Warm tones are back.\nBook now.', cta: 'Book online', hashtags: ['autumn', '#hair'] }))
      .toBe('Three colours for October\n\nWarm tones are back.\nBook now.\n\nBook online\n\n#autumn #hair')
    expect(copyText({ hook: null, main_copy: 'Only text', cta: '  ', hashtags: [] })).toBe('Only text')
  })
})

describe('parseHashtags', () => {
  it('splits on spaces and commas and drops empties', () => {
    expect(parseHashtags(' #autumn, hair  #colour,,')).toEqual(['#autumn', 'hair', '#colour'])
    expect(parseHashtags('')).toEqual([])
  })
})
