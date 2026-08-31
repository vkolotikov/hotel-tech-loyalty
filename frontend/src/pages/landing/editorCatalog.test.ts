import { describe, expect, it } from 'vitest'
import {
  catalogPayload, industryHasChanged, resolveTemplateKey, showTemplatePicker, templateCards,
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
