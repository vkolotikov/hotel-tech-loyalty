import { describe, expect, it } from 'vitest'
import {
  catalogPayload, industryHasChanged, resolveTemplateKey, showTemplatePicker, templateCards,
  templateImageDefaults, templatePhotoBlocks,
  templateFixedBlocks, templateRenders, templateSupports, templatesDrawing,
  type TemplateOption,
} from './editorCatalog'
import type { IndustryOption } from './industryChoices'

/**
 * The editor's industry + template controls, proven where this repo's vitest
 * can actually reach them.
 *
 * `vitest.config.ts` is node-env and pure-function-only — no jsdom, no React
 * Testing Library — so nothing here renders a card, a warning or a picker.
 * What IS provable, and what these tests hold, is everything the component
 * would otherwise have to get right inline: that the template picker hides
 * itself while there is nothing to choose between, that a selection can
 * never be a value the server did not offer, that the industry warning
 * appears exactly when the tenant has moved off their own industry, and that
 * a save carries these two keys only when they genuinely changed.
 *
 * What is NOT covered here, and is walkthrough-only: the rendering itself —
 * that the cards appear in the Design panel above the palette cards, that
 * clicking one flips the Save button to "Unsaved changes", and that the
 * right-hand preview redraws in the new industry's vocabulary after a save.
 */

const ONE_TEMPLATE: TemplateOption[] = [
  { key: 'ruled_page', name: 'The Ruled Page', blurb: 'Calm and uncluttered.' },
]

/** Today's registry plus the second row `LandingOnboardingService::TEMPLATES`
 *  is designed to gain — the whole point of these functions is that its
 *  arrival is a data change, so it has to be testable before it exists. */
const TWO_TEMPLATES: TemplateOption[] = [
  ...ONE_TEMPLATE,
  { key: 'wide_gallery', name: 'The Wide Gallery', blurb: 'Photographs first.' },
]

/** Shape mirrors the wire (`LandingOnboardingService::industries()`); only
 *  `id` matters to anything in this module. */
const industry = (id: string): IndustryOption => ({
  id,
  services_label: 'Services',
  people_label: 'Team',
  primary_cta: 'Get in touch',
  accent: '#123456',
  palette: 'porcelain',
  sections: ['hero', 'services', 'about', 'team', 'reviews', 'contact'],
})

const INDUSTRIES = [industry('beauty'), industry('education')]

describe('showTemplatePicker', () => {
  it('stays hidden while there is exactly one template', () => {
    expect(showTemplatePicker(ONE_TEMPLATE)).toBe(false)
  })

  it('stays hidden when the response carried none at all', () => {
    expect(showTemplatePicker([])).toBe(false)
  })

  it('appears the moment a second template ships, with no UI change', () => {
    expect(showTemplatePicker(TWO_TEMPLATES)).toBe(true)
  })
})

describe('resolveTemplateKey', () => {
  it('prefers what the tenant has unsaved over what is stored', () => {
    expect(resolveTemplateKey(TWO_TEMPLATES, 'wide_gallery', 'ruled_page')).toBe('wide_gallery')
  })

  it('falls back to the stored key when nothing is unsaved', () => {
    expect(resolveTemplateKey(TWO_TEMPLATES, undefined, 'ruled_page')).toBe('ruled_page')
  })

  it('ignores an unsaved key the server no longer offers', () => {
    expect(resolveTemplateKey(ONE_TEMPLATE, 'wide_gallery', 'ruled_page')).toBe('ruled_page')
  })

  it('resolves to nothing when neither value is offered', () => {
    // The older-backend case (no `templates` on the response at all) — the
    // picker is already hidden for it, and this makes sure the panel cannot
    // draw a selected card that is not on screen either.
    expect(resolveTemplateKey([], 'ruled_page', 'ruled_page')).toBe('')
  })
})

describe('templateCards', () => {
  it('keeps the server order and marks exactly one card selected', () => {
    const cards = templateCards(TWO_TEMPLATES, 'wide_gallery')

    expect(cards.map(c => c.key)).toEqual(['ruled_page', 'wide_gallery'])
    expect(cards.filter(c => c.selected).map(c => c.key)).toEqual(['wide_gallery'])
  })

  it('carries the server-written name and blurb through untranslated', () => {
    // These describe the page a tenant is choosing and are authored once, in
    // English, beside the views they describe — the same rule the industry
    // vocabulary and the section labels already cross this wire under.
    const [card] = templateCards(ONE_TEMPLATE, 'ruled_page')

    expect(card.name).toBe('The Ruled Page')
    expect(card.blurb).toBe('Calm and uncluttered.')
  })

  it('marks nothing selected when the selection is not on the list', () => {
    expect(templateCards(ONE_TEMPLATE, '').some(c => c.selected)).toBe(false)
  })
})

describe('industryHasChanged', () => {
  it('is quiet on arrival, when the panel is sitting on the saved industry', () => {
    expect(industryHasChanged('beauty', 'beauty')).toBe(false)
  })

  it('warns once the tenant has actually moved off their own industry', () => {
    expect(industryHasChanged('education', 'beauty')).toBe(true)
  })

  it('says nothing when there is no saved industry to have moved off', () => {
    expect(industryHasChanged('education', undefined)).toBe(false)
    expect(industryHasChanged('education', '')).toBe(false)
  })

  it('says nothing when nothing is selected', () => {
    expect(industryHasChanged(undefined, 'beauty')).toBe(false)
    expect(industryHasChanged('', 'beauty')).toBe(false)
  })
})

describe('catalogPayload', () => {
  const base = {
    industries: INDUSTRIES,
    templates: TWO_TEMPLATES,
    industry: 'beauty',
    templateKey: 'ruled_page',
    savedIndustry: 'beauty',
    savedTemplateKey: 'ruled_page',
  }

  it('sends neither key on an ordinary save that changed neither', () => {
    // The overwhelmingly common save: a headline edit. `industry` moves the
    // ORGANISATION and fires a resync sweep across every landing page under
    // it — not something a save should ask for when nothing was chosen.
    expect(catalogPayload(base)).toEqual({})
  })

  it('sends the industry the tenant moved to', () => {
    expect(catalogPayload({ ...base, industry: 'education' })).toEqual({ industry: 'education' })
  })

  it('sends the template the tenant moved to', () => {
    expect(catalogPayload({ ...base, templateKey: 'wide_gallery' }))
      .toEqual({ template_key: 'wide_gallery' })
  })

  it('sends both when both moved', () => {
    expect(catalogPayload({ ...base, industry: 'education', templateKey: 'wide_gallery' }))
      .toEqual({ industry: 'education', template_key: 'wide_gallery' })
  })

  it('drops an industry the server never offered', () => {
    // A hand-edited request, or a build running ahead of its backend. The
    // endpoint would 422 on it; not sending it is what keeps the tenant's
    // headline edit saving anyway.
    expect(catalogPayload({ ...base, industry: 'lunar_mining' })).toEqual({})
  })

  it('drops a template key the server never offered', () => {
    expect(catalogPayload({ ...base, templates: ONE_TEMPLATE, templateKey: 'wide_gallery' }))
      .toEqual({})
  })

  it('sends nothing at all when the response carried no catalogues', () => {
    // The older-backend case: both pickers are hidden, so neither value can
    // have been chosen here, and neither is asserted over the wire.
    expect(catalogPayload({
      ...base, industries: [], templates: [], industry: 'education', templateKey: 'wide_gallery',
    })).toEqual({})
  })

  it('treats an empty or missing form value as nothing to send', () => {
    expect(catalogPayload({ ...base, industry: '', templateKey: undefined })).toEqual({})
  })

  it('sends the industry again if the save it belonged to never landed', () => {
    // `savedIndustry` is read from the QUERY's page, never from the form, so
    // a failed save leaves the choice still differing from what is stored —
    // and the next Save press carries it again rather than silently dropping
    // a change the tenant can still see selected on screen.
    expect(catalogPayload({ ...base, industry: 'education', savedIndustry: 'beauty' }))
      .toEqual({ industry: 'education' })
  })
})

/**
 * Template fidelity 1.1/1.2 — the two capability facts, and the DIRECTIONS
 * their absences resolve in.
 *
 * The failure these prevent is the one Phase 1 exists to end: a control that
 * cannot act, rendered anyway. `nocturne_ritual` reads neither
 * `theme.palette` nor `theme.font_pairing` nor any section tone, and the
 * editor — having no way to know — drew six palette cards, four type cards
 * and three swatches per section card over a page that ignores all of them.
 */
describe('templateSupports', () => {
  const GATED: TemplateOption[] = [
    { key: 'ruled_page', name: 'The Ruled Page', blurb: '', supports: { palette: true, font_pairing: true, tones: true, brand_color: true } },
    { key: 'nocturne_ritual', name: 'Nocturne Ritual', blurb: '', supports: { palette: false, font_pairing: false, tones: false, brand_color: true } },
  ]

  it('reads the served map for the selected template', () => {
    expect(templateSupports(GATED, 'ruled_page'))
      .toEqual({ palette: true, font_pairing: true, tones: true, brand_color: true })
    expect(templateSupports(GATED, 'nocturne_ritual'))
      .toEqual({ palette: false, font_pairing: false, tones: false, brand_color: true })
  })

  /**
   * A RESPONSE THAT NEVER ANSWERED IS NOT A REFUSAL. An older backend
   * publishes no `supports` at all, and hiding four controls a tenant has
   * been using on the strength of a key that was never sent would be a
   * regression dressed as a gate.
   */
  it('assumes everything when the response carries no supports at all', () => {
    expect(templateSupports(TWO_TEMPLATES, 'ruled_page'))
      .toEqual({ palette: true, font_pairing: true, tones: true, brand_color: true })
  })

  it('assumes everything for a key the response does not list', () => {
    expect(templateSupports(GATED, 'wide_gallery').palette).toBe(true)
    expect(templateSupports([], 'ruled_page').tones).toBe(true)
  })

  /**
   * A MAP THAT IS PRESENT BUT INCOMPLETE takes the opposite direction, and
   * the same one the server takes: the row answered, and it did not answer
   * yes. Anything other than a literal `true` is a no.
   */
  it('reads a key missing from a present map as false', () => {
    const partial: TemplateOption[] = [
      { key: 'k', name: 'K', blurb: '', supports: { palette: true } as Record<string, boolean> },
    ]
    expect(templateSupports(partial, 'k'))
      .toEqual({ palette: true, font_pairing: false, tones: false, brand_color: false })
  })

  it('reads an explicit null map as an unanswered response, not as four noes', () => {
    const nulled: TemplateOption[] = [{ key: 'k', name: 'K', blurb: '', supports: null }]
    expect(templateSupports(nulled, 'k').palette).toBe(true)
  })
})

describe('templateRenders', () => {
  const WITH_RENDERS: TemplateOption[] = [
    { key: 'ruled_page', name: 'The Ruled Page', blurb: '', renders: ['hero', 'text', 'contact'] },
    { key: 'nocturne_ritual', name: 'Nocturne Ritual', blurb: '', renders: ['hero', 'announcement', 'trust', 'faq'] },
  ]

  it('carries the served list through', () => {
    expect(templateRenders(WITH_RENDERS, 'nocturne_ritual')).toEqual(['hero', 'announcement', 'trust', 'faq'])
  })

  /**
   * NULL IS NOT "NONE". A caller gating a block on this must leave the block
   * alone when the response did not say — hiding every section because an
   * older backend published no list would empty the whole builder.
   */
  it('answers null, never an empty list, when the response does not say', () => {
    expect(templateRenders(TWO_TEMPLATES, 'ruled_page')).toBeNull()
    expect(templateRenders(WITH_RENDERS, 'wide_gallery')).toBeNull()
  })

  it('drops a non-string entry rather than handing one on', () => {
    const hostile: TemplateOption[] = [
      { key: 'k', name: 'K', blurb: '', renders: ['hero', 7 as unknown as string, 'about'] },
    ]
    expect(templateRenders(hostile, 'k')).toEqual(['hero', 'about'])
  })
})

describe('templateFixedBlocks', () => {
  const WITH_FIXED: TemplateOption[] = [
    { key: 'ruled_page', name: 'The Ruled Page', blurb: '', fixed_blocks: {} },
    {
      key: 'nocturne_ritual',
      name: 'Nocturne Ritual',
      blurb: '',
      fixed_blocks: { announcement: 'top', trust: 'fixed', faq: 'fixed', contact: 'footer', footer: 'footer' },
    },
  ]

  it('carries the served map through', () => {
    expect(templateFixedBlocks(WITH_FIXED, 'nocturne_ritual').contact).toBe('footer')
    expect(templateFixedBlocks(WITH_FIXED, 'nocturne_ritual').announcement).toBe('top')
  })

  /**
   * UNLIKE `templateRenders`, THE TWO EMPTY CASES ARE ONE ANSWER HERE, and
   * that difference is deliberate. "This design pins nothing" (ruled_page,
   * whose layout has no `$furniture` at all) and "this build was not told"
   * (an older backend) both end in the editor suppressing no controls —
   * which is the behaviour that build already had. `renders` needs the
   * distinction because its two answers differ; this one does not.
   */
  it('reads an absent map and an empty one the same way — nothing is pinned', () => {
    expect(templateFixedBlocks(WITH_FIXED, 'ruled_page')).toEqual({})
    expect(templateFixedBlocks(TWO_TEMPLATES, 'ruled_page')).toEqual({})
    expect(templateFixedBlocks(WITH_FIXED, 'nobody')).toEqual({})
  })

  it('drops a non-string placement rather than handing one on', () => {
    const hostile: TemplateOption[] = [
      { key: 'k', name: 'K', blurb: '', fixed_blocks: { a: 'top', b: 7 as unknown as string, c: '' } },
    ]
    expect(templateFixedBlocks(hostile, 'k')).toEqual({ a: 'top' })
  })
})

/**
 * TEMPLATE FIDELITY 4.5 — which blocks a design draws a PHOTOGRAPH in, which
 * is narrower than which blocks it draws at all.
 *
 * A photo slot belongs to a TYPE and is shared by every design; a drawn
 * photograph belongs to a PARTIAL and is not. `services` carries a
 * band-level plate for the second kit and neither shipped design has one, so
 * its control must be offered nowhere yet.
 */
describe('templatePhotoBlocks', () => {
  const WITH_PHOTOS: TemplateOption[] = [
    { key: 'ruled_page', name: 'The Ruled Page', blurb: '', photo_blocks: ['hero', 'about', 'text', 'gallery'] },
    { key: 'nocturne_ritual', name: 'Nocturne Ritual', blurb: '', photo_blocks: ['hero', 'about', 'team', 'booking'] },
  ]

  it('carries the served list through', () => {
    expect(templatePhotoBlocks(WITH_PHOTOS, 'nocturne_ritual')).toEqual(['hero', 'about', 'team', 'booking'])
    expect(templatePhotoBlocks(WITH_PHOTOS, 'ruled_page')).not.toContain('team')
  })

  /**
   * Null is NOT "none", exactly as for `renders`: an older backend has not
   * declined anything, and hiding every photo control on the strength of a
   * key it never sent would be worse than the state that build shipped.
   */
  it('answers null when the response does not say, and for an unknown key', () => {
    expect(templatePhotoBlocks(TWO_TEMPLATES, 'ruled_page')).toBeNull()
    expect(templatePhotoBlocks(WITH_PHOTOS, 'nobody')).toBeNull()
  })

  it('drops a non-string entry rather than handing one on', () => {
    const hostile: TemplateOption[] = [
      { key: 'k', name: 'K', blurb: '', photo_blocks: ['hero', 7 as unknown as string] },
    ]
    expect(templatePhotoBlocks(hostile, 'k')).toEqual(['hero'])
  })
})

/**
 * TEMPLATE FIDELITY 4.1 — the design's own photographs, slot => URL. This is
 * what turns "Remove photo" into "Restore original" and what lets a control
 * say whose picture it is showing.
 */
describe('templateImageDefaults', () => {
  const WITH_DEFAULTS: TemplateOption[] = [
    { key: 'ruled_page', name: 'The Ruled Page', blurb: '', image_defaults: {} },
    {
      key: 'nocturne_ritual',
      name: 'Nocturne Ritual',
      blurb: '',
      image_defaults: { hero: '/landing/n/assets/hero.webp', 'gallery_1.image_2': '/landing/n/assets/two.webp' },
    },
  ]

  it('carries the served map through, keyed by the endpoints own slot spelling', () => {
    const map = templateImageDefaults(WITH_DEFAULTS, 'nocturne_ritual')

    expect(map.hero).toBe('/landing/n/assets/hero.webp')
    expect(map['gallery_1.image_2']).toBe('/landing/n/assets/two.webp')
  })

  /** Both empty cases are one answer, the same collapse `templateFixedBlocks`
   *  makes: "this design has none" and "this build was not told" both end in
   *  every control saying "Remove photo" and meaning it. */
  it('reads an absent map and an empty one the same way', () => {
    expect(templateImageDefaults(WITH_DEFAULTS, 'ruled_page')).toEqual({})
    expect(templateImageDefaults(TWO_TEMPLATES, 'ruled_page')).toEqual({})
    expect(templateImageDefaults(WITH_DEFAULTS, 'nobody')).toEqual({})
  })

  it('drops a non-string or empty url rather than handing one on', () => {
    const hostile: TemplateOption[] = [
      { key: 'k', name: 'K', blurb: '', image_defaults: { a: '/ok.webp', b: 7 as unknown as string, c: '' } },
    ]
    expect(templateImageDefaults(hostile, 'k')).toEqual({ a: '/ok.webp' })
  })
})

describe('templatesDrawing', () => {
  const THREE: TemplateOption[] = [
    { key: 'ruled_page', name: 'The Ruled Page', blurb: '', renders: ['hero', 'text', 'contact'] },
    { key: 'nocturne_ritual', name: 'Nocturne Ritual', blurb: '', renders: ['hero', 'trust'] },
    { key: 'wide_gallery', name: 'The Wide Gallery', blurb: '', renders: ['hero', 'text'] },
  ]

  /**
   * The way out named on a row this design will not draw. Off the served
   * `renders` for every row, so a third template appears in that sentence
   * with no edit on this side of the wire.
   */
  it('names the other designs that would draw the block', () => {
    expect(templatesDrawing(THREE, 'text', 'nocturne_ritual').map(o => o.name))
      .toEqual(['The Ruled Page', 'The Wide Gallery'])
  })

  it('never names the design the tenant is already on', () => {
    expect(templatesDrawing(THREE, 'hero', 'ruled_page').map(o => o.key))
      .toEqual(['nocturne_ritual', 'wide_gallery'])
  })

  it('is empty when nothing else draws it, so the sentence can say so', () => {
    expect(templatesDrawing(THREE, 'faq', 'nocturne_ritual')).toEqual([])
  })

  // A template that has not claimed it draws anything is not a way out:
  // sending somebody there could drop the block too.
  it('does not name a template that published no renders list', () => {
    expect(templatesDrawing(TWO_TEMPLATES, 'hero', 'ruled_page')).toEqual([])
  })
})
