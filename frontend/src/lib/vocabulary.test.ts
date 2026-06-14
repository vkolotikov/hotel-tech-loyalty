import { describe, expect, it } from 'vitest'
import { vocabularyFor, resolveLabel } from './vocabulary'

/**
 * Locks the industry-aware vocabulary layer (Phase 3).
 *
 * Two contract surfaces:
 *
 *   - vocabularyFor(industry) → (defaultLabel) => string | null
 *     Returns null when no override exists so the caller's fallback
 *     chain (typically i18n) can take over.
 *
 *   - resolveLabel(t, vocab, key, defaultLabel) → string
 *     The full fallback chain: vocabulary → i18n → defaultLabel.
 *
 * Critical invariants per the file's docblock:
 *
 *   1. Hotel returns null for every label (canonical = hotel). An
 *      identity mapping ('Members' → 'Members') would short-circuit
 *      the i18n chain. Lock it.
 *
 *   2. Beauty/Medical/Restaurant carry curated overrides per the
 *      Vocabulary Swap Table. Identity mappings deliberately
 *      omitted — fitness has NO 'Members' override because gym
 *      orgs use "Members" verbatim.
 *
 *   3. null / undefined industry → vocabularyFor returns a noop that
 *      always returns null (legacy-session safety net for stale
 *      auth stores from before Phase 1).
 *
 *   4. resolveLabel calls vocabulary FIRST; only when null does it
 *      delegate to the t(key, fallback) chain.
 */
describe('vocabularyFor — per-industry lookup', () => {
  it('hotel returns null for every override key (identity industry)', () => {
    // Hotel IS the canonical English. Any non-null override would
    // break the i18n chain for that specific label on hotel orgs.
    const vocab = vocabularyFor('hotel')
    expect(vocab('Members')).toBeNull()
    expect(vocab('Reservations')).toBeNull()
    expect(vocab('Rooms & Services')).toBeNull()
    expect(vocab('Hotel Info')).toBeNull()
  })

  it('beauty relabels Members → Clients and Reservations → Appointments', () => {
    const vocab = vocabularyFor('beauty')
    expect(vocab('Members')).toBe('Clients')
    expect(vocab('Reservations')).toBe('Appointments')
    expect(vocab('Services')).toBe('Treatments')
    expect(vocab('Properties')).toBe('Salons')
  })

  it('beauty keeps the group "Bookings" canonical (collision avoidance)', () => {
    // Per the docblock: relabelling BOTH the "Bookings" group AND
    // the "Reservations" item would create a duplicate sidebar
    // visual (APPOINTMENTS > Appointments). Only the item flexes.
    const vocab = vocabularyFor('beauty')
    expect(vocab('Bookings')).toBeNull()
  })

  it('medical relabels for the patient domain (Patients/Appointments/Procedures)', () => {
    const vocab = vocabularyFor('medical')
    expect(vocab('Members')).toBe('Patients')
    expect(vocab('Reservations')).toBe('Appointments')
    expect(vocab('Services')).toBe('Procedures')
    expect(vocab('Properties')).toBe('Clinics')
    expect(vocab('Masters')).toBe('Practitioners')
  })

  it('restaurant relabels for the dining domain (Regulars/Tables/etc.)', () => {
    const vocab = vocabularyFor('restaurant')
    expect(vocab('Members')).toBe('Regulars')
    expect(vocab('Reservations')).toBe('Table reservations')
    expect(vocab('Rooms & Services')).toBe('Tables')
    expect(vocab('Properties')).toBe('Venues')
  })

  it('fitness deliberately does NOT override "Members" (gym vocabulary)', () => {
    // Critical: an identity mapping ('Members' → 'Members') would
    // short-circuit i18n for fitness orgs. The fitness map
    // deliberately omits the entry so vocabularyFor returns null
    // and the i18n chain takes over.
    const vocab = vocabularyFor('fitness')
    expect(vocab('Members')).toBeNull()
    // But other gym-specific overrides DO apply:
    expect(vocab('Reservations')).toBe('Classes')
    expect(vocab('Properties')).toBe('Locations')
  })

  it('legal/real_estate/education have sparse but meaningful overrides', () => {
    // GTM-deferred industries: minimal customisation, but the
    // single-most-important nouns (Members → Clients etc.) flex.
    const legal = vocabularyFor('legal')
    expect(legal('Members')).toBe('Clients')
    expect(legal('Reservations')).toBe('Consultations')

    const realEstate = vocabularyFor('real_estate')
    expect(realEstate('Members')).toBe('Clients')
    expect(realEstate('Reservations')).toBe('Viewings')
    expect(realEstate('Properties')).toBe('Listings')

    const education = vocabularyFor('education')
    expect(education('Members')).toBe('Students')
    expect(education('Reservations')).toBe('Lessons')
  })

  it('returns null on labels not in the industry map (fallback to i18n)', () => {
    // Critical fallback: a label without a specific override must
    // return null so the consumer's `vocab(x) ?? t(...)` chain
    // continues to i18n. Returning the defaultLabel verbatim would
    // also break the chain.
    const vocab = vocabularyFor('beauty')
    expect(vocab('A Label That Does Not Exist')).toBeNull()
  })

  it('null industry returns a noop lookup (legacy session safety net)', () => {
    // Stale auth store from before Phase 1 has user.industry ===
    // undefined. Must NOT crash; every label returns null so the
    // SPA renders canonical English instead.
    const vocab = vocabularyFor(null)
    expect(vocab('Members')).toBeNull()
    expect(vocab('Reservations')).toBeNull()
  })

  it('undefined industry returns a noop lookup', () => {
    const vocab = vocabularyFor(undefined)
    expect(vocab('Members')).toBeNull()
  })
})

describe('resolveLabel — vocabulary → i18n → defaultLabel chain', () => {
  it('returns the vocabulary override when industry has one', () => {
    const vocab = vocabularyFor('beauty')
    const fakeT = (_key: string, fallback: string) => fallback
    expect(resolveLabel(fakeT, vocab, 'nav.items.members', 'Members'))
      .toBe('Clients')
  })

  it('falls through to t(key, fallback) when vocabulary returns null', () => {
    const vocab = vocabularyFor('hotel') // hotel = no overrides
    // Simulate i18n returning the localised string for the key.
    const fakeT = (key: string, fallback: string) => {
      if (key === 'nav.items.members') return 'Участники'
      return fallback
    }
    expect(resolveLabel(fakeT, vocab, 'nav.items.members', 'Members'))
      .toBe('Участники')
  })

  it('falls through to defaultLabel when both vocab and i18n return the default', () => {
    const vocab = vocabularyFor(null)
    const fakeT = (_key: string, fallback: string) => fallback
    expect(resolveLabel(fakeT, vocab, 'nav.items.x', 'Default Label'))
      .toBe('Default Label')
  })

  it('vocabulary wins over i18n when both have a value', () => {
    // The fallback chain order matters: industry vocabulary is
    // ALWAYS the highest priority. A beauty org reading "Clients"
    // must not see the Russian "Участники" even if their locale
    // has one. (RU vocabulary entries are the planned Phase 3.x
    // follow-up; first ship is EN-only override-then-i18n.)
    const vocab = vocabularyFor('beauty')
    const fakeT = (key: string, fallback: string) => {
      if (key === 'nav.items.members') return 'Участники'
      return fallback
    }
    expect(resolveLabel(fakeT, vocab, 'nav.items.members', 'Members'))
      .toBe('Clients') // beauty override wins over i18n
  })
})
