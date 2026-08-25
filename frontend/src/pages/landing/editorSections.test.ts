import { describe, expect, it } from 'vitest'
import {
  buildSectionRows, buildSectionsPayload, moveSection, orderedSections, toggleSection,
  SECTION_CONTENT_FIELDS, type EditorSectionRow, type PageSection, type SectionAvailability,
} from './editorSections'
import { SECTION_ORDER } from './sections'

const pageSections = (): PageSection[] => [
  { key: 'hero', enabled: true, sort: 0 },
  { key: 'services', enabled: true, sort: 1 },
  { key: 'about', enabled: true, sort: 2 },
  { key: 'team', enabled: true, sort: 3 },
  { key: 'reviews', enabled: false, sort: 4 },
  { key: 'booking', enabled: true, sort: 5 },
  { key: 'contact', enabled: true, sort: 6 },
]

const availability = (): SectionAvailability[] => [
  { key: 'hero', label: 'Opening', source_label: 'Your headline', available: true, count: 1 },
  { key: 'services', label: 'Treatments', source_label: 'Your Services screen', available: true, count: 12 },
  { key: 'about', label: 'About', source_label: 'Words you write', available: false, count: 0 },
  { key: 'team', label: 'Therapists', source_label: 'Your Team screen', available: true, count: 3 },
  { key: 'reviews', label: 'Reviews', source_label: 'Reviews you feature', available: false, count: 0 },
  { key: 'booking', label: 'Booking', source_label: 'Your booking button', available: true, count: 1 },
  { key: 'contact', label: 'Contact', source_label: 'Your address in Settings', available: true, count: 1 },
]

describe('orderedSections', () => {
  it('sorts by sort ascending', () => {
    const shuffled = [pageSections()[3], pageSections()[0], pageSections()[6]]
    expect(orderedSections(shuffled).map(s => s.key)).toEqual(['hero', 'team', 'contact'])
  })

  it('breaks a tied sort by key, so the result is a pure function of its input', () => {
    const tied: PageSection[] = [
      { key: 'team', enabled: true, sort: 1 },
      { key: 'about', enabled: true, sort: 1 },
    ]
    expect(orderedSections(tied).map(s => s.key)).toEqual(['about', 'team'])
  })

  it('does not mutate its input', () => {
    const input = pageSections()
    const copy = input.map(s => ({ ...s }))
    orderedSections(input.slice().reverse())
    expect(input).toEqual(copy)
  })
})

describe('buildSectionRows', () => {
  it('merges page state with availability, in sort order, every SECTION_ORDER key present', () => {
    const rows = buildSectionRows(pageSections(), availability())
    expect(rows.map(r => r.key)).toEqual(SECTION_ORDER)
    expect(rows[1]).toEqual({
      key: 'services', label: 'Treatments', sourceLabel: 'Your Services screen',
      available: true, count: 12, enabled: true, sort: 1,
    })
  })

  it('drops a page-section row with no matching availability entry', () => {
    const rows = buildSectionRows(pageSections(), availability().filter(a => a.key !== 'booking'))
    expect(rows.map(r => r.key)).not.toContain('booking')
    expect(rows).toHaveLength(6)
  })

  it('drops a page-section row whose key is not in SECTION_ORDER', () => {
    const withJunk: PageSection[] = [...pageSections(), { key: 'footer', enabled: true, sort: 7 }]
    const withJunkAvailability: SectionAvailability[] = [
      ...availability(),
      { key: 'footer', label: 'Footer', source_label: 'Settings', available: true, count: 1 },
    ]
    const rows = buildSectionRows(withJunk, withJunkAvailability)
    expect(rows.map(r => r.key)).not.toContain('footer')
    expect(rows).toHaveLength(7)
  })
})

describe('moveSection', () => {
  it('moving a middle row up swaps it with its predecessor and renumbers sort 0..n-1', () => {
    const next = moveSection(pageSections(), 'about', 'up')
    expect(orderedSections(next).map(s => s.key)).toEqual(['hero', 'about', 'services', 'team', 'reviews', 'booking', 'contact'])
    expect(orderedSections(next).map(s => s.sort)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('moving a middle row down swaps it with its successor', () => {
    const next = moveSection(pageSections(), 'services', 'down')
    expect(orderedSections(next).map(s => s.key)).toEqual(['hero', 'about', 'services', 'team', 'reviews', 'booking', 'contact'])
  })

  it('moving the first row up is a no-op', () => {
    const original = pageSections()
    const next = moveSection(original, 'hero', 'up')
    expect(next).toBe(original)
  })

  it('moving the last row down is a no-op', () => {
    const original = pageSections()
    const next = moveSection(original, 'contact', 'down')
    expect(next).toBe(original)
  })

  it('an unknown key is a no-op', () => {
    const original = pageSections()
    const next = moveSection(original, 'nonexistent', 'up')
    expect(next).toBe(original)
  })

  it('two moves in a row keep the sequence clean rather than drifting', () => {
    let next = pageSections()
    next = moveSection(next, 'contact', 'up') // contact <-> booking
    next = moveSection(next, 'contact', 'up') // contact <-> reviews
    expect(orderedSections(next).map(s => s.key)).toEqual(['hero', 'services', 'about', 'team', 'contact', 'reviews', 'booking'])
    expect(orderedSections(next).map(s => s.sort)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })
})

describe('toggleSection', () => {
  it('flips only the named section, leaving every other row (and its own position) untouched', () => {
    const next = toggleSection(pageSections(), 'reviews')
    const reviews = next.find(s => s.key === 'reviews')
    expect(reviews).toEqual({ key: 'reviews', enabled: true, sort: 4 })
    // Everything else byte-identical to the input.
    expect(next.filter(s => s.key !== 'reviews')).toEqual(pageSections().filter(s => s.key !== 'reviews'))
  })

  it('toggles back off on a second call', () => {
    const once = toggleSection(pageSections(), 'hero')
    const twice = toggleSection(once, 'hero')
    expect(twice.find(s => s.key === 'hero')?.enabled).toBe(true)
  })
})

describe('buildSectionsPayload', () => {
  it('forces an unofferable data-backed row to enabled:false regardless of its stored value', () => {
    const rows = buildSectionRows(pageSections(), availability()) // reviews: available:false, count:0, but enabled:true would come from... see next line
    // Force the exact stale-state scenario: reviews stored as enabled:true, but no longer offerable.
    const stale: EditorSectionRow[] = rows.map(r => (r.key === 'reviews' ? { ...r, enabled: true } : r))
    const payload = buildSectionsPayload(stale)
    expect(payload.find(p => p.key === 'reviews')).toEqual({ key: 'reviews', enabled: false, sort: 4 })
  })

  it('leaves a copy-backed row enabled even when unavailable with zero count (about)', () => {
    const rows = buildSectionRows(pageSections(), availability())
    const payload = buildSectionsPayload(rows)
    // `about` is available:false/count:0 in the fixture, but copy-backed sections are always offerable.
    expect(payload.find(p => p.key === 'about')).toEqual({ key: 'about', enabled: true, sort: 2 })
  })

  it('produces exactly {key, enabled, sort} per row, dropping label/sourceLabel/available/count', () => {
    const rows = buildSectionRows(pageSections(), availability())
    const payload = buildSectionsPayload(rows)
    for (const row of payload) {
      expect(Object.keys(row).sort()).toEqual(['enabled', 'key', 'sort'])
    }
  })
})

describe('SECTION_CONTENT_FIELDS', () => {
  it('has an entry for every section in SECTION_ORDER', () => {
    for (const key of SECTION_ORDER) {
      expect(SECTION_CONTENT_FIELDS[key]).toBeDefined()
      expect(SECTION_CONTENT_FIELDS[key].length).toBeGreaterThan(0)
    }
  })
})
