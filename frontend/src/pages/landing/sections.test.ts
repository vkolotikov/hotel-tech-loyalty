import { describe, expect, it } from 'vitest'
import { isDataBackedSection, isOfferable, sectionGroup, unavailableReason, type SectionMeta } from './sections'

const meta = (overrides: Partial<SectionMeta>): SectionMeta => ({
  key: 'reviews',
  label: '',
  sourceLabel: '',
  available: true,
  count: 0,
  ...overrides,
})

describe('isOfferable', () => {
  // Data-backed: services, team, reviews. The wizard's own worked example
  // ("Treatments — 12 from your Services") and the spec's reviews example
  // ("no featured reviews means the toggle is off and says why") are both
  // this kind — offerable only when the tenant actually has rows.
  it('never offers a data-backed section with no data', () => {
    expect(isOfferable(meta({ key: 'reviews', available: true, count: 0 }))).toBe(false)
    expect(isOfferable(meta({ key: 'reviews', available: false, count: 4 }))).toBe(false)
    expect(isOfferable(meta({ key: 'reviews', available: true, count: 4 }))).toBe(true)
  })

  // Copy-backed: hero, about, contact. These have no rows to be empty of —
  // the tenant supplies their content by writing it directly on the page —
  // so gating them like `reviews` would mean `about` could never become
  // available on a brand-new page (its `available` is false by
  // construction until the tenant writes into it -- see
  // LandingOnboardingTest::test_every_sections_availability_matches_the_renderers_own_answer).
  it('always offers a copy-backed section, even with zero rows and unavailable', () => {
    expect(isOfferable(meta({ key: 'about', available: false, count: 0 }))).toBe(true)
    expect(isOfferable(meta({ key: 'hero', available: false, count: 0 }))).toBe(true)
    expect(isOfferable(meta({ key: 'contact', available: false, count: 0 }))).toBe(true)
  })

  // Ruling 3a-2: `booking` has no source table either, but unlike
  // hero/about/contact its `available` is an industry gate (Task 4 --
  // hotel only), not a "not written yet" signal -- no amount of writing
  // ever flips it back to true this session. Offering it anyway is the
  // exact "wizard offers a toggle the renderer will never honour" defect
  // the shared predicate exists to prevent, so it must respect
  // `available` like a data-backed section does, even though it is not
  // one (count mirrors availability here rather than counting rows).
  it('never offers booking once the backend reports it unavailable for this industry, regardless of count', () => {
    expect(isOfferable(meta({ key: 'booking', available: false, count: 0 }))).toBe(false)
    // Defensive: even a stray truthy count must not override the gate.
    expect(isOfferable(meta({ key: 'booking', available: false, count: 1 }))).toBe(false)
    expect(isOfferable(meta({ key: 'booking', available: true, count: 1 }))).toBe(true)
  })
})

/**
 * Fix 2 (phase 3a correctness review): the backend has shipped booking's
 * industry-gate explanation in `reason` since Task 4; nothing on this side
 * of the wire ever preferred it over the generic "nothing to show yet"
 * instruction, so a non-hotel tenant read an instruction to add something
 * from a button that will never unlock the section. This is the one
 * function that preference lives in — see this file's own docblock on why
 * it is not just inlined at the two render call sites.
 */
describe('unavailableReason', () => {
  const generic = 'Nothing to show yet. Add some from Your Services and Team screens.'

  it('prefers the backend reason when the row carries one', () => {
    const reason = "Online booking needs a service on your Services screen, linked to a team member on your Team screen who has working hours. Until then your 'Book appointment' button will point visitors at your phone number or contact details instead."
    expect(unavailableReason(meta({ key: 'booking', reason }), generic)).toBe(reason)
  })

  it('falls back to the generic text when reason is null', () => {
    expect(unavailableReason(meta({ key: 'booking', reason: null }), generic)).toBe(generic)
  })

  it('falls back to the generic text when reason is absent entirely', () => {
    expect(unavailableReason(meta({ key: 'services' }), generic)).toBe(generic)
  })
})

/**
 * TEMPLATE FIDELITY 2.3 — the third member of the
 * `isDataBackedSection`/`isOfferable` family.
 *
 * One answer per row, because it is what a card's BADGE prints, and a badge
 * that hedges says nothing. The wider "is one of my pictures in here"
 * question — the one the Photos chip actually asks — belongs to
 * `rowHasPhotos` in `builderShape.ts` and is deliberately not this.
 */
describe('sectionGroup', () => {
  it('files the four sections whose content lives on another screen as workspace', () => {
    for (const key of ['services', 'team', 'reviews', 'contact']) {
      expect(sectionGroup({ key })).toBe('workspace')
    }
  })

  // `contact` is the one that is not a `DATA_BACKED_SECTION`: its values
  // are not rows anywhere, but they resolve from the tenant's Properties
  // screen, and the card already says so in as many words.
  it('files contact as workspace even though it is not data-backed', () => {
    expect(isDataBackedSection('contact')).toBe(false)
    expect(sectionGroup({ key: 'contact' })).toBe('workspace')
  })

  // `writtenBy` is `PageContent::count()`'s two arms, carried on the row —
  // so a band that renders because of its PICTURES is badged as pictures.
  it('files a picture-led band as photos and everything else as write', () => {
    expect(sectionGroup({ key: 'gallery_1', writtenBy: 'photos' })).toBe('photos')
    expect(sectionGroup({ key: 'text_1', writtenBy: 'words' })).toBe('write')
    expect(sectionGroup({ key: 'hero', writtenBy: 'words' })).toBe('write')
    expect(sectionGroup({ key: 'announcement' })).toBe('write')
  })

  // The workspace answer wins even if such a type ever gained pictures —
  // Phase 4 adds a photo slot to `services` and `team`, and the card still
  // belongs to the screen its rows come from.
  it('keeps a workspace section in workspace when it gains pictures', () => {
    expect(sectionGroup({ key: 'team', writtenBy: 'photos' })).toBe('workspace')
  })
})
