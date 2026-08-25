import { describe, expect, it } from 'vitest'
import {
  STEPS, clampStep, mergeFormDraft, parseDraft, draftKey, loadDraft, saveDraft, clearDraft,
  buildPayload, type DraftStorage, type FontPairingKey,
} from './landingDraft'
import type { SectionMeta } from './sections'

/** In-memory stand-in for `localStorage`, which does not exist in this
 *  vitest config's `node` environment (see `vitest.config.ts`'s own
 *  docblock — deliberately no jsdom). Lets `loadDraft`/`saveDraft`/
 *  `clearDraft` be exercised for real, not just `draftKey` in isolation. */
class FakeStorage implements DraftStorage {
  private data = new Map<string, string>()
  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value)
  }
  removeItem(key: string): void {
    this.data.delete(key)
  }
}

describe('mergeFormDraft', () => {
  it('keeps a known string field from the patch', () => {
    expect(mergeFormDraft({ template_key: 'ruled_page' })).toEqual({ template_key: 'ruled_page' })
  })

  // The exact failure this function exists to survive: a draft written
  // before a field existed. If a missing key were defaulted to '' instead
  // of left absent, restoring the draft would permanently blank out the
  // tenant's server-prefilled subtext (form.subtext ?? prefill.subtext ??
  // '') instead of falling through to it.
  it('leaves a field the patch never mentions absent, not defaulted to empty string', () => {
    const merged = mergeFormDraft({ headline: 'Welcome' })
    expect(merged.subtext).toBeUndefined()
    expect('subtext' in merged).toBe(false)
  })

  it('drops a key this build does not recognise', () => {
    const merged = mergeFormDraft({ template_key: 'ruled_page', shoe_size: 42 })
    expect(merged).toEqual({ template_key: 'ruled_page' })
    expect('shoe_size' in merged).toBe(false)
  })

  it('drops a value whose type does not match, rather than trusting it', () => {
    const merged = mergeFormDraft({ template_key: 123, headline: null, subtext: ['a'] })
    expect(merged).toEqual({})
  })

  it('returns an empty form for a patch that is not a plain object', () => {
    expect(mergeFormDraft(null)).toEqual({})
    expect(mergeFormDraft(undefined)).toEqual({})
    expect(mergeFormDraft('garbage')).toEqual({})
    expect(mergeFormDraft(42)).toEqual({})
    expect(mergeFormDraft(['a', 'b'])).toEqual({})
  })

  // Task 7's own fields. brand_color is a plain string, same rules as
  // template_key/headline/subtext above; font_pairing and sections each get
  // their own guard beyond "is it a string" — see below.
  it('keeps a valid brand_color', () => {
    expect(mergeFormDraft({ brand_color: '#1f5fa8' })).toEqual({ brand_color: '#1f5fa8' })
  })

  it('keeps a font_pairing that is one of the three the backend accepts', () => {
    expect(mergeFormDraft({ font_pairing: 'modern' })).toEqual({ font_pairing: 'modern' })
  })

  // The one guard font_pairing needs that a plain string field does not:
  // `LandingOnboardingController::store()` 422s on anything outside
  // editorial/modern/classic, so a value from a Phase-3-removed pairing (or
  // a hand-edited localStorage entry) must not reach the request at all.
  it('drops a font_pairing that is not one of the three known keys', () => {
    const merged = mergeFormDraft({ font_pairing: 'brutalist' })
    expect(merged).toEqual({})
    expect('font_pairing' in merged).toBe(false)
  })

  it('keeps a sections map, entry by entry', () => {
    expect(mergeFormDraft({ sections: { services: true, reviews: false } }))
      .toEqual({ sections: { services: true, reviews: false } })
  })

  // A single corrupted entry must not cost every other section the tenant
  // toggled — each entry is validated on its own, not the map as a whole.
  it('drops only the sections entries whose value is not a boolean', () => {
    const merged = mergeFormDraft({ sections: { services: true, reviews: 'yes', team: null } })
    expect(merged).toEqual({ sections: { services: true } })
  })

  it('drops a sections value that is not a plain object', () => {
    expect(mergeFormDraft({ sections: ['services'] })).toEqual({})
    expect('sections' in mergeFormDraft({ sections: 'services' })).toBe(false)
  })
})

describe('clampStep', () => {
  it('clamps a too-large step to the last step this build renders', () => {
    expect(clampStep(99)).toBe(STEPS.length - 1)
  })

  it('clamps a negative step to 0', () => {
    expect(clampStep(-3)).toBe(0)
  })

  it('defaults a non-number to 0', () => {
    expect(clampStep('two')).toBe(0)
    expect(clampStep(undefined)).toBe(0)
    expect(clampStep(NaN)).toBe(0)
  })

  it('truncates a fractional step', () => {
    expect(clampStep(0.9)).toBe(0)
  })
})

describe('parseDraft', () => {
  it('deep-merges a legacy-shaped draft over the empty form and clamps the step', () => {
    const result = parseDraft({ step: 1, form: { headline: 'Hi' } })
    expect(result.step).toBe(1)
    expect(result.form.headline).toBe('Hi')
    expect(result.form.template_key).toBeUndefined()
  })

  it('survives a completely malformed value without throwing', () => {
    expect(parseDraft(null)).toEqual({ step: 0, form: {} })
    expect(parseDraft('not json-shaped')).toEqual({ step: 0, form: {} })
    expect(parseDraft({ step: 'x', form: null })).toEqual({ step: 0, form: {} })
    expect(parseDraft(42)).toEqual({ step: 0, form: {} })
  })

  it('clamps an out-of-range step saved by a build with more steps than this one has', () => {
    // The scenario the clamp exists for: Task 7 lands, its build writes
    // step: 3 to the SAME draft key, then this build (mid-deploy, or a
    // reverted rollback) reads it back.
    const result = parseDraft({ step: 3, form: {} })
    expect(result.step).toBe(STEPS.length - 1)
  })
})

describe('draftKey', () => {
  it('gives each brand id its own key', () => {
    expect(draftKey(1)).not.toBe(draftKey(2))
  })

  it('is stable for the same brand id', () => {
    expect(draftKey(7)).toBe(draftKey(7))
  })

  it('gives the org-wide (null) selection its own key, distinct from any numeric id', () => {
    // 0 is a legitimate (if unusual) numeric id and is falsy, same as null
    // in a loose comparison -- the two must still not collide.
    expect(draftKey(null)).not.toBe(draftKey(0))
  })
})

// Fix round 1: neither the draft key nor the in-memory wizard state was
// scoped by brand. BrandSwitcher changes the selected brand WITHOUT
// unmounting the wizard, so a tenant switching brands mid-wizard could see
// -- and persist -- one brand's copy under another's session. These tests
// exercise loadDraft/saveDraft/clearDraft with a real (fake) Storage to
// prove two brands cannot read or clear each other's draft.
describe('loadDraft / saveDraft / clearDraft — brand isolation', () => {
  it('a draft saved for one brand is not visible when loading a different brand', () => {
    const storage = new FakeStorage()
    saveDraft(1, 1, { headline: 'Brand A headline' }, storage)
    expect(loadDraft(2, storage)).toBeNull()
    expect(loadDraft(1, storage)?.form.headline).toBe('Brand A headline')
  })

  it('the org-wide (null) selection and a real brand id do not share a draft', () => {
    const storage = new FakeStorage()
    saveDraft(null, 0, { headline: 'Org-wide headline' }, storage)
    expect(loadDraft(5, storage)).toBeNull()
    expect(loadDraft(null, storage)?.form.headline).toBe('Org-wide headline')
  })

  it('clearing one brand leaves a different brand\'s draft untouched', () => {
    const storage = new FakeStorage()
    saveDraft(1, 0, { headline: 'A' }, storage)
    saveDraft(2, 0, { headline: 'B' }, storage)
    clearDraft(1, storage)
    expect(loadDraft(1, storage)).toBeNull()
    expect(loadDraft(2, storage)?.form.headline).toBe('B')
  })

  it('round-trips step and form for a single brand', () => {
    const storage = new FakeStorage()
    saveDraft(9, 1, { template_key: 'ruled_page', headline: 'Hi', subtext: 'There' }, storage)
    expect(loadDraft(9, storage)).toEqual({
      step: 1,
      form: { template_key: 'ruled_page', headline: 'Hi', subtext: 'There' },
    })
  })

  it('loading a brand with no saved draft returns null rather than another brand\'s data', () => {
    const storage = new FakeStorage()
    saveDraft(1, 1, { headline: 'A' }, storage)
    expect(loadDraft(999, storage)).toBeNull()
  })
})

describe('buildPayload', () => {
  const meta = (over: Partial<SectionMeta>): SectionMeta => ({
    key: 'services', label: 'Treatments', sourceLabel: 'Your Services screen',
    available: true, count: 3, ...over,
  })

  const base = {
    templateKey: 'ruled_page',
    slug: 'glamour-salon',
    headline: 'The Art of Wellness',
    subtext: 'Quiet luxury',
    brandColor: '#1f5fa8',
    fontPairing: 'modern' as FontPairingKey,
  }

  it('assembles the exact wire shape the endpoint expects', () => {
    const payload = buildPayload({
      ...base,
      sections: [meta({ key: 'hero', label: 'Opening', available: true, count: 1 })],
      sectionChoices: {},
    })

    expect(payload).toEqual({
      template_key: 'ruled_page',
      slug: 'glamour-salon',
      copy: { headline: 'The Art of Wellness', subtext: 'Quiet luxury' },
      theme: { brand_color: '#1f5fa8', font_pairing: 'modern' },
      sections: [{ key: 'hero', enabled: true }],
    })
  })

  it('defaults an offerable section the tenant never toggled to enabled', () => {
    const payload = buildPayload({
      ...base,
      sections: [meta({ key: 'hero', available: true, count: 1 })],
      sectionChoices: {},
    })
    expect(payload.sections).toEqual([{ key: 'hero', enabled: true }])
  })

  it('respects an explicit false from the tenant on an offerable section', () => {
    const payload = buildPayload({
      ...base,
      sections: [meta({ key: 'hero', available: true, count: 1 })],
      sectionChoices: { hero: false },
    })
    expect(payload.sections).toEqual([{ key: 'hero', enabled: false }])
  })

  /**
   * The one rule this function exists to enforce (RULING 4's isOfferable,
   * carried through to the request body): an empty data-backed section is
   * NEVER sent as enabled, even if a stale draft says otherwise — the
   * wizard rendered its toggle disabled-and-off, so the request must match
   * what the tenant was actually shown, not a leftover choice from before
   * the section went empty.
   */
  it('forces an unofferable data-backed section to enabled:false regardless of sectionChoices', () => {
    const payload = buildPayload({
      ...base,
      sections: [meta({ key: 'reviews', available: false, count: 0 })],
      sectionChoices: { reviews: true },
    })
    expect(payload.sections).toEqual([{ key: 'reviews', enabled: false }])
  })

  it('a copy-backed section with zero count is still offerable (RULING 4)', () => {
    const payload = buildPayload({
      ...base,
      sections: [meta({ key: 'about', available: false, count: 0 })],
      sectionChoices: {},
    })
    expect(payload.sections).toEqual([{ key: 'about', enabled: true }])
  })

  it('preserves section order and covers every section handed to it', () => {
    const payload = buildPayload({
      ...base,
      sections: [
        meta({ key: 'hero', available: true, count: 1 }),
        meta({ key: 'services', available: false, count: 0 }),
        meta({ key: 'contact', available: true, count: 1 }),
      ],
      sectionChoices: { services: true },
    })
    expect(payload.sections.map(s => s.key)).toEqual(['hero', 'services', 'contact'])
    expect(payload.sections.find(s => s.key === 'services')).toEqual({ key: 'services', enabled: false })
  })
})
