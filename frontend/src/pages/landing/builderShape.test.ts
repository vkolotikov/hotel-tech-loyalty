import { describe, expect, it } from 'vitest'
import {
  BUILDER_TABS, SECTION_FILTERS, blockPlacement, expandedWithin, filterCounts, nextExpanded,
  reorderableUnderFilter, resolveBuilderTab, rowCanMove, rowGroup, rowHasPhotos, rowStatus,
  sectionThumbUrl, templateDrawsBlock, visibleRows,
  type ShapedRow,
} from './builderShape'

/**
 * TEMPLATE FIDELITY PHASE 2 — the builder's shape, proven where it lives.
 *
 * Every rule here is a function rather than a condition inside
 * `LandingEditor.tsx` precisely so that this file can exist: `vitest.config
 * .ts` is node-env with no jsdom and no React Testing Library, so a decision
 * made in JSX is a decision no test in this repository can reach. The
 * component's own rendering still needs a browser (and the phase report says
 * so); everything below does not.
 */

const row = (overrides: Partial<ShapedRow> = {}): ShapedRow => ({
  key: 'hero',
  typeId: 'hero',
  fields: [{ name: 'headline' }],
  enabled: true,
  available: true,
  count: 0,
  fixed: true,
  writtenBy: 'words',
  sourceLabel: 'Your business name',
  ...overrides,
})

// ─── 2.1 ────────────────────────────────────────────────────────────────

describe('resolveBuilderTab', () => {
  it('opens on Content, which is the tab every tenant comes back for', () => {
    expect(resolveBuilderTab(null)).toBe('content')
    expect(resolveBuilderTab(undefined)).toBe('content')
    expect(resolveBuilderTab('')).toBe('content')
  })

  it('honours a tab named in the URL, so reload and the back button work', () => {
    expect(resolveBuilderTab('design')).toBe('design')
    expect(resolveBuilderTab('publish')).toBe('publish')
  })

  // The value is whatever somebody typed, pasted, or bookmarked off a build
  // that had a fourth tab. A blank left-hand column is not an option.
  it('lands an unknown value on the default rather than on nothing', () => {
    expect(resolveBuilderTab('seo')).toBe('content')
    expect(resolveBuilderTab('__proto__')).toBe('content')
  })

  it('offers exactly three tabs, and Content is one of them', () => {
    expect(BUILDER_TABS).toEqual(['content', 'design', 'publish'])
  })
})

// ─── 2.2 ────────────────────────────────────────────────────────────────

describe('nextExpanded', () => {
  it('opens a closed card', () => {
    expect(nextExpanded(null, 'about')).toBe('about')
  })

  // Single-expand: the card being edited and the preview beside it must
  // have one subject between them.
  it('closes whatever was open when another card is opened', () => {
    expect(nextExpanded('hero', 'about')).toBe('about')
  })

  it('closes the open card when its own header is pressed again', () => {
    expect(nextExpanded('about', 'about')).toBeNull()
  })
})

describe('expandedWithin', () => {
  it('keeps the open card while it is on screen', () => {
    expect(expandedWithin('about', ['hero', 'about'])).toBe('about')
  })

  // A filter, a removal or a template change can all take the open row out
  // of the rendered list; a key pointing at a row nobody can see is a card
  // that springs back open over a subject the tenant left.
  it('forgets a card that has left the list', () => {
    expect(expandedWithin('about', ['hero'])).toBeNull()
    expect(expandedWithin(null, ['hero'])).toBeNull()
  })
})

// ─── 2.3 ────────────────────────────────────────────────────────────────

describe('rowHasPhotos', () => {
  it('counts both photo controls — the single plate and the gallery strip', () => {
    expect(rowHasPhotos(row({ fields: [{ name: 'image_url', type: 'image' }] }))).toBe(true)
    expect(rowHasPhotos(row({ fields: [{ name: 'gallery', type: 'gallery', slots: 8 }] }))).toBe(true)
  })

  it('is false for a band with only words in it', () => {
    expect(rowHasPhotos(row({ fields: [{ name: 'heading' }, { name: 'body', multiline: true }] }))).toBe(false)
  })

  /**
   * Asked of the FIELDS, never of the key — which is the whole reason the
   * three photo slots Phase 4 adds to `services`, `team` and `booking` join
   * the Photos chip with no edit on this side of the wire.
   */
  it('follows the served field list, so a new photo slot needs no edit here', () => {
    const servicesToday = row({ key: 'services', typeId: 'services', fields: [{ name: 'heading' }] })
    const servicesAfterPhase4 = row({
      key: 'services',
      typeId: 'services',
      fields: [{ name: 'image_url', type: 'image' }, { name: 'heading' }],
    })

    expect(rowHasPhotos(servicesToday)).toBe(false)
    expect(rowHasPhotos(servicesAfterPhase4)).toBe(true)
  })
})

describe('the filter chips', () => {
  const hero = row({ key: 'hero', typeId: 'hero', fields: [{ name: 'image_url', type: 'image' }, { name: 'headline' }] })
  const services = row({ key: 'services', typeId: 'services', fields: [{ name: 'heading' }] })
  const gallery = row({ key: 'gallery_1', typeId: 'gallery', fixed: false, writtenBy: 'photos', fields: [{ name: 'gallery', type: 'gallery', slots: 8 }] })
  const text = row({ key: 'text_1', typeId: 'text', fixed: false, writtenBy: 'words', fields: [{ name: 'body', multiline: true }] })
  const rows = [hero, services, gallery, text]

  it('shows everything under All', () => {
    expect(visibleRows(rows, 'all')).toEqual(rows)
  })

  /**
   * THE PHOTOS CHIP IS WIDER THAN THE PHOTOS BADGE, and that is the point:
   * a hero is a words-led band with a photograph in it, and "all the
   * pictures on my page" has to include that picture. The badge answers a
   * different question and answers it once.
   */
  it('gathers every picture on the page under Photos, badge or no badge', () => {
    expect(visibleRows(rows, 'photos')).toEqual([hero, gallery])
    expect(rowGroup(hero)).toBe('write')
    expect(rowGroup(gallery)).toBe('photos')
  })

  it('leaves the workspace rows out of Words and the written rows out of workspace', () => {
    expect(visibleRows(rows, 'write')).toEqual([hero, text])
    expect(visibleRows(rows, 'workspace')).toEqual([services])
  })

  // Never re-sorted. The list's vertical order IS the page's vertical
  // order; a chip subtracts and has no opinion about sequence.
  it('keeps page order', () => {
    const reordered = [text, gallery, hero, services]
    expect(visibleRows(reordered, 'photos')).toEqual([gallery, hero])
  })

  it('counts each chip so a chip that would show nothing can say zero', () => {
    expect(filterCounts(rows)).toEqual({ all: 4, write: 2, photos: 2, workspace: 1 })
    expect(filterCounts([])).toEqual({ all: 0, write: 0, photos: 0, workspace: 0 })
  })

  /**
   * Dragging row 3 above row 1 in a list with rows 2, 4 and 5 hidden is an
   * operation with no honest meaning — the tenant would be moving a band
   * past bands they cannot see. So the affordances go, together, and the
   * list says why.
   */
  it('offers reordering only over the whole list', () => {
    expect(reorderableUnderFilter('all')).toBe(true)
    for (const filter of SECTION_FILTERS.filter(f => f !== 'all')) {
      expect(reorderableUnderFilter(filter)).toBe(false)
    }
  })
})

// ─── 2.4 ────────────────────────────────────────────────────────────────

describe('sectionThumbUrl', () => {
  it('addresses one wireframe per template and type, on the app’s own origin', () => {
    expect(sectionThumbUrl('nocturne_ritual', 'hero')).toBe('/landing/thumbs/nocturne_ritual/hero.svg')
    expect(sectionThumbUrl('ruled_page', 'gallery')).toBe('/landing/thumbs/ruled_page/gallery.svg')
  })

  // Both halves arrive off the wire and this string becomes a URL.
  it('refuses anything that is not a plain catalogue key', () => {
    expect(sectionThumbUrl('', 'hero')).toBeNull()
    expect(sectionThumbUrl('nocturne_ritual', '')).toBeNull()
    expect(sectionThumbUrl('../../etc', 'hero')).toBeNull()
    expect(sectionThumbUrl('nocturne_ritual', '../secret')).toBeNull()
    expect(sectionThumbUrl('Nocturne', 'hero')).toBeNull()
  })

  // A missing file is not an error and needs no manifest here: the `<img>`
  // falls back to a generic wireframe, which doubles as the honest signal
  // for "this design does not draw this block".
  it('answers for a type the template has no file for — the fallback is the img’s job', () => {
    expect(sectionThumbUrl('nocturne_ritual', 'text')).toBe('/landing/thumbs/nocturne_ritual/text.svg')
  })
})

// ─── 2.6 ────────────────────────────────────────────────────────────────

const NOCTURNE_FIXED = {
  announcement: 'top', trust: 'fixed', faq: 'fixed', contact: 'footer', footer: 'footer',
}

// nocturne ships eleven partials; `contact` and `text` are not among them.
const NOCTURNE_RENDERS = [
  'hero', 'services', 'about', 'team', 'reviews', 'booking', 'footer', 'gallery', 'announcement', 'trust', 'faq',
]

describe('blockPlacement', () => {
  it('names where a design pins a block', () => {
    expect(blockPlacement(NOCTURNE_FIXED, 'contact')).toBe('footer')
    expect(blockPlacement(NOCTURNE_FIXED, 'announcement')).toBe('top')
    expect(blockPlacement(NOCTURNE_FIXED, 'trust')).toBe('fixed')
  })

  it('is null for a block the design leaves in the tenant’s own order', () => {
    expect(blockPlacement(NOCTURNE_FIXED, 'hero')).toBeNull()
    expect(blockPlacement({}, 'contact')).toBeNull()
  })

  // A placement the editor has no sentence for would reach a tenant as a
  // blank line where an explanation should be.
  it('drops a placement this build cannot translate', () => {
    expect(blockPlacement({ hero: 'sideways' }, 'hero')).toBeNull()
  })
})

describe('rowCanMove', () => {
  /**
   * The help sentence over the list promises "sections appear on your page
   * from top to bottom" with no exception, and five rows on the shipped kit
   * carried a drag handle and two arrows that moved nothing.
   */
  it('withdraws the move controls from a block the design pins', () => {
    expect(rowCanMove(NOCTURNE_FIXED, { key: 'contact' })).toBe(false)
    expect(rowCanMove(NOCTURNE_FIXED, { key: 'footer' })).toBe(false)
    expect(rowCanMove(NOCTURNE_FIXED, { key: 'hero' })).toBe(true)
  })

  it('leaves every row movable on a design that pins nothing', () => {
    for (const key of ['hero', 'contact', 'footer', 'announcement']) {
      expect(rowCanMove({}, { key })).toBe(true)
    }
  })
})

describe('templateDrawsBlock', () => {
  it('says no for a block this design ships no partial for', () => {
    expect(templateDrawsBlock(NOCTURNE_RENDERS, NOCTURNE_FIXED, { key: 'text_1', typeId: 'text' })).toBe(false)
  })

  /**
   * THE PINNED CASE IS THE ONE THAT MATTERS. This kit prints the tenant's
   * contact details inside its footer hub, so it ships no
   * `contact.blade.php` and `renders` does not list it — and "this design
   * does not show this block" would be a plain lie about a phone number
   * that is on the page.
   */
  it('says yes for a pinned block even when it has no partial of its own', () => {
    expect(NOCTURNE_RENDERS).not.toContain('contact')
    expect(templateDrawsBlock(NOCTURNE_RENDERS, NOCTURNE_FIXED, { key: 'contact', typeId: 'contact' })).toBe(true)
  })

  it('asks about the TYPE, so every gallery instance gets one answer', () => {
    expect(templateDrawsBlock(NOCTURNE_RENDERS, NOCTURNE_FIXED, { key: 'gallery_4', typeId: 'gallery' })).toBe(true)
  })

  // An older backend has not declined anything; hiding a row's controls on
  // a build that was never asked is worse than the dead control this fact
  // exists to remove.
  it('assumes yes when the response does not say', () => {
    expect(templateDrawsBlock(null, {}, { key: 'text_1', typeId: 'text' })).toBe(true)
  })
})

// ─── the one line a collapsed card says ─────────────────────────────────

describe('rowStatus', () => {
  const opts = { drawn: true, offerable: true, dataBacked: false }

  it('leads with the design not drawing the band at all', () => {
    expect(rowStatus(row({ enabled: false }), { ...opts, drawn: false })).toEqual({ kind: 'not_drawn' })
  })

  it('then with a band that cannot be switched on', () => {
    expect(rowStatus(row({ enabled: false }), { ...opts, offerable: false })).toEqual({ kind: 'unavailable' })
  })

  // The single most common "why is it not on my page" question there is.
  it('then with the tenant’s own switch', () => {
    expect(rowStatus(row({ enabled: false }), opts)).toEqual({ kind: 'hidden' })
  })

  /**
   * `PageContent::count()` refuses to publish a headed band over blank
   * space, and this row is the only place a tenant ever finds that out.
   * Which sentence applies is `writtenBy` — telling somebody with an empty
   * gallery to "write some words" would send them the wrong way.
   */
  it('tells an unwritten band what it is waiting for, in its own terms', () => {
    expect(rowStatus(row({ fixed: false, available: false, writtenBy: 'words' }), opts)).toEqual({ kind: 'needs_words' })
    expect(rowStatus(row({ fixed: false, available: false, writtenBy: 'photos' }), opts)).toEqual({ kind: 'needs_photos' })
  })

  it('counts the rows a data-backed band is made of', () => {
    expect(rowStatus(
      row({ key: 'services', count: 12, sourceLabel: 'your Treatments' }),
      { ...opts, dataBacked: true },
    )).toEqual({ kind: 'counted', count: 12, source: 'your Treatments' })
  })

  // A count is only meaningful for a section backed by rows elsewhere in
  // the product — the same rule the wizard's step 4 applies.
  it('names the source, without a number, for a fixed band that has none', () => {
    expect(rowStatus(row({ sourceLabel: 'Words you write in the editor' }), opts))
      .toEqual({ kind: 'source', source: 'Words you write in the editor' })
  })

  it('says a written band is the tenant’s own', () => {
    expect(rowStatus(row({ fixed: false, available: true, writtenBy: 'words' }), opts)).toEqual({ kind: 'own_words' })
    expect(rowStatus(row({ fixed: false, available: true, writtenBy: 'photos' }), opts)).toEqual({ kind: 'own_photos' })
  })
})
