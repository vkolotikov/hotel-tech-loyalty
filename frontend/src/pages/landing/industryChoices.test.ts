import { describe, expect, it } from 'vitest'
import {
  INDUSTRY_NAMES, industryCards, industryName, resolveIndustry, sectionsForIndustry, verticalFor,
  type IndustryOption,
} from './industryChoices'
import { PALETTES } from './designChoices'

/**
 * The industry step, proven where this repo's vitest can actually reach it.
 *
 * `vitest.config.ts` is node-env and pure-function-only — no jsdom, no React
 * Testing Library — so nothing here renders a card. What IS provable, and
 * what these tests hold, is everything the component would otherwise have to
 * get right inline: which card opens selected, that a card carries the
 * industry's own words and its own palette's accent, that a stale draft can
 * never send an id the endpoint would refuse, and that switching industry
 * cannot leave a section row in the payload the created page will not own.
 */

/** The two profiles that differ in every way this module cares about:
 *  vocabulary, accent, default palette and — the load-bearing one —
 *  whether `booking` is in the section list at all. Values mirror
 *  `App\Landing\IndustryProfile::all()`; the shape is the wire's. */
const HOTEL: IndustryOption = {
  id: 'hotel',
  services_label: 'Rooms & Suites',
  people_label: 'At your service',
  primary_cta: 'Book your stay',
  accent: '#1B3A5C',
  palette: 'midnight_brass',
  sections: ['hero', 'services', 'about', 'team', 'reviews', 'booking', 'contact'],
}

const EDUCATION: IndustryOption = {
  id: 'education',
  services_label: 'Courses',
  people_label: 'Instructors',
  primary_cta: 'Book a lesson',
  accent: '#35509E',
  palette: 'slate_amber',
  sections: ['hero', 'services', 'about', 'team', 'reviews', 'contact'],
}

const OPTIONS = [HOTEL, EDUCATION]

/**
 * THE TRADE WHOSE DESIGNS AN INDUSTRY IS OFFERED FIRST — the final
 * scenario, step 1, read half.
 *
 * `LandingOnboardingService::INDUSTRY_VERTICALS` is the ONE place the join
 * lives; this is the client end of it, and every one of these cases is about
 * the same property: the answer comes off the SERVED row and nothing here
 * decides it.
 */
describe('verticalFor', () => {
  const BEAUTY: IndustryOption = { ...EDUCATION, id: 'beauty', vertical: 'beauty' }
  const SERVED = [HOTEL, EDUCATION, BEAUTY]

  it('reads the trade the server published for that industry', () => {
    expect(verticalFor(SERVED, 'beauty')).toBe('beauty')
  })

  /*
   * Seven of the nine industries have no kit drawn for them yet, and the
   * honest answer for all of them is null — which the picker reads as "show
   * every design under one heading", never as "show none".
   */
  it('answers null for an industry no kit has been drawn for', () => {
    expect(verticalFor(SERVED, 'hotel')).toBeNull()
    expect(verticalFor(SERVED, 'education')).toBeNull()
  })

  it('answers null for an industry the response never carried', () => {
    expect(verticalFor(SERVED, 'medical')).toBeNull()
    expect(verticalFor([], 'beauty')).toBeNull()
  })

  /*
   * An older backend publishes no such key, and a blank is not an answer
   * either — both land on the same "no trade of its own" as an industry
   * without kits, which is the only state a picker can act on honestly.
   */
  it('answers null when the key is absent or blank', () => {
    expect(verticalFor([{ ...BEAUTY, vertical: undefined }], 'beauty')).toBeNull()
    expect(verticalFor([{ ...BEAUTY, vertical: '' }], 'beauty')).toBeNull()
    expect(verticalFor([{ ...BEAUTY, vertical: null }], 'beauty')).toBeNull()
  })
})

describe('industryName', () => {
  it('names every id the platform ships', () => {
    // The nine of Organization::INDUSTRIES. Spelled out rather than
    // iterated over INDUSTRY_NAMES itself, so a name deleted from the map
    // fails here instead of quietly shrinking the expectation with it.
    for (const id of [
      'hotel', 'beauty', 'medical', 'restaurant',
      'legal', 'real_estate', 'education', 'fitness', 'other',
    ]) {
      expect(INDUSTRY_NAMES[id], `no English name authored for '${id}'`).toBeTruthy()
    }
    expect(Object.keys(INDUSTRY_NAMES)).toHaveLength(9)
  })

  it('never shows a customer a raw snake_case id', () => {
    expect(industryName('real_estate')).toBe('Real estate')
    // An industry the backend gains before this build learns its name:
    // humanised, not printed verbatim and not blank.
    expect(industryName('pet_grooming')).toBe('Pet Grooming')
    expect(industryName('veterinary')).toBe('Veterinary')
  })
})

describe('resolveIndustry', () => {
  it('opens on the organisation’s own industry when the tenant has chosen nothing', () => {
    expect(resolveIndustry(OPTIONS, undefined, 'education')).toBe('education')
  })

  it('prefers the tenant’s own choice over the organisation’s industry', () => {
    expect(resolveIndustry(OPTIONS, 'hotel', 'education')).toBe('hotel')
  })

  /**
   * The one narrowing between a draft (localStorage, hand-editable,
   * possibly written by a build that offered an id this one does not) and
   * the request. `mergeFormDraft` deliberately does NOT guard `industry`
   * against a hardcoded list the way it must for palettes and pairings —
   * this is where that guard lives instead, against the ids the SERVER
   * actually offered, which cannot drift from what the endpoint accepts.
   */
  it('drops a drafted id the server is not offering, falling back to the current industry', () => {
    expect(resolveIndustry(OPTIONS, 'lunar_mining', 'education')).toBe('education')
  })

  it('drops a current industry the server is not offering rather than sending it', () => {
    expect(resolveIndustry(OPTIONS, undefined, 'lunar_mining')).toBe('')
  })

  it('resolves to nothing at all when the response carried no industries', () => {
    // An older backend. The payload then omits `industry` entirely and the
    // page is filed under the org's own industry, exactly as before this
    // step existed.
    expect(resolveIndustry([], 'hotel', 'education')).toBe('')
  })
})

describe('industryCards', () => {
  it('keeps the order the server sent', () => {
    expect(industryCards(OPTIONS, 'hotel').map(c => c.id)).toEqual(['hotel', 'education'])
  })

  it('marks exactly the selected card', () => {
    const cards = industryCards(OPTIONS, 'education')
    expect(cards.map(c => c.selected)).toEqual([false, true])
  })

  it('marks none when the selection resolved to nothing', () => {
    expect(industryCards(OPTIONS, '').every(c => !c.selected)).toBe(true)
  })

  /**
   * The whole point of the step: two cards must not look or read alike.
   * A card carries the industry's OWN nouns and its OWN button text —
   * untranslated, because these are the literal words the published page
   * will print (IndustryProfile writes them in English), not admin chrome.
   */
  it('shows each industry’s own vocabulary and call to action', () => {
    const [hotel, education] = industryCards(OPTIONS, 'hotel')

    expect(hotel.vocabulary).toEqual(['Rooms & Suites', 'At your service'])
    expect(hotel.primaryCta).toBe('Book your stay')
    expect(education.vocabulary).toEqual(['Courses', 'Instructors'])
    expect(education.primaryCta).toBe('Book a lesson')
  })

  it('paints each card in its own palette’s accent, not a shared one', () => {
    const [hotel, education] = industryCards(OPTIONS, 'hotel')

    const accentOf = (id: string) => PALETTES.find(p => p.id === id)!.accent

    expect(hotel.paletteAccent).toBe(accentOf('midnight_brass'))
    expect(education.paletteAccent).toBe(accentOf('slate_amber'))
    expect(hotel.paletteAccent).not.toBe(education.paletteAccent)
    // The industry's HOUSE accent is a separate colour from its palette's
    // (the CTA is drawn in one, the eyebrows in the other) — a card that
    // conflated them would show the same swatch twice.
    expect(hotel.accent).toBe('#1B3A5C')
  })

  it('falls back to the no-choice palette for an unrecognised palette id', () => {
    // paletteFor's own documented fallback — a card must always have
    // something to render, never `undefined` piped into a style attribute.
    const [card] = industryCards([{ ...HOTEL, palette: 'not_a_palette' }], 'hotel')
    expect(card.paletteAccent).toBe(PALETTES.find(p => p.id === 'porcelain')!.accent)
  })
})

describe('sectionsForIndustry', () => {
  const rows = [
    { key: 'hero', label: 'Opening' },
    { key: 'services', label: 'Rooms & Suites' },
    { key: 'team', label: 'At your service' },
    { key: 'booking', label: 'Booking' },
    { key: 'contact', label: 'Contact' },
  ]

  /**
   * The bug this function exists to prevent: the prefill's section rows
   * describe the industry the ORG is on, and `booking` is in the list for
   * `hotel`/`beauty` only. Post it under an industry whose template does
   * not own it and `LandingOnboardingService::chosenSections()` refuses the
   * whole request ("This page has no section called 'booking'.") — the
   * Create button 422ing on a section the wizard itself put in front of
   * the tenant.
   */
  it('drops a band the chosen industry’s page will not have', () => {
    expect(sectionsForIndustry(rows, OPTIONS, 'education').map(r => r.key))
      .toEqual(['hero', 'services', 'team', 'contact'])
  })

  it('keeps every band when the chosen industry has them all', () => {
    expect(sectionsForIndustry(rows, OPTIONS, 'hotel').map(r => r.key))
      .toEqual(['hero', 'services', 'team', 'booking', 'contact'])
  })

  it('relabels the two industry-worded bands and leaves the rest alone', () => {
    const out = sectionsForIndustry(rows, OPTIONS, 'education')

    expect(out.find(r => r.key === 'services')!.label).toBe('Courses')
    expect(out.find(r => r.key === 'team')!.label).toBe('Instructors')
    // Not industry vocabulary — SECTION_COPY's own fixed labels.
    expect(out.find(r => r.key === 'hero')!.label).toBe('Opening')
    expect(out.find(r => r.key === 'contact')!.label).toBe('Contact')
  })

  it('does not mutate the rows it was given', () => {
    const before = JSON.parse(JSON.stringify(rows))
    sectionsForIndustry(rows, OPTIONS, 'education')
    expect(rows).toEqual(before)
  })

  it('changes nothing when the industry is unknown or unset', () => {
    // An older backend serving no `industries` at all: the wizard behaves
    // exactly as it did before this step shipped.
    expect(sectionsForIndustry(rows, [], 'hotel')).toEqual(rows)
    expect(sectionsForIndustry(rows, OPTIONS, '')).toEqual(rows)
  })
})
