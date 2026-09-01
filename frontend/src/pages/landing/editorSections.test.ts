import { describe, expect, it } from 'vitest'
import {
  addableTypes, appendSection, buildSectionRows, buildSectionsPayload, faqPairsOf, fieldsForType, instanceRowLabel,
  visibleFaqPairs,
  moveSection, moveSectionTo, moveSectionToKey, orderedSections, parseSectionKey, removeSection, removeSectionContent,
  freeGalleryLeaves, gallerySlots,
  safeImageUrl, sectionIndex, setSectionTone, stripImageLeaves, toggleSection,
  FIELD_PRESENTATION,
  type EditorSectionRow, type PageSection, type SectionAvailability, type SectionTypeOption,
} from './editorSections'

/**
 * The seven bands a beauty page is created with, as a FIXTURE.
 *
 * It used to be `SECTION_ORDER`, imported from `./sections` — a literal the
 * production code also read. Template fidelity 3.1 deleted that literal (the
 * wizard's last reader now iterates the served rows), so the seven keys are
 * spelled here, where they are what they have always actually been in this
 * file: the shape of `pageSections()` below, restated so an assertion can
 * name it.
 */
const SEEDED_KEYS = ['hero', 'services', 'about', 'team', 'reviews', 'booking', 'contact']

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
  it('merges page state with availability, in sort order, every seeded key present', () => {
    const rows = buildSectionRows(pageSections(), availability(), sectionTypes())
    expect(rows.map(r => r.key)).toEqual(SEEDED_KEYS)
    expect(rows[1]).toEqual({
      key: 'services', label: 'Treatments', sourceLabel: 'Your Services screen',
      available: true, count: 12, reason: null, enabled: true, sort: 1,
      // Builder round: every row now also carries what it is, whether it can
      // be removed, and which controls it renders. A fixed band is one of
      // one and is never removable — pinned whole here rather than
      // spot-checked, because "a fixed row quietly became removable" is
      // exactly the regression this asserts against.
      typeId: 'services', fixed: true, ordinal: 1, siblings: 1,
      // Template fidelity 1.3: the SERVED catalogue's fields, through the
      // same `fieldsForType` the added rows have always used — no longer a
      // hand-written per-section map.
      fields: fieldsForType(sectionTypes().find(o => o.id === 'services')!),
      // Gallery round: what makes a tenant-added band appear. A fixed row
      // never renders that line, so this is the harmless default.
      writtenBy: 'words',
      // Tone round: the band's colour and the swatch to light while it has
      // none.
      tone: null, defaultTone: 'page',
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
    const rows = buildSectionRows(pageSections(), withReason, sectionTypes())
    const booking = rows.find(r => r.key === 'booking')
    expect(booking?.reason).toBe(
      "Online booking currently supports hotel stays. Your 'Book appointment' button will point visitors at your contact details instead.",
    )
  })

  it('normalises a missing reason to null rather than undefined', () => {
    const rows = buildSectionRows(pageSections(), availability(), sectionTypes())
    expect(rows.find(r => r.key === 'hero')?.reason).toBeNull()
  })

  it('drops a page-section row with no matching availability entry', () => {
    const rows = buildSectionRows(pageSections(), availability().filter(a => a.key !== 'booking'), sectionTypes())
    expect(rows.map(r => r.key)).not.toContain('booking')
    expect(rows).toHaveLength(6)
  })

  /**
   * Template fidelity 1.3 changed this row's ANSWER and it is the change
   * worth pinning.
   *
   * `footer` is a real fixed type in the served catalogue, and until 1.3
   * this function decided "is this a fixed band" against a seven-key
   * literal that had never heard of it — so a footer row was dropped as
   * junk even when the wire described it. It is now recognised, carried,
   * and named by the wire like every other fixed band.
   *
   * The drop is still there, in the place it belongs: a row the CATALOGUE
   * does not know is not a section, and neither is a fixed row the
   * onboarding response says nothing about.
   */
  it('carries a fixed row the served catalogue knows, whatever the wizard seeds', () => {
    const withFooter: PageSection[] = [...pageSections(), { key: 'footer', enabled: true, sort: 7 }]
    const withFooterAvailability: SectionAvailability[] = [
      ...availability(),
      { key: 'footer', label: 'Footer', source_label: 'Settings', available: true, count: 1 },
    ]
    const rows = buildSectionRows(withFooter, withFooterAvailability, sectionTypes())
    expect(rows.map(r => r.key)).toEqual([...SEEDED_KEYS, 'footer'])
    expect(rows.find(r => r.key === 'footer')).toMatchObject({ fixed: true, label: 'Footer' })
  })

  it('drops a fixed row the onboarding response says nothing about', () => {
    const withFooter: PageSection[] = [...pageSections(), { key: 'footer', enabled: true, sort: 7 }]
    const rows = buildSectionRows(withFooter, availability(), sectionTypes())
    expect(rows.map(r => r.key)).not.toContain('footer')
  })

  it('drops every row when no catalogue is served, rather than inventing seven', () => {
    // The honest degradation, and the one this function's own docblock
    // argues for: with no catalogue this build knows neither which keys are
    // sections nor what fields any of them edit, so seven cards with no
    // controls in them would be a worse answer than none. Unreachable in
    // practice — `LandingPages.tsx` only mounts the editor on a resolved
    // onboarding response, which has carried `section_types` since the
    // builder round.
    expect(buildSectionRows(pageSections(), availability())).toEqual([])
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
    const rows = buildSectionRows(pageSections(), availability(), sectionTypes()) // reviews: available:false, count:0, but enabled:true would come from... see next line
    // Force the exact stale-state scenario: reviews stored as enabled:true, but no longer offerable.
    const stale: EditorSectionRow[] = rows.map(r => (r.key === 'reviews' ? { ...r, enabled: true } : r))
    const payload = buildSectionsPayload(stale)
    expect(payload.find(p => p.key === 'reviews')).toEqual({ key: 'reviews', enabled: false, sort: 4, tone: null })
  })

  it('leaves a copy-backed row enabled even when unavailable with zero count (about)', () => {
    const rows = buildSectionRows(pageSections(), availability(), sectionTypes())
    const payload = buildSectionsPayload(rows)
    // `about` is available:false/count:0 in the fixture, but copy-backed sections are always offerable.
    expect(payload.find(p => p.key === 'about')).toEqual({ key: 'about', enabled: true, sort: 2, tone: null })
  })

  it('produces exactly {key, enabled, sort, tone} per row, dropping label/sourceLabel/available/count', () => {
    const rows = buildSectionRows(pageSections(), availability(), sectionTypes())
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
    const rows = buildSectionRows(pageSections(), availability(), sectionTypes())
    for (const row of buildSectionsPayload(rows)) {
      expect(row).toHaveProperty('tone')
      expect(row.tone).toBeNull()
    }
  })

  it('carries a stored tone through to the wire', () => {
    const toned = pageSections().map(s => (s.key === 'about' ? { ...s, tone: 'accent' } : s))
    const payload = buildSectionsPayload(buildSectionRows(toned, availability(), sectionTypes()))
    expect(payload.find(p => p.key === 'about')?.tone).toBe('accent')
    expect(payload.find(p => p.key === 'hero')?.tone).toBeNull()
  })
})

/**
 * TEMPLATE FIDELITY 1.3 — THE KEYSTONE, pinned as a DERIVATION rather than
 * as a list.
 *
 * What this replaces: a `SECTION_CONTENT_FIELDS` describe that asserted a
 * hand-written per-section map had an entry for each of seven keys. That
 * test could only ever prove the map agreed with itself — and the map had
 * meanwhile drifted from the server's catalogue on four of those seven
 * types, so `hero.kicker`, `booking.call_label`/`call_short` and `contact`'s
 * five wording overrides were read by shipped partials and fillable by
 * nobody.
 *
 * The claim now is the one that matters: EVERY field the server publishes
 * for a type gets a control, in the server's own order, for a fixed row and
 * a tenant-added one alike. Mutation check: drop a name from
 * `fieldsForType`'s spread and every case below goes red.
 */
describe('field authority — the served catalogue, not a mirror', () => {
  const fieldsFor = (key: string, types = sectionTypes()) =>
    buildSectionRows(pageSections(), availability(), types)
      .find(r => r.key === key)!.fields.map(f => f.name)

  it('gives a fixed row every field its catalogue type publishes, in order', () => {
    // Over the types the fixture page actually carries. `footer` has no
    // fields at all, and `announcement`/`trust`/`faq` are the blocks 3.1
    // made addable — they have their own cases below, and the FAQ's fields
    // are deliberately not one-for-one (its pairs are one control).
    for (const type of sectionTypes().filter(o => SEEDED_KEYS.includes(o.id))) {
      const rendered = fieldsFor(type.id)
      // The photo control is synthesised and is never on the wire, so the
      // catalogue's own list is what must appear after it.
      expect(rendered.filter(name => name !== 'image_url' && name !== 'gallery'))
        .toEqual(type.fields)
    }
  })

  it('surfaces the four controls the hand-written mirror had lost', () => {
    // Every one of these is read by a shipped partial and none of them had
    // a control before 1.3.
    expect(fieldsFor('hero')).toContain('kicker')
    expect(fieldsFor('booking')).toEqual(expect.arrayContaining(['call_label', 'call_short']))
    expect(fieldsFor('contact')).toEqual(
      expect.arrayContaining(['phone_label', 'email_label', 'address_label', 'map_label', 'closed_label']),
    )
  })

  it('puts the photo control first on a type that takes one, and none on a type that does not', () => {
    expect(fieldsFor('hero')[0]).toBe('image_url')
    expect(fieldsFor('about')[0]).toBe('image_url')
    expect(fieldsFor('services')).not.toContain('image_url')
    expect(fieldsFor('team')).not.toContain('image_url')
  })

  /**
   * The presentation overlay is keyed by FIELD NAME, which is the half of
   * 1.3 that makes every later phase's field additions backend-only: a name
   * means the same thing wherever it appears, so `body` is a textarea on
   * `about` and on a tenant-added text block without either being named.
   */
  it('applies the same presentation to a name wherever it appears', () => {
    const fieldOf = (key: string, name: string) =>
      buildSectionRows([...pageSections(), { key: 'text_1', enabled: true, sort: 9 }], availability(), sectionTypes())
        .find(r => r.key === key)!.fields.find(f => f.name === name)

    expect(fieldOf('about', 'body')).toMatchObject({ multiline: true })
    expect(fieldOf('text_1', 'body')).toMatchObject({ multiline: true })
    expect(fieldOf('booking', 'terms')).toMatchObject({ multiline: true })
    expect(fieldOf('services', 'subtext')).toMatchObject({ multiline: true })
    expect(fieldOf('hero', 'headline')?.multiline).toBeUndefined()
  })

  /**
   * Fix 1 (phase 3a correctness review), carried forward: the editor's
   * contact inputs had no `type="email"`/`maxLength` at all, so an ordinary
   * tenant keystroke could reach the server holding an unbounded blob or an
   * unformatted email. These mirror the backend's own `content.contact.*`
   * rules, and they now arrive by NAME rather than by section.
   */
  it('mirrors the backend contact rules on phone/email/address', () => {
    const contact = buildSectionRows(pageSections(), availability(), sectionTypes())
      .find(r => r.key === 'contact')!.fields

    expect(contact.find(f => f.name === 'phone')).toMatchObject({ maxLength: 64 })
    expect(contact.find(f => f.name === 'email')).toMatchObject({ type: 'email', maxLength: 191 })
    expect(contact.find(f => f.name === 'address')).toMatchObject({ maxLength: 191 })
    // The five WORDING overrides beside them are plain text — they are the
    // words above the value, not the value.
    expect(contact.find(f => f.name === 'phone_label')).toEqual({ name: 'phone_label' })
  })

  /**
   * The whole point, stated as the thing a later phase gets for free: a
   * field the SERVER adds appears with no edit on this side.
   */
  it('renders a field this build has never heard of, because the server named it', () => {
    const withNewField = sectionTypes().map(o => (
      o.id === 'hero' ? { ...o, fields: [...o.fields, 'headline_accent'] } : o
    ))

    expect(fieldsFor('hero', withNewField)).toContain('headline_accent')
  })
})

describe('FIELD_PRESENTATION', () => {
  it('is keyed by field name and never by section key', () => {
    // A section key here would be the section-shaped second list 1.3
    // removed, creeping back in by the other door.
    for (const key of Object.keys(FIELD_PRESENTATION)) {
      expect(sectionTypes().some(type => type.id === key)).toBe(false)
    }
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
 * a text-only save reaches the server — see `stripImageLeaves`'s own
 * docblock for why an unstripped `image_url` leaf gets dragged into `form`
 * by reference and 422s an ordinary text save.
 */
describe('stripImageLeaves', () => {
  it('strips image_url from multiple sections at once, leaving siblings intact', () => {
    const content = {
      hero:  { image_url: '/storage/landing/hero.png', headline: 'Quiet luxury', subtext: 'Calm, considered.' },
      about: { image_url: '/storage/landing/about.png', kicker: 'Our story', lead: 'Since 2014' },
      services: { kicker: 'What we do', heading: 'Treatments' },
    }
    expect(stripImageLeaves(content)).toEqual({
      hero:  { headline: 'Quiet luxury', subtext: 'Calm, considered.' },
      about: { kicker: 'Our story', lead: 'Since 2014' },
      services: { kicker: 'What we do', heading: 'Treatments' },
    })
  })

  it('tolerates a non-object section — string, number, or null — passing it through untouched', () => {
    const content = { hero: 'a bare scalar section', about: 42, contact: null }
    expect(stripImageLeaves(content as unknown as Record<string, unknown>)).toEqual({
      hero: 'a bare scalar section', about: 42, contact: null,
    })
  })

  it('tolerates null or undefined content, returning {} — matching the save body\'s own `?? {}`', () => {
    expect(stripImageLeaves(null)).toEqual({})
    expect(stripImageLeaves(undefined)).toEqual({})
  })

  it('does not mutate the input object', () => {
    const content = { hero: { image_url: '/storage/landing/hero.png', headline: 'Old' } }
    const snapshot = JSON.parse(JSON.stringify(content))
    stripImageLeaves(content)
    expect(content).toEqual(snapshot)
  })

  it('a section with no image_url to begin with is returned with every key intact', () => {
    const content = { services: { kicker: 'What we do', heading: 'Treatments', subtext: 'Every service, one place.' } }
    expect(stripImageLeaves(content)).toEqual(content)
  })

  /**
   * The gallery round widened this from the single `image_url` leaf to the
   * whole `image_*` family, because that is the family
   * `LandingPageController::update()` refuses (`SectionType::isImageField`).
   * Leaving even one of a gallery's eight leaves on the wire 422s the save
   * that a tenant only meant to change a caption in.
   */
  it('strips every photo leaf a gallery holds, not only image_url', () => {
    const content = {
      gallery_1: {
        heading: 'The rooms',
        image_1: '/storage/landing/one.png',
        image_2: '/storage/landing/two.png',
        image_8: '/storage/landing/eight.png',
      },
      hero: { image_url: '/storage/landing/hero.png', headline: 'Quiet luxury' },
    }
    expect(stripImageLeaves(content)).toEqual({
      gallery_1: { heading: 'The rooms' },
      hero: { headline: 'Quiet luxury' },
    })
  })

  /**
   * Wider than the eight legitimate leaves ON PURPOSE, for the reason
   * `isImageField()` gives on the server: the refusal is the whole family,
   * so a leaf a raw write left behind has to be stripped too or the save it
   * rides along on fails with a message about photos the tenant did not
   * touch.
   */
  it('strips a photo leaf outside the eight a gallery legitimately holds', () => {
    expect(stripImageLeaves({ gallery_1: { image_9: '/storage/x.png', heading: 'Kept' } }))
      .toEqual({ gallery_1: { heading: 'Kept' } })
  })

  /** A field that merely starts with the word is copy and stays editable. */
  it('leaves copy fields whose names only resemble a photo leaf', () => {
    const content = { hero: { image: 'not a leaf', imageurl: 'nor this', headline: 'Kept' } }
    expect(stripImageLeaves(content)).toEqual(content)
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
  // The REAL nine, as `SectionType::all()` publishes them. The five
  // `*_label` overrides are what template fidelity 1.3 is about: every one
  // is read by `contact.blade.php` and none of them had a control, because
  // the editor's own hand-written mirror stopped at the first four.
  {
    id: 'contact', repeatable: false, image: false, limit: null, default_tone: 'soft',
    fields: ['kicker', 'phone', 'email', 'address', 'phone_label', 'email_label', 'address_label', 'map_label', 'closed_label'],
  },
  { id: 'footer', repeatable: false, fields: [], image: false, limit: null, default_tone: 'page' },
  { id: 'text', repeatable: true, addable: true, fields: ['kicker', 'heading', 'body'], image: true, image_slots: 1, limit: 6, default_tone: 'soft' },
  // The gallery round. `image: false` with `image_slots: 8` is the wire's
  // own shape and not a mistake — `SectionType::payload()` publishes the
  // legacy bool as `images === 1` so a bundle that predates galleries draws
  // no photo control for one rather than a one-photo control the endpoints
  // would refuse. See that method's docblock.
  { id: 'gallery', repeatable: true, addable: true, fields: ['kicker', 'heading'], image: false, image_slots: 8, limit: 6, default_tone: 'page' },
  // Template fidelity 3.1: three FIXED types no industry seeds, which the
  // BeautyTech kits draw and which the add picker may therefore offer. The
  // `addable` key is the wire's own, and it is what separates these from
  // `footer` above — also fixed, also unseeded, and deliberately not
  // addable because it is chrome.
  {
    id: 'announcement', repeatable: false, addable: true, fields: ['text', 'cta_label'],
    image: false, image_slots: 0, limit: null, default_tone: 'page',
  },
  {
    id: 'trust', repeatable: false, addable: true, fields: ['quote', 'feature_1', 'feature_2', 'feature_3'],
    image: false, image_slots: 0, limit: null, default_tone: 'page',
  },
  {
    id: 'faq', repeatable: false, addable: true, image: false, image_slots: 0, limit: null, default_tone: 'page',
    fields: ['kicker', 'heading', 'subtext', 'q1', 'a1', 'q2', 'a2', 'q3', 'a3', 'q4', 'a4', 'q5', 'a5', 'q6', 'a6'],
  },
]

/** Every type this design draws — the served `templates[*].renders` fact
 *  (template fidelity 1.1), which `addableTypes` filters the picker on. */
const rendersEverything = (): string[] => sectionTypes().map(type => type.id)

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
    expect(parseSectionKey('carousel_1', types)).toBeNull()
    // A gallery IMAGE SLOT is not a section key: the image endpoints parse
    // `gallery_1.image_3`, and nothing in the section list may treat it as a
    // row.
    expect(parseSectionKey('gallery_1.image_3', types)).toBeNull()
    expect(parseSectionKey('gallery', types)).toBeNull()
    expect(parseSectionKey('gallery_7', types)).toBeNull()
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

  /**
   * TEMPLATE FIDELITY 5.x — a leaf this design's partial never prints is a
   * control that cannot act: the tenant types, the save succeeds, and their
   * page does not change. The list is the served `content_fields[type]`.
   */
  it('draws only the leaves the design prints, in the catalogue order', () => {
    const text = sectionTypes().find(t => t.id === 'text')!

    expect(fieldsForType(text, true, ['body', 'kicker']).map(f => f.name))
      .toEqual(['image_url', 'kicker', 'body'])
  })

  it('leaves every field alone when the design has no opinion', () => {
    const text = sectionTypes().find(t => t.id === 'text')!

    expect(fieldsForType(text, true, null).map(f => f.name))
      .toEqual(fieldsForType(text).map(f => f.name))
  })

  it('lets a design decline every leaf of a band it draws nothing of', () => {
    const text = sectionTypes().find(t => t.id === 'text')!

    // The photo control is `drawsPhotos`' business, not this list's — a
    // design that draws the picture and none of the words still draws the
    // picture.
    expect(fieldsForType(text, true, []).map(f => f.name)).toEqual(['image_url'])
    expect(fieldsForType(text, false, []).map(f => f.name)).toEqual([])
  })

  it('omits the photo control for a type that takes no photo', () => {
    const text = sectionTypes().find(t => t.id === 'text')!
    expect(fieldsForType({ ...text, image: false, image_slots: 0 }).map(f => f.name))
      .toEqual(['kicker', 'heading', 'body'])
  })

  /** `image_url` is never on the wire's `fields` — it has one writer, the
   *  image endpoints — so it can only ever be synthesised here. */
  it('never doubles the photo control if the wire ever sent image_url as a field', () => {
    const text = sectionTypes().find(t => t.id === 'text')!
    const fields = fieldsForType({ ...text, fields: ['kicker'] })
    expect(fields.filter(f => f.type === 'image')).toHaveLength(1)
  })

  /**
   * A MULTI-PHOTO type gets the strip, not the plate — and exactly one of
   * the two. They write different leaves through differently-spelled slots
   * (`gallery_1.image_3` against `hero`), so a row offering both would be
   * offering a control the endpoints refuse.
   */
  it('gives a multi-photo type the strip, carrying the served cap', () => {
    const gallery = sectionTypes().find(t => t.id === 'gallery')!
    expect(fieldsForType(gallery)).toEqual([
      { name: 'gallery', type: 'gallery', slots: 8 },
      { name: 'kicker' },
      { name: 'heading' },
    ])
    expect(fieldsForType(gallery).filter(f => f.type === 'image')).toHaveLength(0)
  })

  /**
   * THE CAP IS SERVED. A backend that raises it needs no release on this
   * side, and this side never carries a literal eight — the same discipline
   * `parseSectionKey` already applies to `limit`.
   */
  it('takes the photo cap from the wire rather than a literal', () => {
    const gallery = sectionTypes().find(t => t.id === 'gallery')!
    expect(fieldsForType({ ...gallery, image_slots: 12 })[0]).toEqual(
      { name: 'gallery', type: 'gallery', slots: 12 },
    )
  })

  /**
   * A backend that predates galleries publishes no `image_slots` at all, and
   * the fallback is the legacy bool — one photo or none, which is exactly
   * what that build's catalogue means. Never a guess at eight.
   */
  it('falls back to the legacy image bool when the wire carries no count', () => {
    const text = sectionTypes().find(t => t.id === 'text')!
    const legacy = { ...text }
    delete legacy.image_slots

    expect(fieldsForType(legacy)[0]).toEqual({ name: 'image_url', type: 'image' })
    expect(fieldsForType({ ...legacy, image: false })[0]).toEqual({ name: 'kicker' })
  })

  /** A count the wire could not have meant is not a photo control. */
  it('treats a nonsense served count as no count at all', () => {
    const gallery = sectionTypes().find(t => t.id === 'gallery')!

    for (const slots of [0, -1, 1.5, null] as const) {
      expect(fieldsForType({ ...gallery, image_slots: slots }).map(f => f.name))
        .toEqual(['kicker', 'heading'])
    }
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

  it('drops every row when no catalogue is supplied — added and fixed alike', () => {
    // Template fidelity 1.3 widened this from "added rows" to "every row":
    // which keys are FIXED is the catalogue's answer now too, so a build
    // with no catalogue recognises nothing rather than recognising seven
    // keys it happens to have written down. See the `buildSectionRows`
    // describe above for why that is the honest degradation.
    expect(buildSectionRows(withText(), availability())).toEqual([])
  })

  it('carries added rows once the catalogue is supplied', () => {
    const rows = buildSectionRows(withText(), availability(), sectionTypes())
    expect(rows.map(r => r.key)).toEqual([...SEEDED_KEYS, 'text_1', 'text_4'])
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
    expect(rows.filter(r => r.fixed).map(r => r.key)).toEqual(SEEDED_KEYS)
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

  it('gives an added row and a fixed row the SAME catalogue derivation', () => {
    const rows = buildSectionRows(withText(), availability(), sectionTypes())
    expect(rows.find(r => r.key === 'text_1')!.fields.map(f => f.name))
      .toEqual(['image_url', 'kicker', 'heading', 'body'])
    // Template fidelity 1.3: the fixed rows take the catalogue too now.
    // `booking`'s two phone-line labels used to be deliberately withheld
    // here by a hand-written map; `booking.blade.php` reads both.
    expect(rows.find(r => r.key === 'booking')!.fields.map(f => f.name))
      .toEqual(['kicker', 'heading', 'terms', 'call_label', 'call_short'])
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
    const junk: PageSection[] = [...pageSections(), { key: 'carousel_1', enabled: true, sort: 7 }]
    expect(buildSectionRows(junk, availability(), sectionTypes()).map(r => r.key)).toEqual(SEEDED_KEYS)
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

  /**
   * TEMPLATE FIDELITY 3.1 — the picker reads `addable`, not `repeatable`.
   *
   * The kits' `announcement`, `trust` and `faq` are FIXED types (one per
   * page) that no industry seeds, so nothing ever put them on a page and
   * this list refused them: three of the author's fifteen blocks, drawn by
   * shipped partials, reachable from no screen at all. `footer` is the
   * other direction and is the reason the rule is not simply "any fixed
   * type nothing seeded": it is chrome with no editable copy, the wire says
   * `addable: false`, and it stays out.
   */
  it('offers every addable type, fixed ones included, and never the footer', () => {
    expect(addableTypes(sectionTypes(), page(0), 16).map(t => t.id))
      .toEqual(['text', 'gallery', 'announcement', 'trust', 'faq'])
  })

  /** An older backend publishes no `addable` at all; its add endpoint
   *  accepts exactly the repeatable types, so degrading to those is the
   *  honest answer rather than a guess in either direction. */
  it('falls back to repeatable when the wire carries no addable flag', () => {
    const legacy = sectionTypes().map(type => {
      const copy = { ...type }
      delete copy.addable
      return copy
    })
    expect(addableTypes(legacy, page(0), 16).map(t => t.id)).toEqual(['text', 'gallery'])
  })

  it('offers nothing at all when the catalogue has not arrived', () => {
    expect(addableTypes([], page(0), 16)).toEqual([])
  })

  /**
   * The second filter: a block this DESIGN has no partial for is not
   * offered. A tenant could add a Text block on Nocturne, watch the editor
   * focus its first input, write copy, save — and never see it, because the
   * layout filtered a band with no partial straight back out.
   */
  it('drops a type the chosen design does not draw', () => {
    const drawsNoGallery = rendersEverything().filter(id => id !== 'gallery')

    expect(addableTypes(sectionTypes(), page(0), 16, drawsNoGallery).map(t => t.id))
      .toEqual(['text', 'announcement', 'trust', 'faq'])
  })

  /** A backend that publishes no `renders` must not be guessed at: offering
   *  them all is exactly what that build already did. */
  it('drops the design filter when the fact was never served', () => {
    expect(addableTypes(sectionTypes(), page(0), 16, null).map(t => t.id))
      .toEqual(addableTypes(sectionTypes(), page(0), 16).map(t => t.id))
  })

  /**
   * A fixed block's ceiling is ONE — a fact about the key grammar (a fixed
   * type IS its own key), not about the `limit` on the wire, which is null
   * for every fixed type. And its refusal is its own: there is nothing to
   * remove, the band is already in the list, and switching it back on is
   * the actual next step.
   */
  it('refuses a fixed block the page already carries, in its own words', () => {
    const withTrust: PageSection[] = [...pageSections(), { key: 'trust', enabled: false, sort: 9 }]
    const rows = addableTypes(sectionTypes(), withTrust, 16)

    expect(rows.find(t => t.id === 'trust')).toEqual({
      id: 'trust', used: 1, limit: 1, disabledReason: 'already_on_page', pageLimit: 16,
    })
    // The one it does not have is still live.
    expect(rows.find(t => t.id === 'faq')?.disabledReason).toBeNull()
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

/**
 * TEMPLATE FIDELITY 3.3 — the FAQ is a form, not fifteen boxes.
 *
 * `faq.fields` is `kicker, heading, subtext, q1, a1, … q6, a6`. Rendered
 * through the flat field loop that is fifteen stacked inputs on one card,
 * twelve of them labelled `q1`…`a6`. The couplets are synthesised into ONE
 * control the same way the gallery strip already is, and the cap comes off
 * the wire rather than being `MAX_FAQ_PAIRS` written out again here.
 */
describe('the FAQ pair form', () => {
  const faqType = () => sectionTypes().find(o => o.id === 'faq')!

  it('counts the pairs the server actually published', () => {
    expect(faqPairsOf(faqType())).toBe(6)
    expect(faqPairsOf(sectionTypes().find(o => o.id === 'hero')!)).toBe(0)
  })

  /** BOTH halves, because a half-pair is not a row the form can draw — the
   *  same rule `PageContent::faqPairs()` applies at the other end. */
  it('needs both halves of a pair, and stops at the first gap', () => {
    const half = { ...faqType(), fields: ['kicker', 'q1', 'a1', 'q2'] }
    expect(faqPairsOf(half)).toBe(1)

    const gapped = { ...faqType(), fields: ['q1', 'a1', 'q3', 'a3'] }
    expect(faqPairsOf(gapped)).toBe(1)
  })

  it('follows a raised cap off the wire rather than a hardcoded six', () => {
    const raised = {
      ...faqType(),
      fields: [...faqType().fields, 'q7', 'a7', 'q8', 'a8'],
    }
    expect(faqPairsOf(raised)).toBe(8)
    expect(fieldsForType(raised).find(f => f.type === 'faq_pairs')?.pairs).toBe(8)
  })

  /** One control, WHERE `q1` SAT, so the card still reads in the order the
   *  band's own partial renders: eyebrow, heading, intro, then questions. */
  it('collapses twelve leaves into one control in q1s place', () => {
    const fields = fieldsForType(faqType())

    expect(fields.map(f => f.name)).toEqual(['kicker', 'heading', 'subtext', 'faq_pairs'])
    expect(fields[3]).toEqual({ name: 'faq_pairs', type: 'faq_pairs', pairs: 6 })
  })

  it('leaves a type with no pairs exactly as it was', () => {
    const trust = sectionTypes().find(o => o.id === 'trust')!
    expect(fieldsForType(trust).map(f => f.name)).toEqual(trust.fields)
  })
})

/**
 * How many couplets the form draws. The floor and the cap are why this is a
 * function rather than a condition inside JSX: a band whose only written
 * pair is the fourth, and a cap of zero from a backend that publishes none,
 * are exactly the cases an inline expression gets wrong.
 */
describe('visibleFaqPairs', () => {
  it('never draws fewer than one row', () => {
    expect(visibleFaqPairs({}, 6, 0)).toBe(1)
  })

  it('draws every written pair, including a half-written one', () => {
    expect(visibleFaqPairs({ q1: 'a', a1: 'b', q2: 'c', a2: 'd' }, 6, 0)).toBe(2)
    // A lone question must stay visible or the tenant cannot finish it.
    expect(visibleFaqPairs({ q3: 'only a question' }, 6, 0)).toBe(3)
    expect(visibleFaqPairs({ a4: 'only an answer' }, 6, 0)).toBe(4)
  })

  it('ignores whitespace, the way the renderer does', () => {
    expect(visibleFaqPairs({ q1: '   ', a1: '\n\t' }, 6, 0)).toBe(1)
  })

  it('adds the rows the tenant revealed, and stops at the served cap', () => {
    expect(visibleFaqPairs({ q1: 'a', a1: 'b' }, 6, 2)).toBe(3)
    expect(visibleFaqPairs({ q1: 'a', a1: 'b' }, 6, 99)).toBe(6)
  })

  it('draws nothing at all when the backend published no pairs', () => {
    expect(visibleFaqPairs({ q1: 'a' }, 0, 3)).toBe(0)
  })

  it('ignores a non-string leaf out of the raw column', () => {
    expect(visibleFaqPairs({ q1: 7, a1: ['nope'] }, 6, 0)).toBe(1)
  })
})

/**
 * TEMPLATE FIDELITY 4.1/4.3/4.5 — the default+override image model on this
 * side of the wire.
 *
 * Three separate rules, and each of them is a control saying something
 * different: which picture is on the page, whose it is, and whether this
 * design draws one here at all.
 */
describe('the design own photographs', () => {
  const defaults = () => ({
    'gallery_1.image_1': '/landing/n/assets/one.webp',
    'gallery_1.image_2': '/landing/n/assets/two.webp',
  })

  it('shows the design photograph for a leaf the tenant has not filled', () => {
    const photos = gallerySlots({}, 'gallery_1', 8, defaults())

    expect(photos.map(p => p.url)).toEqual(['/landing/n/assets/one.webp', '/landing/n/assets/two.webp'])
    expect(photos.every(p => p.isDefault)).toBe(true)
  })

  /** Per LEAF, not per position: a tenant who replaces the second keeps the
   *  design's first, in the author's own order. */
  it('merges the tenants own uploads with the designs, leaf by leaf', () => {
    const section = { image_2: '/storage/mine.jpg' }
    const photos = gallerySlots(section, 'gallery_1', 8, defaults())

    expect(photos.map(p => p.url)).toEqual(['/landing/n/assets/one.webp', '/storage/mine.jpg'])
    expect(photos.map(p => p.isDefault)).toEqual([true, false])
  })

  /** A caption is numbered to match its PICTURE, never its position in the
   *  strip — a caption must not move when a gap above it closes. */
  it('names the caption leaf beside each picture', () => {
    const section = { image_3: '/storage/mine.jpg' }
    const photos = gallerySlots(section, 'gallery_1', 8)

    expect(photos).toHaveLength(1)
    expect(photos[0].captionLeaf).toBe('caption_3')
  })

  /** A design with none leaves the strip exactly as it was. */
  it('changes nothing for a design that ships no photographs', () => {
    const section = { image_1: '/storage/mine.jpg' }

    expect(gallerySlots(section, 'gallery_1', 8, {})).toEqual(gallerySlots(section, 'gallery_1', 8))
  })

  /** A hostile stored leaf still fails the allowlist, and what it falls back
   *  to is the design's picture rather than a hole — the battery is stronger,
   *  not weaker. */
  it('falls back to the designs photograph when the stored leaf is hostile', () => {
    const photos = gallerySlots({ image_1: 'javascript:alert(1)' }, 'gallery_1', 8, defaults())

    expect(photos[0].url).toBe('/landing/n/assets/one.webp')
    expect(photos[0].isDefault).toBe(true)
  })
})

/**
 * 4.5 — a photo control is not offered on a design with nowhere to put the
 * picture, and the words that describe a photograph go with it.
 */
describe('photo controls follow what the design actually draws', () => {
  const heroType = () => sectionTypes().find(o => o.id === 'hero')!

  it('draws the photo control by default, as every caller before this did', () => {
    expect(fieldsForType(heroType()).map(f => f.name)).toContain('image_url')
  })

  it('suppresses the photo control for a block this design draws no photograph in', () => {
    expect(fieldsForType(heroType(), false).map(f => f.name)).not.toContain('image_url')
  })

  /**
   * The words go with the picture — both directions. `alt` and `caption` are
   * ordinary served fields, but a caption listed on its own is a loose box
   * (and on a gallery, eight of them), so the photo control draws them; with
   * no photo control there is no photograph to describe.
   */
  it('never lists a picture words as a field of its own', () => {
    const withWords = { ...heroType(), fields: [...heroType().fields, 'alt', 'caption'] }

    expect(fieldsForType(withWords).map(f => f.name)).not.toContain('alt')
    expect(fieldsForType(withWords).map(f => f.name)).not.toContain('caption')
    expect(fieldsForType(withWords, false).map(f => f.name)).not.toContain('caption')
  })

  it('consumes one caption leaf per gallery tile rather than listing eight', () => {
    const galleryType = sectionTypes().find(o => o.id === 'gallery')!
    const captioned = {
      ...galleryType,
      fields: [...galleryType.fields, ...Array.from({ length: 8 }, (_, i) => `caption_${i + 1}`)],
    }

    expect(fieldsForType(captioned).map(f => f.name)).toEqual(['gallery', 'kicker', 'heading'])
  })

  /** The row carries the decision, so everything reading `row.fields` — the
   *  Photos filter chip included — sees the same answer. */
  it('carries the decision onto the row', () => {
    const drawn = buildSectionRows(pageSections(), availability(), sectionTypes(), null, ['hero'])
    const notDrawn = buildSectionRows(pageSections(), availability(), sectionTypes(), null, [])

    expect(drawn.find(r => r.key === 'hero')!.fields.map(f => f.name)).toContain('image_url')
    expect(notDrawn.find(r => r.key === 'hero')!.fields.map(f => f.name)).not.toContain('image_url')
    // Null is "this build was not told", which must change nothing.
    expect(buildSectionRows(pageSections(), availability(), sectionTypes(), null, null))
      .toEqual(buildSectionRows(pageSections(), availability(), sectionTypes(), null))
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

// ─── The gallery round: the photo strip's own maths ─────────────────────
//
// `App\Landing\PageContent::galleryImages()`'s answer and
// `SectionType::nextInstanceKey()`'s lowest-free rule, both re-derived on
// this side because nothing on the wire carries either (the onboarding
// response structurally cannot — see `buildSectionRows`). These are the
// functions the thumbnails, the count, the remove buttons and the multi-file
// upload are all built from, so this is where the strip is actually proven:
// `GalleryField` itself is a React component and this repo's vitest is
// node-env, pure-function-only.

describe('gallerySlots', () => {
  it('lists the photos in leaf order with their slots, whatever order they are stored in', () => {
    const section = {
      heading: 'The rooms',
      image_8: '/storage/landing/eighth.jpg',
      image_1: '/storage/landing/first.jpg',
      image_5: 'https://cdn.example.test/fifth.jpg',
    }

    expect(gallerySlots(section, 'gallery_1', 8).map(({ leaf, slot, url }) => ({ leaf, slot, url }))).toEqual([
      { leaf: 'image_1', slot: 'gallery_1.image_1', url: '/storage/landing/first.jpg' },
      { leaf: 'image_5', slot: 'gallery_1.image_5', url: 'https://cdn.example.test/fifth.jpg' },
      { leaf: 'image_8', slot: 'gallery_1.image_8', url: '/storage/landing/eighth.jpg' },
    ])
  })

  /**
   * The same allowlist the renderer applies (`safeImageUrl`, mirroring
   * `PageContent::imageUrl()`'s prefix rule), one leaf at a time: a
   * legal-but-unusable value handed to `resolveImage()` throws on its
   * unconditional `url.match(...)` and takes the whole editor route down —
   * minor m4's finding, eight leaves at a time.
   */
  it('drops every leaf that fails the allowlist and keeps the rest', () => {
    const section = {
      image_1: '/storage/landing/first.jpg',
      image_2: 'javascript:alert(1)',
      image_3: '//evil.example/x.jpg',
      image_4: '',
      image_5: 42,
      image_6: { nested: 'value' },
      image_7: null,
      image_8: '/storage/landing/eighth.jpg',
    }

    expect(gallerySlots(section, 'gallery_1', 8).map(p => p.leaf)).toEqual(['image_1', 'image_8'])
  })

  /** The cap is the SERVED one, so a leaf past it is not a photo the strip may show or offer to remove. */
  it('never looks past the served cap', () => {
    const section = { image_1: '/storage/a.jpg', image_9: '/storage/b.jpg' }

    expect(gallerySlots(section, 'gallery_1', 8).map(p => p.leaf)).toEqual(['image_1'])
    expect(gallerySlots(section, 'gallery_1', 0)).toEqual([])
  })

  /** `content` is schemaless: a scalar, an array, null and undefined are all shapes it holds. */
  it('tolerates every non-map shape a raw write can leave behind', () => {
    for (const section of ['a string', 42, null, undefined, ['image_1'], true]) {
      expect(gallerySlots(section, 'gallery_1', 8).map(({ leaf, slot, url }) => ({ leaf, slot, url }))).toEqual([])
    }
  })
})

describe('freeGalleryLeaves', () => {
  it('hands back the lowest free leaves, so a removal is the next slot filled', () => {
    // image_3 removed from a gallery of four: the next upload fills the gap
    // rather than burning image_5 — `nextInstanceKey`'s rule, one level down.
    const section = { image_1: '/storage/a.jpg', image_2: '/storage/b.jpg', image_4: '/storage/d.jpg' }

    expect(freeGalleryLeaves(section, 8, 1)).toEqual(['image_3'])
    expect(freeGalleryLeaves(section, 8, 3)).toEqual(['image_3', 'image_5', 'image_6'])
  })

  it('allocates a whole multi-file pick at once, with no leaf claimed twice', () => {
    const leaves = freeGalleryLeaves({ image_1: '/storage/a.jpg' }, 8, 4)

    expect(leaves).toEqual(['image_2', 'image_3', 'image_4', 'image_5'])
    expect(new Set(leaves).size).toBe(leaves.length)
  })

  /**
   * THE CAP, and the way the strip reports it: fewer leaves than asked for,
   * never an error. The caller uploads what fits and says plainly why the
   * rest did not.
   *
   * Mutation target: drop the `free.length < wanted` bound or the `n <=
   * limit` one and this goes red.
   */
  it('returns fewer than asked for at the cap, and nothing at all when full', () => {
    const full = Object.fromEntries(
      Array.from({ length: 8 }, (_, i) => ['image_' + (i + 1), '/storage/' + i + '.jpg']),
    )

    expect(freeGalleryLeaves(full, 8, 3)).toEqual([])
    expect(freeGalleryLeaves({ ...full, image_8: undefined }, 8, 3)).toEqual(['image_8'])
    expect(freeGalleryLeaves({}, 8, 20)).toHaveLength(8)
  })

  /**
   * OCCUPIED, not usable. A leaf holding a value the allowlist rejects is
   * still a leaf an upload would overwrite, and treating it as free would
   * silently destroy whatever is there — so it is not offered as a free
   * slot even though `gallerySlots` will not show it.
   */
  it('treats an unusable leaf as occupied rather than free', () => {
    const section = { image_1: 'javascript:alert(1)', image_2: 42 }

    expect(freeGalleryLeaves(section, 8, 1)).toEqual(['image_3'])
  })

  it('tolerates every non-map shape a raw write can leave behind', () => {
    for (const section of ['a string', 42, null, undefined, ['image_1']]) {
      expect(freeGalleryLeaves(section, 8, 2)).toEqual(['image_1', 'image_2'])
    }
  })
})

describe('buildSectionRows — a gallery row', () => {
  const withGallery = (): PageSection[] => [
    { key: 'hero', enabled: true, sort: 0 },
    { key: 'gallery_1', enabled: true, sort: 1 },
  ]

  /**
   * `PageContent::count()`'s `'gallery' =>` arm, restated: a gallery is its
   * PICTURES, so a caption alone does not make it appear — and the row has
   * to say so with the right sentence. Telling a tenant to "add some words"
   * for a band that renders on photos would send them exactly the wrong way,
   * which is what `writtenBy` exists to prevent.
   */
  it('counts a gallery by its photos and names what it needs', () => {
    const empty = buildSectionRows(
      withGallery(), availability(), sectionTypes(),
      { gallery_1: { kicker: 'Our work', heading: 'The rooms' } },
    ).find(r => r.key === 'gallery_1')!

    expect(empty.available).toBe(false)
    expect(empty.count).toBe(0)
    expect(empty.writtenBy).toBe('photos')

    const filled = buildSectionRows(
      withGallery(), availability(), sectionTypes(),
      { gallery_1: { image_2: '/storage/landing/two.jpg' } },
    ).find(r => r.key === 'gallery_1')!

    expect(filled.available).toBe(true)
    expect(filled.count).toBe(1)
    expect(filled.writtenBy).toBe('photos')
  })

  /** A gallery whose only leaf fails the allowlist has nothing to show, exactly as the renderer decides. */
  it('does not count a photo the renderer would refuse', () => {
    const row = buildSectionRows(
      withGallery(), availability(), sectionTypes(),
      { gallery_1: { image_1: 'javascript:alert(1)' } },
    ).find(r => r.key === 'gallery_1')!

    expect(row.available).toBe(false)
  })

  /** A text block still answers on its BODY, and still says "words". */
  it('leaves the text block on its own predicate', () => {
    const rows = buildSectionRows(
      [{ key: 'hero', enabled: true, sort: 0 }, { key: 'text_1', enabled: true, sort: 1 }],
      availability(), sectionTypes(),
      { text_1: { body: 'Quiet rooms.', image_1: '/storage/landing/one.jpg' } },
    )
    const text = rows.find(r => r.key === 'text_1')!

    expect(text.writtenBy).toBe('words')
    expect(text.available).toBe(true)
  })

  /** The strip is the row's first control, carrying the served cap. */
  it('gives the row the photo strip rather than the single plate', () => {
    const row = buildSectionRows(withGallery(), availability(), sectionTypes(), {})
      .find(r => r.key === 'gallery_1')!

    expect(row.fields[0]).toEqual({ name: 'gallery', type: 'gallery', slots: 8 })
  })
})
