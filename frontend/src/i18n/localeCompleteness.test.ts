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
