import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { ERRORS } from './errors'
import { WORD_FAMILIES } from './words'

/**
 * Insights' words (spec 2026-10-21 release 2 §9): insights.<lang>.json in five languages, read under
 * `loyalty.insights` (i18n/index.ts). The same checks i18n/loyaltyLocales.test.ts makes of the release 1 bundles: the
 * key sets equal, nothing empty, every {{placeholder}} kept, every word the code builds at run time present, and the
 * English equal to the code's fallbacks.
 */
const LOCALES = ['en', 'ru', 'de', 'fr', 'es'] as const
const PREFIX = 'loyalty.insights.'
const I18N = path.resolve(__dirname, '../i18n')

const bundle = (locale: string): Record<string, unknown> => JSON.parse(fs.readFileSync(path.join(I18N, `insights.${locale}.json`), 'utf8'))
const at = (json: unknown, key: string): unknown =>
  key.split('.').reduce<unknown>((n, p) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[p] : undefined), json)
const flatten = (o: unknown, prefix = ''): string[] =>
  Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`]))
const placeholders = (text: unknown) => [...String(text).matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).sort()

/** Every literal t('loyalty.insights.…', 'English') in the workspace's source, with its English. */
function literalKeys(): Map<string, string> {
  const files: string[] = []
  const walk = (dir: string) => fs.readdirSync(dir).forEach(entry => {
    const full = path.join(dir, entry)
    if (fs.statSync(full).isDirectory()) walk(full)
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) files.push(full)
  })
  walk(path.resolve(__dirname, '..'))
  const out = new Map<string, string>()
  for (const file of files) {
    const re = /\bt\(\s*'(loyalty\.insights\.[a-z0-9_.]+)'\s*,\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g
    for (const m of fs.readFileSync(file, 'utf8').matchAll(re)) out.set(m[1], (m[2] ?? m[3]).replace(/\\'/g, "'").replace(/\\"/g, '"'))
  }
  return out
}

describe('Insights words', () => {
  it('the five bundles carry exactly the same key set', () => {
    const en = flatten(bundle('en')).sort()
    expect(en.length).toBeGreaterThan(50)
    for (const locale of LOCALES) expect(flatten(bundle(locale)).sort(), `${locale} keys differ from en`).toEqual(en)
  })

  it('no value is empty', () => {
    for (const locale of LOCALES) {
      const json = bundle(locale)
      expect(flatten(json).filter(k => { const v = at(json, k); return typeof v !== 'string' || !v.trim() }), locale).toEqual([])
    }
  })

  it('every {{placeholder}} of the English survives in each translation', () => {
    const en = bundle('en')
    for (const key of flatten(en)) {
      for (const locale of LOCALES) expect(placeholders(at(bundle(locale), key)), `${locale}:${key}`).toEqual(placeholders(at(en, key)))
    }
  })

  it('holds every word the code builds at run time, the English equal to the code\'s', () => {
    const words: Record<string, string> = {}
    for (const [family, list] of Object.entries(WORD_FAMILIES)) for (const [k, v] of Object.entries(list)) words[`${family}.${k}`] = v
    for (const [family, list] of Object.entries(ERRORS)) for (const [k, v] of Object.entries(list)) words[`${family}.error.${k}`] = v
    for (const locale of LOCALES) {
      const json = bundle(locale)
      expect(Object.keys(words).filter(k => typeof at(json, k) !== 'string'), `${locale} misses`).toEqual([])
    }
    const en = bundle('en')
    for (const [key, text] of Object.entries(words)) expect(at(en, key), key).toBe(text)
  })

  it('the English reads as the code\'s fallback for every literal key', () => {
    const keys = literalKeys()
    expect(keys.size).toBeGreaterThan(40)
    const misses: string[] = []
    for (const [key, text] of keys) {
      const value = at(bundle('en'), key.slice(PREFIX.length))
      if (value !== text) misses.push(`${key}: bundle ${JSON.stringify(value)} vs code ${JSON.stringify(text)}`)
    }
    expect(misses).toEqual([])
  })

  it('speaks Spanish with "usted", never "tú"', () => {
    const es = flatten(bundle('es')).map(k => String(at(bundle('es'), k)))
    expect(es.filter(text => /\b(tú|tu|tus|puedes|elige|comprueba|inténtalo)\b/i.test(text))).toEqual([])
  })
})
