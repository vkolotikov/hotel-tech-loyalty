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
