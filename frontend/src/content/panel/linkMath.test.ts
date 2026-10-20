import { describe, expect, it } from 'vitest'
import en from '../i18n/content.en.json'
import type { ShortLinkFacts } from '../lib/types'
import { LINK_NOTES, barsOf, linkState } from './linkMath'

const link = (more: Partial<ShortLinkFacts> = {}): ShortLinkFacts => ({
  code: 'abc2345', short_url: 'https://sites.hexa-tech.uk/go/abc2345', destination: 'https://lumiere.example/autumn', on: true,
  clicks: 0, clicks_bio: 0, days: [], ...more,
})

describe('the short link’s note (spec 2026-10-19 §5.1, §5.5)', () => {
  it('says nothing without a Link, and that the short link comes once the post is saved when one is typed', () => {
    expect(linkState('', null)).toBe('none')
    expect(linkState('   ', undefined)).toBe('none')
    expect(linkState('https://lumiere.example', null)).toBe('pending')
  })

  // Review Focus 1: a Link already out in the world.
  it('warns that clearing switches the short link off, and that a new address keeps the code', () => {
    expect(linkState('https://lumiere.example/autumn', link())).toBe('live')
    expect(linkState(' https://lumiere.example/autumn ', link())).toBe('live')
    expect(linkState('https://lumiere.example/winter', link())).toBe('moving')
    expect(linkState('', link())).toBe('clearing')
  })

  it('says a switched-off short link is off, and that a typed address switches it back on', () => {
    expect(linkState('', link({ on: false, destination: null }))).toBe('off')
    expect(linkState('https://lumiere.example', link({ on: false, destination: null }))).toBe('reviving')
  })

  it('reads in the English bundle’s words', () => {
    expect(en.links.note).toEqual(LINK_NOTES)
  })
})

describe('the click bars (spec §5.5)', () => {
  it('give each day its share of the busiest day; a day with clicks never vanishes, a day without is empty', () => {
    expect(barsOf([{ day: 'a', clicks: 0 }, { day: 'b', clicks: 10 }, { day: 'c', clicks: 5 }]).map(b => b.height)).toEqual([0, 100, 50])
    expect(barsOf([{ day: 'a', clicks: 1 }, { day: 'b', clicks: 200 }]).map(b => b.height)).toEqual([8, 100])
    expect(barsOf([{ day: 'a', clicks: 0 }, { day: 'b', clicks: 0 }]).map(b => b.height)).toEqual([0, 0])
    expect(barsOf([])).toEqual([])
  })
})
