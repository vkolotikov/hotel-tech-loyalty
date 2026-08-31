import { describe, expect, it } from 'vitest'
import {
  addableTypes, appendSection, buildSectionRows, buildSectionsPayload, fieldsForType, instanceRowLabel,
  moveSection, moveSectionTo, moveSectionToKey, orderedSections, parseSectionKey, removeSection, removeSectionContent,
  safeImageUrl, sectionIndex, setSectionTone, stripImageUrlLeaves, toggleSection,
  SECTION_CONTENT_FIELDS,
  type EditorSectionRow, type PageSection, type SectionAvailability, type SectionTypeOption,
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
      available: true, count: 12, reason: null, enabled: true, sort: 1,
      // Builder round: every row now also carries what it is, whether it can
      // be removed, and which controls it renders. A fixed band is one of
      // one, is never removable, and takes the curated field list — pinned
      // whole here rather than spot-checked, because "a fixed row quietly
      // became removable" is exactly the regression this asserts against.
      typeId: 'services', fixed: true, ordinal: 1, siblings: 1,
      fields: SECTION_CONTENT_FIELDS.services,
      // Tone round: the band's colour and the swatch to light while it has
      // none. This fixture's `sectionTypes` argument is absent, so there is
      // no served `default_tone` to find — null, not a guess.
      tone: null, defaultTone: null,
    })
  })

  /**
   * Fix 2 (phase 3a correctness review): the backend has authored `reason`
   * on every prefill row since Task 4 (booking's industry-gate sentence);
   * this mapping used to drop it on the floor, which is how a beauty
   * tenant ended up reading the generic "Nothing to show yet" instruction
   * for a section no amount of writing would ever unlock.
   */
  it('carries the backend reason through to the merged row', () => {
    const withReason: SectionAvailability[] = availability().map(a => (
      a.key === 'booking'
        ? { ...a, available: false, reason: "Online booking currently supports hotel stays. Your 'Book appointment' button will point visitors at your contact details instead." }
        : a
    ))
    const rows = buildSectionRows(pageSections(), withReason)
    const booking = rows.find(r => r.key === 'booking')
    expect(booking?.reason).toBe(
      "Online booking currently supports hotel stays. Your 'Book appointment' button will point visitors at your contact details instead.",
    )
  })

  it('normalises a missing reason to null rather than undefined', () => {
    const rows = buildSectionRows(pageSections(), availability())
    expect(rows.find(r => r.key === 'hero')?.reason).toBeNull()
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
    expect(payload.find(p => p.key === 'reviews')).toEqual({ key: 'reviews', enabled: false, sort: 4, tone: null })
  })

  it('leaves a copy-backed row enabled even when unavailable with zero count (about)', () => {
    const rows = buildSectionRows(pageSections(), availability())
    const payload = buildSectionsPayload(rows)
    // `about` is available:false/count:0 in the fixture, but copy-backed sections are always offerable.
    expect(payload.find(p => p.key === 'about')).toEqual({ key: 'about', enabled: true, sort: 2, tone: null })
  })

  it('produces exactly {key, enabled, sort, tone} per row, dropping label/sourceLabel/available/count', () => {
    const rows = buildSectionRows(pageSections(), availability())
    const payload = buildSectionsPayload(rows)
    for (const row of payload) {
      expect(Object.keys(row).sort()).toEqual(['enabled', 'key', 'sort', 'tone'])
    }
  })

  /**
   * `tone` is ALWAYS on the wire, as a string or an explicit null, never
   * missing and never `undefined`.
   *
   * The server tells an absent `tone` ("leave whatever is stored alone")
   * from an explicit null ("put this band back to its own colour") by
   * testing for the key, and `JSON.stringify` drops an undefined value — so
   * a row that lost its tone key on the way out would silently take the
   * first path, and the tenant's "Page background" swatch would appear to do
   * nothing at all.
   */
  it('always sends tone, as an explicit null when the row has none', () => {
    const rows = buildSectionRows(pageSections(), availability())
    for (const row of buildSectionsPayload(rows)) {
      expect(row).toHaveProperty('tone')
      expect(row.tone).toBeNull()
    }
  })

  it('carries a stored tone through to the wire', () => {
    const toned = pageSections().map(s => (s.key === 'about' ? { ...s, tone: 'accent' } : s))
    const payload = buildSectionsPayload(buildSectionRows(toned, availability()))
    expect(payload.find(p => p.key === 'about')?.tone).toBe('accent')
    expect(payload.find(p => p.key === 'hero')?.tone).toBeNull()
  })
})

describe('SECTION_CONTENT_FIELDS', () => {
  it('has an entry for every section in SECTION_ORDER', () => {
    for (const key of SECTION_ORDER) {
      expect(SECTION_CONTENT_FIELDS[key]).toBeDefined()
      expect(SECTION_CONTENT_FIELDS[key].length).toBeGreaterThan(0)
    }
  })

  /**
   * Fix 1 (phase 3a correctness review): the editor's contact inputs had no
   * `type="email"`/`maxLength` at all, so an ordinary tenant keystroke could
   * reach the server holding an unbounded blob or an unformatted email --
   * these mirror the backend's own `content.contact.*` rules.
   */
  it('mirrors the backend contact rules on phone/email/address', () => {
    const contact = SECTION_CONTENT_FIELDS.contact
    expect(contact.find(f => f.name === 'phone')).toMatchObject({ maxLength: 64 })
    expect(contact.find(f => f.name === 'email')).toMatchObject({ type: 'email', maxLength: 191 })
    expect(contact.find(f => f.name === 'address')).toMatchObject({ maxLength: 191 })
  })

  /**
   * Task 6: `hero` and `about` are the only two sections Task 4's photo
   * endpoints accept (`slot` in `hero,about`) — this mapping is the field
   * renderer's one signal to branch to the photo control, so it has to
   * expose an `image_url`/`type: 'image'` field for exactly those two
   * sections and no others.
   */
  it('exposes an image_url/type:image field for exactly hero and about', () => {
    const sectionsWithImage = SECTION_ORDER.filter(key =>
      SECTION_CONTENT_FIELDS[key].some(f => f.name === 'image_url' && f.type === 'image'),
    )
    expect(sectionsWithImage.sort()).toEqual(['about', 'hero'])
  })
})

/**
 * Minor m4: `LandingEditor.tsx` feeds this straight to `ImageField` →
 * `resolveImage()` → an unconditional `url.match(...)`, so a truthy
 * non-string `content[row.key].image_url` — a legal write pre-D4, and raw-DB
 * shapes are this feature's standing threat model — throws a TypeError
 * during render and kills the whole editor route. Mirrors
 * `App\Landing\PageContent::imageUrl()`'s own allowlist.
 *
 * Mutation: make it an identity passthrough and every hostile case here
 * goes red.
 */
describe('safeImageUrl', () => {
  it('accepts a valid https URL', () => {
    expect(safeImageUrl('https://cdn.example.test/landing/hero.jpg')).toBe('https://cdn.example.test/landing/hero.jpg')
  })

  it('accepts a valid http URL', () => {
    expect(safeImageUrl('http://cdn.example.test/landing/hero.jpg')).toBe('http://cdn.example.test/landing/hero.jpg')
  })

  it('accepts a valid /storage/ path', () => {
    expect(safeImageUrl('/storage/landing/hero.jpg')).toBe('/storage/landing/hero.jpg')
  })

  it('rejects a javascript: string', () => {
    expect(safeImageUrl('javascript:alert(1)')).toBeNull()
  })

  it('rejects a number', () => {
    expect(safeImageUrl(42)).toBeNull()
  })

  it('rejects an array', () => {
    expect(safeImageUrl(['https://cdn.example.test/x.jpg'])).toBeNull()
  })

  it('rejects an object', () => {
    expect(safeImageUrl({ url: 'https://cdn.example.test/x.jpg' })).toBeNull()
  })

  it('rejects an empty string', () => {
    expect(safeImageUrl('')).toBeNull()
  })

  it('rejects null and undefined', () => {
    expect(safeImageUrl(null)).toBeNull()
    expect(safeImageUrl(undefined)).toBeNull()
  })

  it('rejects a boolean', () => {
    expect(safeImageUrl(true)).toBeNull()
  })
})

/**
 * Fix round 1 (ruling 3b-4): `saveMut.mutationFn`'s one choke point before
 * a text-only save reaches the server — see `stripImageUrlLeaves`'s own
 * docblock for why an unstripped `image_url` leaf gets dragged into `form`
 * by reference and 422s an ordinary text save.
 */
describe('stripImageUrlLeaves', () => {
  it('strips image_url from multiple sections at once, leaving siblings intact', () => {
    const content = {
      hero:  { image_url: '/storage/landing/hero.png', headline: 'Quiet luxury', subtext: 'Calm, considered.' },
      about: { image_url: '/storage/landing/about.png', kicker: 'Our story', lead: 'Since 2014' },
      services: { kicker: 'What we do', heading: 'Treatments' },
    }
    expect(stripImageUrlLeaves(content)).toEqual({
      hero:  { headline: 'Quiet luxury', subtext: 'Calm, considered.' },
      about: { kicker: 'Our story', lead: 'Since 2014' },
      services: { kicker: 'What we do', heading: 'Treatments' },
    })
  })

  it('tolerates a non-object section — string, number, or null — passing it through untouched', () => {
    const content = { hero: 'a bare scalar section', about: 42, contact: null }
    expect(stripImageUrlLeaves(content as unknown as Record<string, unknown>)).toEqual({
      hero: 'a bare scalar section', about: 42, contact: null,
    })
  })

  it('tolerates null or undefined content, returning {} — matching the save body\'s own `?? {}`', () => {
    expect(stripImageUrlLeaves(null)).toEqual({})
    expect(stripImageUrlLeaves(undefined)).toEqual({})
  })

  it('does not mutate the input object', () => {
    const content = { hero: { image_url: '/storage/landing/hero.png', headline: 'Old' } }
    const snapshot = JSON.parse(JSON.stringify(content))
    stripImageUrlLeaves(content)
    expect(content).toEqual(snapshot)
  })

  it('a section with no image_url to begin with is returned with every key intact', () => {
    const content = { services: { kicker: 'What we do', heading: 'Treatments', subtext: 'Every service, one place.' } }
    expect(stripImageUrlLeaves(content)).toEqual(content)
  })
})

// ─── The builder round: instance rows, add/remove, drag maths ───────────
//
// `App\Landing\SectionType::payload()` as the wire actually sends it. Written
// out rather than imported from anywhere, because it IS the wire: these tests
// exist to prove this module reads the SERVED catalogue correctly, and a
// fixture derived from a frontend constant would prove only that the module
// agrees with itself.
/** `SectionType::payload()`'s own rows, `default_tone` included — the swatch
 *  each type shows lit while a row of it carries no tone of its own (`page`
 *  for the plain bands, `soft` for the tinted and the ink ones alike; see
 *  that constant's note on why ink answers soft). */
const sectionTypes = (): SectionTypeOption[] => [
  { id: 'hero', repeatable: false, fields: ['kicker', 'headline', 'subtext'], image: true, limit: null, default_tone: 'page' },
  { id: 'services', repeatable: false, fields: ['kicker', 'heading', 'subtext'], image: false, limit: null, default_tone: 'page' },
  { id: 'about', repeatable: false, fields: ['kicker', 'lead', 'body'], image: true, limit: null, default_tone: 'soft' },
  { id: 'team', repeatable: false, fields: ['kicker', 'heading', 'subtext'], image: false, limit: null, default_tone: 'page' },
  { id: 'reviews', repeatable: false, fields: ['kicker'], image: false, limit: null, default_tone: 'soft' },
  { id: 'booking', repeatable: false, fields: ['kicker', 'heading', 'terms', 'call_label', 'call_short'], image: false, limit: null, default_tone: 'soft' },
  { id: 'contact', repeatable: false, fields: ['kicker', 'phone', 'email', 'address'], image: false, limit: null, default_tone: 'soft' },
  { id: 'footer', repeatable: false, fields: [], image: false, limit: null, default_tone: 'page' },
  { id: 'text', repeatable: true, fields: ['kicker', 'heading', 'body'], image: true, limit: 6, default_tone: 'soft' },
]

describe('parseSectionKey', () => {
  it('resolves an instance key to its repeatable type', () => {
    expect(parseSectionKey('text_1', sectionTypes())).toMatchObject({ typeId: 'text', index: 1 })
    expect(parseSectionKey('text_6', sectionTypes())).toMatchObject({ typeId: 'text', index: 6 })
  })

  /**
   * The grammar `SectionType::typeOf()` owns, restated on this side and
   * pinned against exactly the strings that method's own docblock names as
   * NOT keys. Getting any of these wrong shows up as a row the editor
   * renders and the renderer skips, or the reverse.
   */
  it('refuses everything that is not an instance key', () => {
    const types = sectionTypes()
    // The bare id of a repeatable type is not a section.
    expect(parseSectionKey('text', types)).toBeNull()
    // No zero index, no leading zero.
    expect(parseSectionKey('text_0', types)).toBeNull()
    expect(parseSectionKey('text_01', types)).toBeNull()
    // Past the SERVED limit.
    expect(parseSectionKey('text_7', types)).toBeNull()
    // A fixed type has no instances.
    expect(parseSectionKey('about_1', types)).toBeNull()
    // Greedy on the id half, exactly as the server is: `text_1_2` resolves
    // its id to `text_1`, which is not a type.
    expect(parseSectionKey('text_1_2', types)).toBeNull()
    // A type this build was never told about.
    expect(parseSectionKey('gallery_1', types)).toBeNull()
    expect(parseSectionKey('', types)).toBeNull()
  })

  /** No catalogue means no instance keys — which is the honest answer for a
   *  backend with no add endpoint for one to have come from. */
  it('recognises nothing without a served catalogue', () => {
    expect(parseSectionKey('text_1', [])).toBeNull()
  })

  /** The bound is the SERVED `limit`, never a copy of six. */
  it('follows the served limit rather than a hardcoded one', () => {
    const raised = sectionTypes().map(t => (t.id === 'text' ? { ...t, limit: 9 } : t))
    expect(parseSectionKey('text_7', raised)).toMatchObject({ index: 7 })
    expect(parseSectionKey('text_10', raised)).toBeNull()
  })

  /** `written` is `PageContent::count()`'s `'text'` arm: a filled BODY, and
   *  nothing else. A kicker, a heading or a photo alone is a fragment the
   *  renderer will not publish. */
  it('reports whether the band has actually been written into', () => {
    const types = sectionTypes()
    expect(parseSectionKey('text_1', types, { text_1: { body: 'Some words' } })?.written).toBe(true)
    expect(parseSectionKey('text_1', types, { text_1: { body: '   ' } })?.written).toBe(false)
    expect(parseSectionKey('text_1', types, { text_1: { heading: 'Hi', image_url: '/storage/x.jpg' } })?.written).toBe(false)
    expect(parseSectionKey('text_1', types, {})?.written).toBe(false)
    expect(parseSectionKey('text_1', types)?.written).toBe(false)
    // A schemaless column can legitimately hold a scalar here (the
    // "ScalarLeaves" edge case) — that is not a written body either.
    expect(parseSectionKey('text_1', types, { text_1: 'oops' })?.written).toBe(false)
    expect(parseSectionKey('text_1', types, { text_1: { body: 7 } })?.written).toBe(false)
  })
})

describe('fieldsForType', () => {
  it('puts the photo control first, then the catalogue fields in the served order', () => {
    const text = sectionTypes().find(t => t.id === 'text')!
    expect(fieldsForType(text)).toEqual([
      { name: 'image_url', type: 'image' },
      { name: 'kicker' },
      { name: 'heading' },
      { name: 'body', multiline: true },
    ])
  })

  it('omits the photo control for a type that takes no photo', () => {
    const text = sectionTypes().find(t => t.id === 'text')!
    expect(fieldsForType({ ...text, image: false }).map(f => f.name)).toEqual(['kicker', 'heading', 'body'])
  })

  /** `image_url` is never on the wire's `fields` — it has one writer, the
   *  image endpoints — so it can only ever be synthesised here. */
  it('never doubles the photo control if the wire ever sent image_url as a field', () => {
    const text = sectionTypes().find(t => t.id === 'text')!
    const fields = fieldsForType({ ...text, fields: ['kicker'] })
    expect(fields.filter(f => f.type === 'image')).toHaveLength(1)
  })
})

/**
 * The bug this round's brief flagged and asked to check first: before the
 * catalogue reached `buildSectionRows`, a `text_1` row was dropped BOTH from
 * the rendered list and from the `PUT /sections` payload — so an added band
 * was invisible, and any reorder that moved it silently did not persist
 * (`update()` only touches the rows it is named, so the added row kept the
 * `sort` `store()` appended it with while everything else renumbered around
 * it).
 */
describe('buildSectionRows — tenant-added rows', () => {
  const withText = (): PageSection[] => [
    ...pageSections(),
    { key: 'text_1', enabled: true, sort: 7 },
    { key: 'text_4', enabled: false, sort: 8 },
  ]

  it('drops added rows when no catalogue is supplied — the pre-fix behaviour, pinned', () => {
    expect(buildSectionRows(withText(), availability()).map(r => r.key)).toEqual(SECTION_ORDER)
  })

  it('carries added rows once the catalogue is supplied', () => {
    const rows = buildSectionRows(withText(), availability(), sectionTypes())
    expect(rows.map(r => r.key)).toEqual([...SECTION_ORDER, 'text_1', 'text_4'])
  })

  it('reaches the wire, which is the whole point — the added rows carry their sort', () => {
    const rows = buildSectionRows(withText(), availability(), sectionTypes())
    const payload = buildSectionsPayload(rows)
    expect(payload).toContainEqual({ key: 'text_1', enabled: true, sort: 7, tone: null })
    expect(payload).toContainEqual({ key: 'text_4', enabled: false, sort: 8, tone: null })
  })

  it('marks added rows removable and fixed rows not', () => {
    const rows = buildSectionRows(withText(), availability(), sectionTypes())
    expect(rows.filter(r => !r.fixed).map(r => r.key)).toEqual(['text_1', 'text_4'])
    expect(rows.filter(r => r.fixed).map(r => r.key)).toEqual(SECTION_ORDER)
  })

  /** Numbered by POSITION, never by key index — keys are allocated
   *  lowest-free server-side, so a page can hold `text_2` and `text_5` and
   *  nothing else, and showing those numbers would be showing an internal
   *  allocation. */
  it('numbers added rows by their position among their own kind', () => {
    const rows = buildSectionRows(withText(), availability(), sectionTypes())
    const text = rows.filter(r => r.typeId === 'text')
    expect(text.map(r => [r.key, r.ordinal, r.siblings])).toEqual([['text_1', 1, 2], ['text_4', 2, 2]])
  })

  it('counts siblings over the whole page, not over the rows seen so far', () => {
    const sparse: PageSection[] = [
      { key: 'text_5', enabled: true, sort: 0 },
      { key: 'hero', enabled: true, sort: 1 },
      { key: 'text_2', enabled: true, sort: 2 },
    ]
    const rows = buildSectionRows(sparse, availability(), sectionTypes())
    expect(rows.map(r => [r.key, r.ordinal, r.siblings])).toEqual([
      ['text_5', 1, 2], ['hero', 1, 1], ['text_2', 2, 2],
    ])
  })

  it('gives an added row the catalogue fields, a fixed row the curated ones', () => {
    const rows = buildSectionRows(withText(), availability(), sectionTypes())
    expect(rows.find(r => r.key === 'text_1')!.fields.map(f => f.name))
      .toEqual(['image_url', 'kicker', 'heading', 'body'])
    // The curated map, NOT the catalogue: `booking`'s call_label/call_short
    // and `contact`'s five label overrides stay off this screen.
    expect(rows.find(r => r.key === 'booking')!.fields).toBe(SECTION_CONTENT_FIELDS.booking)
  })

  it('reports an added row as written only once its body is filled', () => {
    const rows = buildSectionRows(withText(), availability(), sectionTypes(), { text_1: { body: 'Hello' } })
    expect(rows.find(r => r.key === 'text_1')!.available).toBe(true)
    expect(rows.find(r => r.key === 'text_1')!.count).toBe(1)
    expect(rows.find(r => r.key === 'text_4')!.available).toBe(false)
    expect(rows.find(r => r.key === 'text_4')!.count).toBe(0)
  })

  /**
   * An added band is copy-backed, like hero/about/contact — its content is
   * words the tenant types, so an empty one must still be offered (that is
   * the only way to write into it). It must never be forced off at the wire
   * the way an empty data-backed band is.
   */
  it('never forces an unwritten added row off at the wire', () => {
    const rows = buildSectionRows(withText(), availability(), sectionTypes(), {})
    expect(buildSectionsPayload(rows)).toContainEqual({ key: 'text_1', enabled: true, sort: 7, tone: null })
    // Contrast: reviews is data-backed with zero rows, and IS forced off.
    expect(buildSectionsPayload(rows)).toContainEqual({ key: 'reviews', enabled: false, sort: 4, tone: null })
  })

  it('still drops a key that is neither fixed nor a legal instance', () => {
    const junk: PageSection[] = [...pageSections(), { key: 'gallery_1', enabled: true, sort: 7 }]
    expect(buildSectionRows(junk, availability(), sectionTypes()).map(r => r.key)).toEqual(SECTION_ORDER)
  })
})

describe('moveSectionTo', () => {
  const keys = (rows: PageSection[]) => orderedSections(rows).map(s => s.key)

  it('drops a row below the row it was dragged onto when moving down', () => {
    expect(keys(moveSectionTo(pageSections(), 'hero', 3)))
      .toEqual(['services', 'about', 'team', 'hero', 'reviews', 'booking', 'contact'])
  })

  it('drops a row above the row it was dragged onto when moving up', () => {
    expect(keys(moveSectionTo(pageSections(), 'contact', 1)))
      .toEqual(['hero', 'contact', 'services', 'about', 'team', 'reviews', 'booking'])
  })

  it('renumbers to a clean 0..n-1 sequence so the next move reads true positions', () => {
    const gappy: PageSection[] = [
      { key: 'hero', enabled: true, sort: 0 },
      { key: 'about', enabled: true, sort: 40 },
      { key: 'contact', enabled: true, sort: 900 },
    ]
    expect(moveSectionTo(gappy, 'contact', 0).map(s => s.sort).sort()).toEqual([0, 1, 2])
  })

  it('clamps a drop past either end rather than refusing it', () => {
    expect(keys(moveSectionTo(pageSections(), 'contact', -5))[0]).toBe('contact')
    expect(keys(moveSectionTo(pageSections(), 'hero', 99)).at(-1)).toBe('hero')
  })

  it('is a no-op on a drop onto the row itself, so a mis-click never flips dirty', () => {
    const input = pageSections()
    expect(moveSectionTo(input, 'about', 2)).toBe(input)
  })

  it('is a no-op for a key the page does not carry', () => {
    const input = pageSections()
    expect(moveSectionTo(input, 'text_9', 0)).toBe(input)
  })

  /** The drag path and the keyboard path must land in the same place — one
   *  reorder feature with two ways in, not two features. */
  it('agrees with moveSection for a single-step move', () => {
    expect(keys(moveSectionTo(pageSections(), 'about', 1))).toEqual(keys(moveSection(pageSections(), 'about', 'up')))
    expect(keys(moveSectionTo(pageSections(), 'about', 3))).toEqual(keys(moveSection(pageSections(), 'about', 'down')))
  })

  it('does not mutate its input', () => {
    const input = pageSections()
    const copy = input.map(s => ({ ...s }))
    moveSectionTo(input, 'hero', 4)
    expect(input).toEqual(copy)
  })
})

describe('sectionIndex', () => {
  it('answers the visible position, not the raw sort', () => {
    const gappy: PageSection[] = [
      { key: 'contact', enabled: true, sort: 900 },
      { key: 'hero', enabled: true, sort: 5 },
    ]
    expect(sectionIndex(gappy, 'hero')).toBe(0)
    expect(sectionIndex(gappy, 'contact')).toBe(1)
  })

  it('is -1 for a key the page does not carry', () => {
    expect(sectionIndex(pageSections(), 'text_1')).toBe(-1)
  })
})

describe('appendSection', () => {
  it('lands the new row at the bottom of the local order', () => {
    const next = appendSection(pageSections(), 'text_1')
    expect(orderedSections(next).at(-1)!.key).toBe('text_1')
    expect(next.find(s => s.key === 'text_1')).toEqual({ key: 'text_1', enabled: true, sort: 7, tone: null })
  })

  /** The server clamps to the same 0..999 window `update()` validates, so a
   *  page whose sorts were pushed to the ceiling cannot produce a row the
   *  reorder rule would then refuse. */
  it('clamps to the 999 ceiling the reorder endpoint validates', () => {
    const maxed: PageSection[] = [{ key: 'hero', enabled: true, sort: 999 }]
    expect(appendSection(maxed, 'text_1')[1].sort).toBe(999)
  })

  it('starts at 0 on a page with no rows at all', () => {
    expect(appendSection([], 'text_1')).toEqual([{ key: 'text_1', enabled: true, sort: 0, tone: null }])
  })

  it('does not mutate its input', () => {
    const input = pageSections()
    appendSection(input, 'text_1')
    expect(input).toHaveLength(7)
  })
})

describe('removeSection', () => {
  it('drops the row and leaves every other sort alone', () => {
    const next = removeSection(pageSections(), 'about')
    expect(next.map(s => s.key)).toEqual(['hero', 'services', 'team', 'reviews', 'booking', 'contact'])
    expect(next.map(s => s.sort)).toEqual([0, 1, 3, 4, 5, 6])
  })

  it('leaves the order intact despite the gap it opens', () => {
    const next = removeSection(pageSections(), 'about')
    expect(orderedSections(next).map(s => s.key)).toEqual(['hero', 'services', 'team', 'reviews', 'booking', 'contact'])
  })

  it('is harmless for a key the page does not carry', () => {
    expect(removeSection(pageSections(), 'text_9')).toHaveLength(7)
  })
})

/**
 * The one that actually loses tenant data if it is wrong: `PUT
 * /v1/admin/landing-pages` replaces `content` WHOLESALE, and keys are
 * allocated lowest-free — so an unsaved clone of a deleted section's copy,
 * written back on the next save, is inherited verbatim by the next block the
 * tenant adds.
 */
describe('removeSectionContent', () => {
  it('drops the deleted section leaf and keeps every other one', () => {
    const content = { hero: { headline: 'Hi' }, text_1: { body: 'Gone' }, about: { body: 'Kept' } }
    expect(removeSectionContent(content, 'text_1')).toEqual({ hero: { headline: 'Hi' }, about: { body: 'Kept' } })
  })

  it('does not mutate its input', () => {
    const content = { text_1: { body: 'Gone' } }
    removeSectionContent(content, 'text_1')
    expect(content).toEqual({ text_1: { body: 'Gone' } })
  })

  it('survives a null or absent content column', () => {
    expect(removeSectionContent(null, 'text_1')).toEqual({})
    expect(removeSectionContent(undefined, 'text_1')).toEqual({})
  })

  it('is harmless for a key with no leaf', () => {
    expect(removeSectionContent({ hero: { headline: 'Hi' } }, 'text_1')).toEqual({ hero: { headline: 'Hi' } })
  })
})

describe('addableTypes', () => {
  const page = (textCount: number): PageSection[] => [
    ...pageSections(),
    ...Array.from({ length: textCount }, (_, i) => ({ key: `text_${i + 1}`, enabled: true, sort: 7 + i })),
  ]

  it('offers only the repeatable types', () => {
    expect(addableTypes(sectionTypes(), page(0), 16).map(t => t.id)).toEqual(['text'])
  })

  it('offers nothing at all when the catalogue has not arrived', () => {
    expect(addableTypes([], page(0), 16)).toEqual([])
  })

  it('is live below both caps', () => {
    const [text] = addableTypes(sectionTypes(), page(2), 16)
    expect(text).toEqual({ id: 'text', used: 2, limit: 6, disabledReason: null, pageLimit: 16 })
  })

  it('refuses at the per-type cap, naming the served limit', () => {
    const [text] = addableTypes(sectionTypes(), page(6), 16)
    expect(text.disabledReason).toBe('type_limit')
    expect(text.limit).toBe(6)
  })

  /** 7 fixed + 9 added = 16 rows, `MAX_SECTIONS_PER_PAGE`, with the per-type
   *  cap not yet reached — the case only the page cap can explain. */
  it('refuses at the page cap even when the type still has room', () => {
    const crowded: PageSection[] = [
      ...pageSections(),
      ...Array.from({ length: 9 }, (_, i) => ({ key: `spacer_${i}`, enabled: true, sort: 7 + i })),
    ]
    const [text] = addableTypes(sectionTypes(), crowded, 16)
    expect(crowded).toHaveLength(16)
    expect(text.used).toBe(0)
    expect(text.disabledReason).toBe('page_full')
  })

  /** The per-type refusal is the more specific of the two, and its fix is
   *  the thing the tenant is already looking at. */
  it('names the per-type cap first when both apply', () => {
    const both: PageSection[] = [
      ...pageSections(),
      ...Array.from({ length: 6 }, (_, i) => ({ key: `text_${i + 1}`, enabled: true, sort: 7 + i })),
      ...Array.from({ length: 3 }, (_, i) => ({ key: `spacer_${i}`, enabled: true, sort: 20 + i })),
    ]
    expect(both).toHaveLength(16)
    expect(addableTypes(sectionTypes(), both, 16)[0].disabledReason).toBe('type_limit')
  })

  /** Counted over the RAW rows, exactly as `store()` counts them — a row
   *  this build failed to recognise still occupies a place on the page. */
  it('counts unrecognised rows towards the page cap', () => {
    const withJunk: PageSection[] = [
      ...pageSections(),
      ...Array.from({ length: 9 }, (_, i) => ({ key: `unknown_thing_${i}`, enabled: true, sort: 7 + i })),
    ]
    expect(addableTypes(sectionTypes(), withJunk, 16)[0].disabledReason).toBe('page_full')
  })

  /** An older backend that publishes no cap must not be second-guessed: the
   *  add goes to the server, which refuses it in its own words. */
  it('drops the page-cap gate when the cap was never served', () => {
    const crowded: PageSection[] = Array.from({ length: 40 }, (_, i) => ({ key: `spacer_${i}`, enabled: true, sort: i }))
    expect(addableTypes(sectionTypes(), crowded, null)[0].disabledReason).toBeNull()
  })

  it('follows a raised per-type limit off the wire rather than a hardcoded six', () => {
    const raised = sectionTypes().map(t => (t.id === 'text' ? { ...t, limit: 8 } : t))
    expect(addableTypes(raised, page(6), 16)[0].disabledReason).toBeNull()
    expect(addableTypes(raised, page(8), 20)[0].disabledReason).toBe('type_limit')
  })
})

describe('instanceRowLabel', () => {
  it('does not number a lone block', () => {
    expect(instanceRowLabel('Text block', 1, 1)).toBe('Text block')
  })

  it('numbers by position once there is more than one', () => {
    expect(instanceRowLabel('Text block', 1, 3)).toBe('Text block 1')
    expect(instanceRowLabel('Text block', 3, 3)).toBe('Text block 3')
  })

  it('carries whatever the translation gave it, untouched', () => {
    expect(instanceRowLabel('Текстовый блок', 2, 2)).toBe('Текстовый блок 2')
  })
})

/**
 * The form every UI caller actually uses, and the reason it exists: the
 * editor renders `buildSectionRows`' output, which can be SHORTER than the
 * page. A page keeps its `booking` row after its industry is switched to one
 * whose profile has no booking band — still there, still sorted, simply not
 * drawn. Handing that screen's array index to `moveSectionTo` moves the
 * dragged row off by however many hidden rows sit above it; naming the
 * target cannot go wrong that way.
 */
describe('moveSectionToKey', () => {
  const keys = (rows: PageSection[]) => orderedSections(rows).map(s => s.key)

  it('puts the dragged row where the target row is, moving down', () => {
    expect(keys(moveSectionToKey(pageSections(), 'hero', 'team')))
      .toEqual(['services', 'about', 'team', 'hero', 'reviews', 'booking', 'contact'])
  })

  it('puts the dragged row where the target row is, moving up', () => {
    expect(keys(moveSectionToKey(pageSections(), 'contact', 'services')))
      .toEqual(['hero', 'contact', 'services', 'about', 'team', 'reviews', 'booking'])
  })

  /**
   * The case index-based targeting gets wrong. `booking` is a real row that
   * the editor does not draw once the page's industry has no booking band,
   * so the VISIBLE list here is [hero, about] while the page is
   * [hero, booking, about]. Dropping `hero` onto `about` has to leave
   * `hero` after `about` in both.
   */
  it('is correct when the rendered list is shorter than the page', () => {
    const withHidden: PageSection[] = [
      { key: 'hero', enabled: true, sort: 0 },
      { key: 'booking', enabled: true, sort: 1 },
      { key: 'about', enabled: true, sort: 2 },
    ]
    const visible = (rows: PageSection[]) => keys(rows).filter(k => k !== 'booking')

    expect(visible(moveSectionToKey(withHidden, 'hero', 'about'))).toEqual(['about', 'hero'])
    expect(visible(moveSectionToKey(withHidden, 'about', 'hero'))).toEqual(['about', 'hero'])
    // The undrawn row is carried along rather than dropped or reordered out
    // of the page — it keeps a place, which is what lets the next save write
    // a clean sequence over the whole thing.
    expect(moveSectionToKey(withHidden, 'hero', 'about')).toHaveLength(3)
  })

  it('is a no-op for a target the page does not carry', () => {
    const input = pageSections()
    expect(moveSectionToKey(input, 'hero', 'text_9')).toBe(input)
  })

  it('is a no-op for dropping a row onto itself', () => {
    const input = pageSections()
    expect(moveSectionToKey(input, 'about', 'about')).toBe(input)
  })

  it('agrees with moveSection for a single-step move', () => {
    expect(keys(moveSectionToKey(pageSections(), 'about', 'services')))
      .toEqual(keys(moveSection(pageSections(), 'about', 'up')))
    expect(keys(moveSectionToKey(pageSections(), 'about', 'team')))
      .toEqual(keys(moveSection(pageSections(), 'about', 'down')))
  })

  /** Home/End, as the editor spells them: target the first/last row that is
   *  actually on screen. */
  it('sends a row to either end when targeted at the edge rows', () => {
    expect(keys(moveSectionToKey(pageSections(), 'contact', 'hero'))[0]).toBe('contact')
    expect(keys(moveSectionToKey(pageSections(), 'hero', 'contact')).at(-1)).toBe('hero')
  })
})

describe('setSectionTone', () => {
  it('puts one section on a colour and touches nothing else', () => {
    const next = setSectionTone(pageSections(), 'about', 'accent')
    expect(next.find(s => s.key === 'about')).toEqual({ key: 'about', enabled: true, sort: 2, tone: 'accent' })
    expect(next.filter(s => s.key !== 'about')).toEqual(pageSections().filter(s => s.key !== 'about'))
  })

  it('leaves position and enabled alone — colour, order and visibility are three separate choices', () => {
    const off = toggleSection(pageSections(), 'about')
    const next = setSectionTone(off, 'about', 'page')
    expect(next.find(s => s.key === 'about')).toEqual({ key: 'about', enabled: false, sort: 2, tone: 'page' })
  })

  it('null clears a stored tone, putting the band back on its authored colour', () => {
    const toned = setSectionTone(pageSections(), 'about', 'accent')
    expect(setSectionTone(toned, 'about', null).find(s => s.key === 'about')?.tone).toBeNull()
  })

  it('an unknown key is a no-op', () => {
    expect(setSectionTone(pageSections(), 'nonexistent', 'accent')).toEqual(pageSections())
  })

  it('does not mutate its input', () => {
    const input = pageSections()
    setSectionTone(input, 'about', 'accent')
    expect(input.find(s => s.key === 'about')).toEqual({ key: 'about', enabled: true, sort: 2 })
  })
})

describe('buildSectionRows — tone', () => {
  it('carries a stored tone and the served default onto a fixed row', () => {
    const toned = pageSections().map(s => (s.key === 'about' ? { ...s, tone: 'accent' } : s))
    const rows = buildSectionRows(toned, availability(), sectionTypes())

    expect(rows.find(r => r.key === 'about')).toMatchObject({ tone: 'accent', defaultTone: 'soft' })
    expect(rows.find(r => r.key === 'hero')).toMatchObject({ tone: null, defaultTone: 'page' })
  })

  /**
   * `contact` is authored `band--ink` server-side, which is NOT a tone — the
   * catalogue answers `soft` for it, because ink and paper-2 are the same
   * surface. The editor never learns the class at all, only the swatch.
   */
  it('takes the ink bands default tone off the wire rather than inventing one', () => {
    const rows = buildSectionRows(pageSections(), availability(), sectionTypes())
    expect(rows.find(r => r.key === 'contact')?.defaultTone).toBe('soft')
    expect(rows.find(r => r.key === 'reviews')?.defaultTone).toBe('soft')
  })

  it('reads a tenant-added rows default tone off its TYPE, not its key', () => {
    const added: PageSection[] = [...pageSections(), { key: 'text_4', enabled: true, sort: 8, tone: 'page' }]
    const rows = buildSectionRows(added, availability(), sectionTypes())
    expect(rows.find(r => r.key === 'text_4')).toMatchObject({ tone: 'page', defaultTone: 'soft' })
  })

  it('normalises a missing, null, empty or non-string tone to null', () => {
    const odd: PageSection[] = [
      { key: 'hero', enabled: true, sort: 0 },
      { key: 'about', enabled: true, sort: 2, tone: null },
      { key: 'team', enabled: true, sort: 3, tone: '' },
      { key: 'contact', enabled: true, sort: 6, tone: 7 as unknown as string },
    ]
    const rows = buildSectionRows(odd, availability(), sectionTypes())
    expect(rows).toHaveLength(4)
    for (const row of rows) expect(row.tone).toBeNull()
  })

  it('leaves defaultTone null when the catalogue publishes none (an older backend)', () => {
    const bare: SectionTypeOption[] = sectionTypes().map(type => {
      const copy = { ...type }
      delete copy.default_tone
      return copy
    })
    const rows = buildSectionRows(pageSections(), availability(), bare)
    expect(rows.every(r => r.defaultTone === null)).toBe(true)
  })
})
