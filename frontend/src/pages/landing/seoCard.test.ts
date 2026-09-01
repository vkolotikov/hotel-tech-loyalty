import { describe, expect, it } from 'vitest'
import {
  searchPreview, seoField, seoPayload, SEO_DESCRIPTION_PREVIEW, SEO_TITLE_PREVIEW,
} from './seoCard'

/**
 * Template fidelity 1.5 — the `seo` column, which the endpoint has accepted
 * since it existed and nothing has ever written to.
 *
 * Two things are worth proving here and both are plain functions:
 *
 *  1. WHAT REACHES THE WIRE. Both layouts read `seo.title` and
 *     `seo.description` with `??`, so a stored empty string WINS the
 *     fallback chain and publishes an empty `<title>` and an empty
 *     `<meta name="description">`. A tenant who types a tagline and clears
 *     it again must end up exactly where they started, not worse off than
 *     one who never opened the card. `seoPayload` is the only thing
 *     standing between those two outcomes.
 *
 *  2. WHAT THE TENANT IS SHOWN. The preview is the whole argument for the
 *     card: the honest render of a BLANK description is what tells somebody
 *     why the field is worth filling in.
 */

const base = { businessName: 'Maison Mimi', headline: 'Rest, restored.', url: 'https://sites.example.test/maison-mimi' }

describe('seoField', () => {
  it('reads a string leaf', () => {
    expect(seoField({ title: 'Maison Mimi — Bathhouse' }, 'title')).toBe('Maison Mimi — Bathhouse')
  })

  /** `seo` is a schemaless JSON column with no CHECK behind it: a migration,
   *  an import or a raw UPDATE can leave any scalar — or an object — in it,
   *  and a non-string reaching a `value=` prop is a React warning at best. */
  it('reads every non-string shape as empty', () => {
    for (const leaf of [7, true, null, undefined, {}, []] as unknown[]) {
      expect(seoField({ title: leaf } as Record<string, unknown>, 'title')).toBe('')
    }
    expect(seoField(null, 'title')).toBe('')
    expect(seoField(undefined, 'description')).toBe('')
  })
})

describe('seoPayload', () => {
  it('stores a trimmed value', () => {
    expect(seoPayload(null, { title: '  Maison Mimi  ' })).toEqual({ title: 'Maison Mimi' })
  })

  /**
   * THE RULE THAT EARNS ITS PLACE. `update()` replaces the column wholesale
   * and both layouts read it with `??`, so a stored `''` is not the same as
   * an absent key — it wins, and publishes nothing.
   */
  it('removes a leaf the tenant cleared rather than storing a blank one', () => {
    expect(seoPayload({ title: 'Old', description: 'Kept' }, { title: '' }))
      .toEqual({ description: 'Kept' })
    expect(seoPayload({ title: 'Old' }, { title: '   ' })).toEqual({})
  })

  /** This card owns two leaves. A third, written by something else or by a
   *  later phase, is not its to drop on a save that never mentioned it. */
  it('carries every other leaf through untouched', () => {
    expect(seoPayload({ title: 'A', og_image: 'x.webp' }, { description: 'B' }))
      .toEqual({ title: 'A', og_image: 'x.webp', description: 'B' })
  })

  it('never mutates the object it was handed', () => {
    const stored = { title: 'A' }
    seoPayload(stored, { title: '' })
    expect(stored).toEqual({ title: 'A' })
  })

  it('starts from {} for every shape that is not a plain object', () => {
    expect(seoPayload(null, { title: 'A' })).toEqual({ title: 'A' })
    expect(seoPayload([] as unknown as Record<string, unknown>, { title: 'A' })).toEqual({ title: 'A' })
  })
})

describe('searchPreview', () => {
  it('shows what the tenant typed', () => {
    const out = searchPreview({ ...base, title: 'Maison Mimi — Bathhouse', description: 'A quiet bathhouse in Peckham.' })
    expect(out.title).toBe('Maison Mimi — Bathhouse')
    expect(out.description).toBe('A quiet bathhouse in Peckham.')
    expect(out.descriptionIsEmpty).toBe(false)
    expect(out.url).toBe(base.url)
  })

  /**
   * The layouts' own chain — `seo.title ?? contact name ?? hero.headline` —
   * restated, because the state every page is in TODAY is "blank", and the
   * card is worthless if it cannot show what blank publishes.
   */
  it('falls back the way the layout does when the title is blank', () => {
    expect(searchPreview({ ...base, title: '', description: '' }).title).toBe('Maison Mimi')
    expect(searchPreview({ ...base, title: '  ', businessName: '', description: '' }).title)
      .toBe('Rest, restored.')
    expect(searchPreview({ ...base, title: '', businessName: '', headline: '', description: '' }).title)
      .toBe('')
  })

  it('reports a blank description as blank rather than as an empty string to print', () => {
    expect(searchPreview({ ...base, title: '', description: '   ' }).descriptionIsEmpty).toBe(true)
  })

  it('truncates at roughly what a search result shows, on a word boundary', () => {
    const long = 'A quiet bathhouse in Peckham with steam rooms, a cold plunge and unhurried treatments '
      + 'for people who would rather not be spoken to before noon or afterwards either.'
    const out = searchPreview({ ...base, title: '', description: long })

    expect(out.description.length).toBeLessThanOrEqual(SEO_DESCRIPTION_PREVIEW + 1)
    expect(out.description.endsWith('…')).toBe(true)
    // A word boundary, not a severed syllable — the trimmed body must be a
    // prefix of the original.
    expect(long.startsWith(out.description.slice(0, -1))).toBe(true)
  })

  it('leaves a title that fits exactly alone', () => {
    const title = 'x'.repeat(SEO_TITLE_PREVIEW)
    expect(searchPreview({ ...base, title, description: '' }).title).toBe(title)
    expect(searchPreview({ ...base, title: title + 'y', description: '' }).title.endsWith('…')).toBe(true)
  })
})
