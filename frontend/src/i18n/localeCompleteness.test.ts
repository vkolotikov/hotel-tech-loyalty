import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Task 5's locale-sweep net.
 *
 * Task 2 shipped `landing_pages.*`, Task 5 adds `reviews.*` plus two new
 * `nav.*` keys (the "Landing pages" group, the "Featured reviews" item) —
 * every one of them has to exist in all FIVE locale JSONs, not just
 * en/common.json. Task 2's own report notes fr/ru were only spot-checked
 * by hand; this is the automated net that round promised instead of a
 * repeat by-hand check every task after it.
 *
 * Pure fs + regex over the source files the round's spec names — no
 * i18next runtime, no rendering, node-env friendly (matches
 * vitest.config.ts's `environment: 'node'`, no jsdom). A literal
 * `t('key...')` call is the unit of truth: whatever key a component
 * actually asks for is exactly what must resolve in every language, not a
 * hand-maintained list that can silently drift from the code reading it.
 *
 * Scope is deliberately the three targets the brief names — the landing
 * pages + reviews screens — not the whole `common.json`. `nav.groups.*`
 * and `nav.items.*` are asked for here as string LITERALS matching
 * `t('...')`; Layout.tsx's own nav renderer calls `t(labelKey, defaultLabel)`
 * with a variable, not a literal, so the two `nav.*` prefixes above will
 * not actually surface a hit from THIS scan — that gap is covered instead
 * by `Layout.landingSidebar.test.tsx`'s SSR render (which proves the group
 * and its label actually appear) and by hand-adding real translations for
 * both new nav keys alongside this sweep.
 */
const SRC_DIR = path.resolve(__dirname, '..')
const LOCALES_DIR = path.join(SRC_DIR, 'i18n/locales')
const LOCALES = ['en', 'de', 'es', 'fr', 'ru'] as const

const SCAN_TARGETS = [
  path.join(SRC_DIR, 'pages/landing'),
  path.join(SRC_DIR, 'pages/LandingPages.tsx'),
  path.join(SRC_DIR, 'pages/Reviews.tsx'),
]

const KEY_PREFIXES = ['landing_pages.', 'reviews.', 'nav.groups.landing_pages', 'nav.items.landing_']

function listSourceFiles(target: string): string[] {
  const stat = fs.statSync(target)
  if (!stat.isDirectory()) return /\.(tsx?|jsx?)$/.test(target) ? [target] : []
  return fs.readdirSync(target).flatMap(entry => listSourceFiles(path.join(target, entry)))
}

// Matches both `t('key')` and `t("key")` — the codebase uses single quotes
// throughout, but nothing about the rule this test enforces depends on
// which quote style a future edit happens to use.
const T_CALL_RE = /\bt\(\s*['"]([a-zA-Z0-9_.]+)['"]/g

function usedKeys(): string[] {
  const found = new Set<string>()
  for (const file of SCAN_TARGETS.flatMap(listSourceFiles)) {
    const source = fs.readFileSync(file, 'utf8')
    let match: RegExpExecArray | null
    while ((match = T_CALL_RE.exec(source))) {
      const key = match[1]
      if (KEY_PREFIXES.some(prefix => key === prefix || key.startsWith(prefix))) found.add(key)
    }
  }
  return [...found].sort()
}

function readAt(json: unknown, dottedKey: string): unknown {
  return dottedKey.split('.').reduce<unknown>((node, part) => {
    if (node == null || typeof node !== 'object' || !(part in (node as object))) return undefined
    return (node as Record<string, unknown>)[part]
  }, json)
}

function readLocale(locale: string): unknown {
  const file = path.join(LOCALES_DIR, locale, 'common.json')
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

describe('locale completeness — landing pages + reviews', () => {
  const keys = usedKeys()

  // A canary against the scan silently finding nothing (a moved file, a
  // renamed prefix) and every locale test below passing vacuously.
  it('actually found the keys this round is known to use', () => {
    expect(keys.length).toBeGreaterThan(30)
    expect(keys).toContain('landing_pages.wizard.business_name_hint')
    expect(keys).toContain('reviews.featured_on')
    expect(keys).toContain('reviews.landing_page')
  })

  for (const locale of LOCALES) {
    it(`every landing_pages./reviews. key used in the scanned screens resolves in ${locale}/common.json`, () => {
      const json = readLocale(locale)
      const missing = keys.filter(key => readAt(json, key) === undefined)
      expect(missing, `${locale}/common.json is missing: ${missing.join(', ') || '(none)'}`).toEqual([])
    })
  }
})

/**
 * Landing phase 3c Task 6, fix round 1: the ten design-panel per-id name
 * keys are named with a template-literal `t()` call —
 * `` t(`landing_pages.design.palette_name_${p.id}`, p.label) `` and
 * `` t(`landing_pages.design.pairing_name_${fp.id}`, fp.label) `` in
 * `DesignPanel.tsx` — so `T_CALL_RE` above never matches them (it requires
 * a literal quote character immediately after `t(`) and `usedKeys()` never
 * finds them, the exact same gap this file's own docblock already
 * documents for `nav.groups.*`/`nav.items.*` (and that `field_${field.name}`
 * in `LandingEditor.tsx`'s `FIELD_FALLBACK` shares silently, with no net of
 * its own at all). Task 6's own report flagged this as a known gap rather
 * than a thing the scan above could be made to close.
 *
 * Hardcoded here as a literal list — never derived from `designChoices.ts`'s
 * own `PALETTE_IDS`/`FONT_PAIRING_IDS` — for the identical reason
 * `designChoices.test.ts` hardcodes its own expected id lists rather than
 * importing them from the module under test: if this list were built FROM
 * the same module whose ids it exists to check translations for, a palette
 * or pairing removed from `designChoices.ts` would silently disappear from
 * the expected-keys list in the same edit, and a translation actually
 * missing for a still-real id could never be caught. Read with `readAt`/
 * `readLocale`, the same two helpers the scan-based test above already
 * uses — a missing key and a present-but-blank one are both failures here,
 * since a blank string is not a translation.
 */
describe('locale completeness — design panel palette/pairing names (dynamic t() keys, hand-verified)', () => {
  const DESIGN_PANEL_ID_KEYS = [
    // designChoices.ts's PALETTES, in Palette::all()'s own order.
    'landing_pages.design.palette_name_champagne_noir',
    'landing_pages.design.palette_name_porcelain',
    'landing_pages.design.palette_name_midnight_brass',
    'landing_pages.design.palette_name_clinic_air',
    'landing_pages.design.palette_name_terracotta',
    'landing_pages.design.palette_name_slate_amber',
    // designChoices.ts's FONT_PAIRINGS, in ThemeRules::FONT_PAIRINGS's own order.
    'landing_pages.design.pairing_name_editorial',
    'landing_pages.design.pairing_name_modern',
    'landing_pages.design.pairing_name_classic',
    'landing_pages.design.pairing_name_grand',
  ]

  // A canary against the hardcoded list itself drifting silently short —
  // mirrors the "actually found the keys" canary above, same reasoning.
  it('names exactly ten keys, six palettes and four pairings', () => {
    expect(DESIGN_PANEL_ID_KEYS.length).toBe(10)
  })

  for (const locale of LOCALES) {
    it(`every design-panel palette/pairing name key resolves to a non-empty string in ${locale}/common.json`, () => {
      const json = readLocale(locale)
      const missing = DESIGN_PANEL_ID_KEYS.filter(key => {
        const value = readAt(json, key)
        return typeof value !== 'string' || value.trim() === ''
      })
      expect(
        missing,
        `${locale}/common.json is missing (or has a blank) design key: ${missing.join(', ') || '(none)'}`,
      ).toEqual([])
    })
  }
})

/**
 * Landing phase 3c (the industry step): the wizard's first step names its
 * nine cards with a template-literal `t()` call —
 * `` t(`landing_pages.wizard.industry_name_${card.id}`, card.name) `` in
 * `LandingWizard.tsx` — so `T_CALL_RE` above cannot see them, exactly like
 * the design panel's ten keys just above.
 *
 * Plan A gave these nine keys a SECOND call site, `DesignPanel.tsx`'s own
 * industry picker (the editor's version of the same choice), which reuses
 * this same `landing_pages.wizard.industry_name_*` family rather than
 * opening a `landing_pages.design.industry_name_*` one: one industry, one
 * word for it, wherever a tenant meets it. That is also why the keys are
 * still spelled `wizard.` in a control that is not in the wizard — renaming
 * them would have meant nine keys × five locales moved for a prefix nobody
 * reads. Nothing about this net changes; it covers both screens at once.
 *
 * Same treatment, same reasoning,
 * including WHY the list is hardcoded rather than derived from
 * `industryChoices.ts`'s own `INDUSTRY_NAMES`: a list built from the module
 * it exists to check would lose an id and its expectation in the same edit.
 *
 * These are `Organization::INDUSTRIES` (app/Models/Organization.php) — the
 * nine ids the backend's `LandingOnboardingService::industries()` actually
 * sends, in that constant's own order. A tenth industry added there without
 * a translation added here renders its humanised id (`industryName()`'s
 * fallback) rather than a raw key, so this test is the thing that says "and
 * that is not good enough for a card a customer is asked to choose from".
 */
describe('locale completeness — wizard industry names (dynamic t() keys, hand-verified)', () => {
  const INDUSTRY_NAME_KEYS = [
    'landing_pages.wizard.industry_name_hotel',
    'landing_pages.wizard.industry_name_beauty',
    'landing_pages.wizard.industry_name_medical',
    'landing_pages.wizard.industry_name_restaurant',
    'landing_pages.wizard.industry_name_legal',
    'landing_pages.wizard.industry_name_real_estate',
    'landing_pages.wizard.industry_name_education',
    'landing_pages.wizard.industry_name_fitness',
    'landing_pages.wizard.industry_name_other',
  ]

  // The same canary as the two describes above: nine industries, no fewer.
  it('names exactly nine industries', () => {
    expect(INDUSTRY_NAME_KEYS.length).toBe(9)
  })

  for (const locale of LOCALES) {
    it(`every industry name key resolves to a non-empty string in ${locale}/common.json`, () => {
      const json = readLocale(locale)
      const missing = INDUSTRY_NAME_KEYS.filter(key => {
        const value = readAt(json, key)
        return typeof value !== 'string' || value.trim() === ''
      })
      expect(
        missing,
        `${locale}/common.json is missing (or has a blank) industry key: ${missing.join(', ') || '(none)'}`,
      ).toEqual([])
    })
  }
})

/**
 * The builder round: `LandingEditor.tsx` names a tenant-added band and
 * describes it in the "Add a section" control with two template-literal
 * `t()` calls per section TYPE —
 * `` t(`landing_pages.editor.section_type_name_${row.typeId}`, …) `` and
 * `` t(`landing_pages.editor.section_type_blurb_${type.id}`, …) `` — so
 * `T_CALL_RE` at the top of this file cannot see either family, exactly like
 * the design-panel and industry keys above.
 *
 * The ids are `App\Landing\SectionType::repeatableIds()` — the types the add
 * endpoint accepts, which is to say the only ones that ever reach either
 * call site. Fixed bands are NOT here and must not be: they are named by the
 * wire, in the industry's own vocabulary (a clinic's "Procedures", a salon's
 * "Treatments"), and adding `section_type_name_about` here would be asking
 * for a translation of a string nothing renders.
 *
 * Hardcoded rather than derived, for the third time and the same reason: a
 * list built from the module it exists to check loses an id and its
 * expectation in one edit. The real cost of getting this wrong is visible —
 * the `TYPE_NAME_FALLBACK` miss renders the raw type id `text` as a section
 * heading, and the blurb's fallback is the empty string, so a second
 * repeatable type shipped without translations gets an unlabelled button
 * under a blank explanation.
 */
describe('locale completeness — addable section type names and blurbs (dynamic t() keys, hand-verified)', () => {
  const SECTION_TYPE_KEYS = [
    // SectionType::repeatableIds() — two addable types today.
    'landing_pages.editor.section_type_name_text',
    'landing_pages.editor.section_type_blurb_text',
    'landing_pages.editor.section_type_name_gallery',
    'landing_pages.editor.section_type_blurb_gallery',
  ]

  // The canary the three describes above all carry: a name AND a blurb for
  // every addable type, never one of the pair.
  it('names both a label and a blurb for every addable type', () => {
    expect(SECTION_TYPE_KEYS.length % 2).toBe(0)
    const names = SECTION_TYPE_KEYS.filter(k => k.includes('section_type_name_'))
    const blurbs = SECTION_TYPE_KEYS.filter(k => k.includes('section_type_blurb_'))
    expect(names.length).toBe(blurbs.length)
    expect(names.length).toBeGreaterThan(0)
  })

  for (const locale of LOCALES) {
    it(`every addable section type key resolves to a non-empty string in ${locale}/common.json`, () => {
      const json = readLocale(locale)
      const missing = SECTION_TYPE_KEYS.filter(key => {
        const value = readAt(json, key)
        return typeof value !== 'string' || value.trim() === ''
      })
      expect(
        missing,
        `${locale}/common.json is missing (or has a blank) section type key: ${missing.join(', ') || '(none)'}`,
      ).toEqual([])
    })
  }
})

/**
 * The tone round: `LandingEditor.tsx`'s per-section colour picker names each
 * swatch with a template-literal `t()` call —
 * `` t(`landing_pages.editor.tone_name_${tone.id}`, …) `` — twice over (once
 * on the swatch's own label/title, once on the "you are on this one" caption
 * beside the row), so `T_CALL_RE` at the top of this file cannot see the
 * family at all. Fourth time, same reasoning as the three describes above.
 *
 * The ids are `App\Landing\SectionType::TONES`' keys — the allowlist the
 * save endpoint validates against and the onboarding response publishes as
 * `section_tones`. The list is SERVED, so a tone the backend adds appears in
 * the picker with no release on this side: the only thing missing would be
 * its name, and `TONE_NAME_FALLBACK`'s `?? tone.id` fallback would then
 * render a raw id (`page`, `soft`) as the label of a colour swatch a
 * customer is asked to choose between. That is the failure this net exists
 * to make loud.
 *
 * Hardcoded rather than derived for the fourth time and the same reason: a
 * list built from the module it checks loses an id and its expectation in
 * one edit. `sectionTones.ts` (which owns the swatch recipes) is where the
 * matching client-side list lives, and it is deliberately not imported here.
 */
describe('locale completeness — section tone names (dynamic t() keys, hand-verified)', () => {
  const TONE_NAME_KEYS = [
    // SectionType::TONES' three ids, in that constant's own order.
    'landing_pages.editor.tone_name_page',
    'landing_pages.editor.tone_name_soft',
    'landing_pages.editor.tone_name_accent',
  ]

  // The same canary the describes above carry: three tones, no fewer.
  it('names exactly the three tones the allowlist ships', () => {
    expect(TONE_NAME_KEYS.length).toBe(3)
  })

  for (const locale of LOCALES) {
    it(`every tone name key resolves to a non-empty string in ${locale}/common.json`, () => {
      const json = readLocale(locale)
      const missing = TONE_NAME_KEYS.filter(key => {
        const value = readAt(json, key)
        return typeof value !== 'string' || value.trim() === ''
      })
      expect(
        missing,
        `${locale}/common.json is missing (or has a blank) tone name key: ${missing.join(', ') || '(none)'}`,
      ).toEqual([])
    })
  }
})

/**
 * The gallery round closes the gap this file's own header has documented
 * since Task 6: `LandingEditor.tsx` labels every content control with a
 * template-literal `t()` call —
 * `` t(`landing_pages.editor.field_${field.name}`, FIELD_FALLBACK[field.name] ?? field.name) ``
 * — so `T_CALL_RE` at the top of this file has never been able to see the
 * family, and unlike the four describes above it had no hand-verified net
 * either. The fallback chain ends at `field.name`, so a missing translation
 * renders the RAW LEAF NAME (`image_url`, `gallery`, `kicker`) as the label
 * above an input a customer is asked to fill in.
 *
 * The names are the union of `SECTION_CONTENT_FIELDS`' curated fixed-row
 * fields and the two synthesised photo controls (`fieldsForType`) — i.e.
 * every control this build actually draws. `contact`'s five label overrides
 * and `booking`'s two are deliberately absent: they are served on the
 * catalogue but `SECTION_CONTENT_FIELDS` does not offer them, so no control
 * renders them and asking for a translation of a string nothing shows would
 * be asking for busywork.
 *
 * Hardcoded rather than derived, for the fifth time and the same reason as
 * the four describes above: a list built from the module it exists to check
 * loses a name and its expectation in the same edit.
 */
describe('locale completeness — content field labels (dynamic t() keys, hand-verified)', () => {
  const FIELD_LABEL_KEYS = [
    // The two photo controls `fieldsForType` synthesises — one plate, one
    // strip. Neither is a `content` leaf the save path writes; both are
    // labels above a control.
    'landing_pages.editor.field_image_url',
    'landing_pages.editor.field_gallery',
    // SECTION_CONTENT_FIELDS' copy fields, in the order that map lists them.
    'landing_pages.editor.field_headline',
    'landing_pages.editor.field_subtext',
    'landing_pages.editor.field_kicker',
    'landing_pages.editor.field_heading',
    'landing_pages.editor.field_lead',
    'landing_pages.editor.field_body',
    'landing_pages.editor.field_terms',
    'landing_pages.editor.field_phone',
    'landing_pages.editor.field_email',
    'landing_pages.editor.field_address',
  ]

  // The same canary the describes above carry: a list that silently drifts
  // short would pass vacuously.
  it('names both photo controls and every copy field the editor draws', () => {
    expect(FIELD_LABEL_KEYS.length).toBe(12)
    expect(FIELD_LABEL_KEYS).toContain('landing_pages.editor.field_gallery')
  })

  for (const locale of LOCALES) {
    it(`every content field label resolves to a non-empty string in ${locale}/common.json`, () => {
      const json = readLocale(locale)
      const missing = FIELD_LABEL_KEYS.filter(key => {
        const value = readAt(json, key)
        return typeof value !== 'string' || value.trim() === ''
      })
      expect(
        missing,
        `${locale}/common.json is missing (or has a blank) field label: ${missing.join(', ') || '(none)'}`,
      ).toEqual([])
    })
  }
})
