import { describe, expect, it } from 'vitest'
import { localisedIndustryCopy, PICKER_INDUSTRIES, INDUSTRY_COPY } from './industryCopy'
import { featureLabel, featureDetail, planTagline, ALL_FEATURES, PLAN_FEATURES } from './planFeatures'
import en from '../i18n/locales/en/common.json'
import ru from '../i18n/locales/ru/common.json'
import de from '../i18n/locales/de/common.json'
import fr from '../i18n/locales/fr/common.json'
import es from '../i18n/locales/es/common.json'

/**
 * Locks the registration i18n layer.
 *
 * The signup page resolves copy through two indirections — i18n keys with
 * the English string as the inline default, so a missing translation
 * degrades to English rather than rendering a raw key path. These tests
 * pin both halves of that contract:
 *
 *   1. With a t() that always misses, every helper returns the English
 *      default (the fallback path real users hit for an untranslated key).
 *   2. Against the SHIPPED locale files, every key the page asks for
 *      actually resolves, and resolves to something other than the raw key.
 */

const LOCALES: Record<string, any> = { en, ru, de, fr, es }
const TRANSLATED = ['ru', 'de', 'fr', 'es']

/** Resolve a dotted key out of a locale bundle, mimicking i18next lookup. */
function lookup(bundle: any, key: string): string | undefined {
  let node = bundle
  for (const part of key.split('.')) {
    if (node == null || typeof node !== 'object') return undefined
    node = node[part]
  }
  return typeof node === 'string' ? node : undefined
}

/** A t() bound to one locale bundle, falling back to the inline default. */
function tFor(lang: string) {
  return (key: string, defaultValue: string) => lookup(LOCALES[lang], key) ?? defaultValue
}

/** A t() that never resolves anything — exercises the fallback path. */
const tMiss = (_key: string, defaultValue: string) => defaultValue

describe('localisedIndustryCopy', () => {
  it('falls back to English when no translation resolves', () => {
    for (const id of PICKER_INDUSTRIES) {
      const base = INDUSTRY_COPY[id]!
      const copy = localisedIndustryCopy(id, tMiss)
      expect(copy.hero).toBe(base.hero)
      expect(copy.heroSub).toBe(base.heroSub)
      expect(copy.orgLabel).toBe(base.orgLabel)
      expect(copy.planTagline).toBe(base.planTagline)
      expect(copy.workspaceNoun).toBe(base.workspaceNoun)
      expect(copy.heroBullets).toEqual(base.heroBullets)
      expect(copy.orgPlaceholder).toBe(base.orgPlaceholder)
    }
  })

  it('never drops a hero bullet when localising', () => {
    // The hero renders a fixed 3-row rhythm; a translation layer that
    // returned fewer bullets would silently collapse it.
    for (const lang of Object.keys(LOCALES)) {
      for (const id of PICKER_INDUSTRIES) {
        const copy = localisedIndustryCopy(id, tFor(lang))
        expect(copy.heroBullets).toHaveLength(INDUSTRY_COPY[id]!.heroBullets.length)
        for (const b of copy.heroBullets) expect(b.trim().length).toBeGreaterThan(0)
      }
    }
  })

  it.each(TRANSLATED)('%s actually translates every industry hero + bullets', (lang) => {
    for (const id of PICKER_INDUSTRIES) {
      const base = INDUSTRY_COPY[id]!
      const copy = localisedIndustryCopy(id, tFor(lang))
      expect(copy.hero).not.toBe(base.hero)
      expect(copy.workspaceNoun).not.toBe(base.workspaceNoun)
      copy.heroBullets.forEach((b, i) => expect(b).not.toBe(base.heroBullets[i]))
    }
  })

  it.each(TRANSLATED)('%s localises the "e.g." placeholder lead-in only', (lang) => {
    for (const id of PICKER_INDUSTRIES) {
      const base = INDUSTRY_COPY[id]!
      const copy = localisedIndustryCopy(id, tFor(lang))
      // The example business name is a proper noun and must survive intact.
      const exampleName = base.orgPlaceholder.replace(/^e\.g\.\s*/, '')
      expect(copy.orgPlaceholder).toContain(exampleName)
      expect(copy.orgPlaceholder.startsWith('e.g.')).toBe(false)
    }
  })

  it('unknown industry still returns usable copy', () => {
    const copy = localisedIndustryCopy('not_a_real_industry' as any, tFor('ru'))
    expect(copy.hero.length).toBeGreaterThan(0)
    expect(copy.heroBullets.length).toBeGreaterThan(0)
  })
})

describe('plan feature localisation', () => {
  it('falls back to the English label when nothing resolves', () => {
    for (const f of ALL_FEATURES) {
      expect(featureLabel(f.key, tMiss)).toBe(f.label)
    }
  })

  it.each(TRANSLATED)('%s has a real key for every feature label', (lang) => {
    // Assert the KEY resolves rather than that the text differs: some
    // labels are genuine cognates ("Support" is spelled the same in
    // English, German and French), so a difference check would fail on
    // correct translations.
    for (const f of ALL_FEATURES) {
      const key = 'auth.plans.feature.' + f.key
      expect(lookup(LOCALES[lang], key), `${lang} missing ${key}`).toBeDefined()
      expect(featureLabel(f.key, tFor(lang)).trim().length).toBeGreaterThan(0)
    }
  })

  it.each(TRANSLATED)('%s has a real key for every plan feature detail', (lang) => {
    for (const [slug, features] of Object.entries(PLAN_FEATURES)) {
      for (const [key, value] of Object.entries(features)) {
        if (typeof value !== 'string') continue
        const dotted = `auth.plans.detail.${slug}.${key}`
        expect(lookup(LOCALES[lang], dotted), `${lang} missing ${dotted}`).toBeDefined()
        expect(featureDetail(slug, key, value, tFor(lang)).trim().length).toBeGreaterThan(0)
      }
    }
  })

  it('unknown plan slug falls back to the supplied detail', () => {
    // An unrecognised SaaS plan has no translation keys; it must still
    // render its own copy rather than a raw key path.
    const got = featureDetail('some_unknown_plan', 'crm', 'Up to 12 members', tFor('de'))
    expect(got).toBe('Up to 12 members')
  })

  it('unknown plan slug falls back to the supplied tagline', () => {
    const got = planTagline('some_unknown_plan', 'A plan we do not ship', tFor('fr'))
    expect(got).toBe('A plan we do not ship')
  })

  it.each(TRANSLATED)('%s translates the shipped plan taglines', (lang) => {
    const t = tFor(lang)
    for (const slug of ['starter', 'growth', 'enterprise']) {
      const got = planTagline(slug, 'ENGLISH FALLBACK', t)
      expect(got).not.toBe('ENGLISH FALLBACK')
      expect(got.trim().length).toBeGreaterThan(0)
    }
  })
})

describe('locale bundle integrity', () => {
  it.each(TRANSLATED)('%s carries every auth key that en does', (lang) => {
    // A key present in en but missing elsewhere renders English mid-page,
    // which is exactly the bug this whole pass was fixing.
    const flatten = (obj: any, prefix = ''): string[] =>
      Object.entries(obj).flatMap(([k, v]) =>
        typeof v === 'string' ? [prefix + k] : flatten(v, prefix + k + '.'))

    const enAuth = flatten((en as any).auth, 'auth.')
    const missing = enAuth.filter(k => lookup(LOCALES[lang], k) === undefined)
    expect(missing).toEqual([])
  })

  it.each(TRANSLATED)('%s preserves interpolation placeholders', (lang) => {
    const walk = (obj: any, path: string[] = []): Array<[string, string]> =>
      Object.entries(obj).flatMap(([k, v]) =>
        typeof v === 'string'
          ? [[[...path, k].join('.'), v] as [string, string]]
          : walk(v, [...path, k]))

    for (const [key, enVal] of walk((en as any).auth, ['auth'])) {
      const placeholders = enVal.match(/\{\{\w+\}\}/g)
      if (!placeholders) continue
      const translated = lookup(LOCALES[lang], key)
      if (translated === undefined) continue
      for (const ph of placeholders) {
        expect(translated, `${lang} ${key} lost ${ph}`).toContain(ph)
      }
    }
  })
})
