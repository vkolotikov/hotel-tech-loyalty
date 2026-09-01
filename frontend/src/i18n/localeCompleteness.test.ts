import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
// Template fidelity 5.x: the field-label net below asks these two the same
// question the editor's label site asks — which key does this leaf read —
// rather than re-deriving the collapse rules a second time here.
import { fieldHintKey, fieldLabelKey } from '../pages/landing/editorSections'

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
 * The ids used to be `App\Landing\SectionType::repeatableIds()` alone — the
 * two types the add endpoint accepts. Template fidelity 1.4 adds the FOUR
 * FIXED TYPES NO INDUSTRY SEEDS: `announcement`, `trust`, `faq` (the three
 * blocks the BeautyTech kits draw) and `footer`. They are unreachable from
 * any screen today, which is precisely the point — 3.1 makes them addable
 * and seeds them per template, and their being named in all five locales
 * now is what makes that change a backend-only one.
 *
 * The seven bands an industry DOES seed are still absent and must stay
 * absent: they are named by the wire, in the industry's own vocabulary (a
 * clinic's "Procedures", a salon's "Treatments"), so
 * `section_type_name_about` would be a translation of a string nothing
 * renders. The four below are the opposite case — no industry profile names
 * them, so `LandingOnboardingService::sections()` has nothing to say about
 * them and the editor's own i18n is the only namer they can have.
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
    // Template fidelity 1.4 — the four fixed types no industry's
    // `defaultSections` names, and which therefore reach the editor with no
    // label off the wire at all.
    'landing_pages.editor.section_type_name_announcement',
    'landing_pages.editor.section_type_blurb_announcement',
    'landing_pages.editor.section_type_name_trust',
    'landing_pages.editor.section_type_blurb_trust',
    'landing_pages.editor.section_type_name_faq',
    'landing_pages.editor.section_type_blurb_faq',
    'landing_pages.editor.section_type_name_footer',
    'landing_pages.editor.section_type_blurb_footer',
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
 * The names are every field the SERVED CATALOGUE publishes
 * (`App\Landing\SectionType::all()`'s `fields` arrays, union) plus the two
 * photo controls `fieldsForType` synthesises. Template fidelity 1.3 made
 * the fixed rows read that catalogue instead of a hand-written mirror, so
 * this list grew by exactly the controls that mirror had been withholding:
 * `booking`'s two phone-line labels, `contact`'s five wording overrides,
 * and — once 3.1 makes the three kit blocks reachable — `announcement`'s
 * pair, `trust`'s four and the twelve FAQ leaves.
 *
 * The FAQ, trust and announcement names are here AHEAD of a control that
 * renders them, deliberately and unlike everything else in this file: their
 * types exist in the catalogue today and only their ROWS are unreachable,
 * so the label is what 3.1 needs in place for that task to be backend-only.
 * `feature_4` is one step further ahead again — 5.4 raises the trust cap
 * from three to four to match kits 02 and 03 — and it is a one-line
 * translation against a control labelled `feature_4` reaching a customer.
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
    // Template fidelity 3.3: the third synthesised control — the questions
    // FORM, which stands in for `q1`…`a6` where `q1` sat. Its twelve leaves
    // keep their own labels below (the form prints one over each input);
    // this names the group.
    'landing_pages.editor.field_faq_pairs',
    // Template fidelity 4.3: the two text leaves that belong to a PICTURE.
    // `caption` covers a gallery's eight `caption_N` leaves as well as a
    // single plate's one — the photo control draws one input per tile and
    // labels every one of them with this key, because "Caption under the
    // photo" means the same thing beside each. Eight numbered keys would be
    // eight translations of one sentence.
    'landing_pages.editor.field_alt',
    'landing_pages.editor.field_caption',
    // hero / services / about / team / reviews / text / gallery.
    'landing_pages.editor.field_headline',
    'landing_pages.editor.field_subtext',
    'landing_pages.editor.field_kicker',
    'landing_pages.editor.field_heading',
    'landing_pages.editor.field_lead',
    'landing_pages.editor.field_body',
    // booking — `terms` plus the two phone-line labels 1.3 surfaced.
    'landing_pages.editor.field_terms',
    'landing_pages.editor.field_call_label',
    'landing_pages.editor.field_call_short',
    // contact — ContactDetails' three overridable VALUES...
    'landing_pages.editor.field_phone',
    'landing_pages.editor.field_email',
    'landing_pages.editor.field_address',
    // ...and the five WORDING overrides above them, also surfaced by 1.3.
    'landing_pages.editor.field_phone_label',
    'landing_pages.editor.field_email_label',
    'landing_pages.editor.field_address_label',
    'landing_pages.editor.field_map_label',
    'landing_pages.editor.field_closed_label',
    // announcement.
    'landing_pages.editor.field_text',
    'landing_pages.editor.field_cta_label',
    // trust — three today, four after 5.4 (see this describe's docblock).
    'landing_pages.editor.field_quote',
    'landing_pages.editor.field_feature_1',
    'landing_pages.editor.field_feature_2',
    'landing_pages.editor.field_feature_3',
    'landing_pages.editor.field_feature_4',
    // faq — SectionType::faqLeaves(), interleaved as the form offers them.
    'landing_pages.editor.field_q1',
    'landing_pages.editor.field_a1',
    'landing_pages.editor.field_q2',
    'landing_pages.editor.field_a2',
    'landing_pages.editor.field_q3',
    'landing_pages.editor.field_a3',
    'landing_pages.editor.field_q4',
    'landing_pages.editor.field_a4',
    'landing_pages.editor.field_q5',
    'landing_pages.editor.field_a5',
    'landing_pages.editor.field_q6',
    'landing_pages.editor.field_a6',

    // ─── Template fidelity 5.x ─────────────────────────────────────────
    //
    // The keys below are FAMILY keys, not leaf names — see `fieldLabelKey`,
    // which is what the label site reads. `headline_accent`,
    // `heading_accent` and `lead_accent` are one control on nine types;
    // `fact_1..3`, `promise_1..3` and `feature_1..4_caption` are numbered
    // inputs under one heading. One sentence each, translated once, exactly
    // as `caption` already covers a gallery's eight `caption_N` leaves.

    // 5.1 / R6 — the companion leaf beside every two-tone heading, plus the
    // note that tells a tenant where the words land BEFORE they type them
    // (the ruling's own named mitigation for a one-way split).
    'landing_pages.editor.field_accent',
    'landing_pages.editor.field_hint_accent',
    // 5.2 — hero's three fact terms, the row chips, the story ledger and
    // the closing panel's promises.
    'landing_pages.editor.field_hours_label',
    'landing_pages.editor.field_rating_label',
    'landing_pages.editor.field_city_label',
    'landing_pages.editor.field_item_cta_label',
    'landing_pages.editor.field_fact',
    'landing_pages.editor.field_promise',
    // 5.4 — the second line of a trust highlight.
    'landing_pages.editor.field_feature_caption',
    // 5.5 — the footer hub: the lockup's descriptor, the Follow column and
    // the legal line. The three platform keys are NOT collapsed into one,
    // because "Instagram address" and "TikTok address" are different
    // sentences naming different services.
    'landing_pages.editor.field_descriptor',
    'landing_pages.editor.field_social_label',
    'landing_pages.editor.field_social_instagram',
    'landing_pages.editor.field_social_facebook',
    'landing_pages.editor.field_social_tiktok',
    'landing_pages.editor.field_hint_social',
    'landing_pages.editor.field_legal_note',
  ]

  /**
   * The canary the describes above all carry — a list that silently drifted
   * short would pass vacuously — RECOMPUTED rather than counted.
   *
   * It used to be `expect(FIELD_LABEL_KEYS.length).toBe(12)`, which is a
   * number two edits keep in step only by hand: adding a key and forgetting
   * the count fails for the wrong reason, and adding a key and BUMPING the
   * count passes without anyone having looked at the key. This asks the
   * structural questions instead — the two photo controls are named, the
   * FAQ grammar is complete and interleaved, and no key was written twice.
   */
  it('names both photo controls and every copy field the catalogue publishes', () => {
    expect(FIELD_LABEL_KEYS).toContain('landing_pages.editor.field_image_url')
    expect(FIELD_LABEL_KEYS).toContain('landing_pages.editor.field_gallery')
    expect(FIELD_LABEL_KEYS).toContain('landing_pages.editor.field_faq_pairs')

    // SectionType::MAX_FAQ_PAIRS pairs, both halves of each.
    for (let n = 1; n <= 6; n++) {
      expect(FIELD_LABEL_KEYS).toContain(`landing_pages.editor.field_q${n}`)
      expect(FIELD_LABEL_KEYS).toContain(`landing_pages.editor.field_a${n}`)
    }

    // SectionType::MAX_TRUST_FEATURES columns, and the caption family that
    // covers the second line of every one of them (template fidelity 5.4).
    for (let n = 1; n <= 4; n++) {
      expect(FIELD_LABEL_KEYS).toContain(`landing_pages.editor.field_feature_${n}`)
    }
    expect(FIELD_LABEL_KEYS).toContain('landing_pages.editor.field_feature_caption')

    // SectionType::SOCIAL_PLATFORMS, one key each — these are the one 5.x
    // family deliberately NOT collapsed, so the list has to name all of
    // them (template fidelity 5.5).
    for (const platform of ['instagram', 'facebook', 'tiktok']) {
      expect(FIELD_LABEL_KEYS).toContain(`landing_pages.editor.field_social_${platform}`)
    }

    expect(new Set(FIELD_LABEL_KEYS).size).toBe(FIELD_LABEL_KEYS.length)
  })

  /**
   * Template fidelity 5.x: the collapsed families are only honest if the
   * function that collapses them agrees with the list above. A leaf whose
   * family key is missing here renders its RAW LEAF NAME — `heading_accent`
   * over an input a salon owner is asked to fill in — which is the exact
   * failure 1.4 was written to stop, arriving by a new door.
   *
   * Every leaf spelled here is one the catalogue publishes today.
   */
  it('labels every collapsed field family, not only the leaves that name themselves', () => {
    const leaves = [
      'headline_accent', 'heading_accent', 'lead_accent',
      'fact_1', 'fact_2', 'fact_3',
      'promise_1', 'promise_2', 'promise_3',
      'feature_1_caption', 'feature_2_caption', 'feature_3_caption', 'feature_4_caption',
      'caption_1', 'caption_8',
      'hours_label', 'rating_label', 'city_label', 'item_cta_label',
      'descriptor', 'social_label', 'legal_note',
      'social_instagram', 'social_facebook', 'social_tiktok',
    ]

    const missing = leaves.filter(
      leaf => !FIELD_LABEL_KEYS.includes(`landing_pages.editor.field_${fieldLabelKey(leaf)}`),
    )

    expect(missing, `no label key for: ${missing.join(', ') || '(none)'}`).toEqual([])

    // And every hinted family has its sentence.
    for (const leaf of leaves) {
      const hint = fieldHintKey(leaf)
      if (hint !== null) {
        expect(FIELD_LABEL_KEYS).toContain(`landing_pages.editor.field_hint_${hint}`)
      }
    }
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

/**
 * TEMPLATE FIDELITY 2.x — the builder's new shape names four more families
 * with template-literal `t()` calls, so `T_CALL_RE` at the top of this file
 * can see none of them. Sixth net, same reasoning as the five above.
 *
 *  - `` t(`landing_pages.editor.tab_${tab}`, …) `` — the three tabs (2.1).
 *    A missing translation renders the raw id `publish` as the label of the
 *    tab a tenant is looking for to put their page on the internet.
 *  - `` t(`landing_pages.editor.filter_${id}`, …) `` — the four chips (2.3).
 *  - `` t(`landing_pages.editor.group_${group}`, …) `` — the badge each card
 *    wears. THE SAME THREE WORDS as the chips, deliberately: that is what
 *    makes the filter learnable from the list rather than from a legend, and
 *    it is why both families are pinned here together rather than in two
 *    describes that could drift apart.
 *  - `` t(`landing_pages.editor.placement_${placement}`, …) `` — one sentence
 *    per placement in `LandingOnboardingService::PLACEMENTS` (2.6). This is
 *    the ONLY explanation a tenant gets for a row whose drag handle and
 *    arrows are absent, so a missing one is a control silently withheld.
 *
 * Hardcoded rather than derived, for the sixth time and the same reason: a
 * list built from the module it exists to check loses an id and its
 * expectation in one edit.
 */
describe('locale completeness — builder tabs, filter chips, badges and placements (dynamic t() keys, hand-verified)', () => {
  // `BUILDER_TABS` in builderShape.ts, in its own order.
  const TAB_KEYS = [
    'landing_pages.editor.tab_content',
    'landing_pages.editor.tab_design',
    'landing_pages.editor.tab_publish',
  ]

  // `SECTION_FILTERS` in builderShape.ts, in its own order.
  const FILTER_KEYS = [
    'landing_pages.editor.filter_all',
    'landing_pages.editor.filter_write',
    'landing_pages.editor.filter_photos',
    'landing_pages.editor.filter_workspace',
  ]

  // `SectionGroup` in sections.ts — one badge per answer. There is no
  // `group_all`: "All" is a chip that clears the filter, never something a
  // card can be.
  const GROUP_KEYS = [
    'landing_pages.editor.group_write',
    'landing_pages.editor.group_photos',
    'landing_pages.editor.group_workspace',
  ]

  // `LandingOnboardingService::PLACEMENTS`, served per fixed block.
  const PLACEMENT_KEYS = [
    'landing_pages.editor.placement_top',
    'landing_pages.editor.placement_fixed',
    'landing_pages.editor.placement_footer',
  ]

  const ALL_KEYS = [...TAB_KEYS, ...FILTER_KEYS, ...GROUP_KEYS, ...PLACEMENT_KEYS]

  /**
   * RECOMPUTED, not counted — the discipline template fidelity 1.4 put in
   * place when it replaced `expect(FIELD_LABEL_KEYS.length).toBe(12)`.
   *
   * The structural claims worth making here are that every chip except
   * "All" has a card badge to match it (the pairing is the whole reason the
   * chips need no legend), and that nothing is written twice.
   */
  it('gives every chip except All a matching card badge', () => {
    const chips = FILTER_KEYS
      .map(key => key.replace('landing_pages.editor.filter_', ''))
      .filter(id => id !== 'all')

    for (const id of chips) {
      expect(GROUP_KEYS).toContain(`landing_pages.editor.group_${id}`)
    }

    expect(chips.length).toBe(GROUP_KEYS.length)
    expect(new Set(ALL_KEYS).size).toBe(ALL_KEYS.length)
  })

  for (const locale of LOCALES) {
    it(`every tab, chip, badge and placement key resolves to a non-empty string in ${locale}/common.json`, () => {
      const json = readLocale(locale)
      const missing = ALL_KEYS.filter(key => {
        const value = readAt(json, key)
        return typeof value !== 'string' || value.trim() === ''
      })
      expect(
        missing,
        `${locale}/common.json is missing (or has a blank) builder-shape key: ${missing.join(', ') || '(none)'}`,
      ).toEqual([])
    })
  }
})
