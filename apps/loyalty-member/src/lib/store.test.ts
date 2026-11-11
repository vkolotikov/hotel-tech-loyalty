import { describe, expect, it } from 'vitest'
import raw from '../../store/listing.json'

/**
 * The store listing (`store/listing.json`) within each store's own limits, in all five languages, so a text that would
 * be refused at submission fails here first. App Store: name and subtitle 30, promotional text 170, keywords 100 bytes,
 * description and "what's new" 4000. Google Play: title 30, short description 80, full description 4000.
 */
interface Listing {
  languages: Record<string, {
    appStore: { name: string; subtitle: string; promotionalText: string; keywords: string; whatsNew: string }
    play: { title: string; shortDescription: string }
    description: string
  }>
}

const listing = raw as Listing
const chars = (text: string) => [...text].length

describe('the store listing', () => {
  it('is written in all five of the app’s languages', () => {
    expect(Object.keys(listing.languages).sort()).toEqual(['de', 'en', 'es', 'fr', 'ru'])
  })

  for (const [lang, text] of Object.entries(listing.languages)) {
    it(`fits every store limit in ${lang}`, () => {
      expect(chars(text.appStore.name)).toBeLessThanOrEqual(30)
      expect(chars(text.appStore.subtitle)).toBeLessThanOrEqual(30)
      expect(chars(text.appStore.promotionalText)).toBeLessThanOrEqual(170)
      expect(new TextEncoder().encode(text.appStore.keywords).length).toBeLessThanOrEqual(100)
      expect(text.appStore.keywords).not.toMatch(/, /)
      expect(chars(text.appStore.whatsNew)).toBeLessThanOrEqual(4000)
      expect(chars(text.play.title)).toBeLessThanOrEqual(30)
      expect(chars(text.play.shortDescription)).toBeLessThanOrEqual(80)
      expect(chars(text.description)).toBeLessThanOrEqual(4000)
      for (const value of [text.appStore.subtitle, text.appStore.promotionalText, text.play.shortDescription, text.description]) {
        expect(value.trim().length).toBeGreaterThan(0)
      }
    })
  }
})
