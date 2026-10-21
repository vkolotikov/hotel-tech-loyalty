import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { ERRORS } from '../lib/errors'
import { WORD_FAMILIES } from '../lib/words'

const LOCALES = ['en', 'ru', 'de', 'fr', 'es'] as const

type Families = Record<string, Record<string, string>>

/** Each area's run-time words (`<area>/words.ts` WORD_FAMILIES) and refusal words (`<area>/errors.ts` ERRORS). */
const AREA_WORDS = import.meta.glob<{ WORD_FAMILIES?: Families }>('../*/words.ts', { eager: true })
const AREA_ERRORS = import.meta.glob<{ ERRORS?: Families }>('../*/errors.ts', { eager: true })

/**
 * HexaTech Loyalty's bundles (spec 2026-10-21 §7, release 2 §9): loyalty.<lang>.json for the workspace, and an area's
 * own <area>.<lang>.json read under `loyalty.<area>` (i18n/index.ts) with that area's words.ts and errors.ts. Every
 * area file in this folder is checked; a new area needs no line here.
 */
const AREAS = fs.readdirSync(__dirname).map(f => /^([a-z]+)\.en\.json$/.exec(f)?.[1]).filter((n): n is string => !!n && n !== 'loyalty').sort()
const BUNDLES: { name: string; prefix: string; families: Families; errors: Families }[] = [
  { name: 'loyalty', prefix: 'loyalty.', families: WORD_FAMILIES, errors: ERRORS },
  ...AREAS.map(name => ({
    name,
    prefix: `loyalty.${name}.`,
    families: AREA_WORDS[`../${name}/words.ts`]?.WORD_FAMILIES ?? {},
    errors: AREA_ERRORS[`../${name}/errors.ts`]?.ERRORS ?? {},
  })),
]

function bundle(name: string, locale: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(__dirname, `${name}.${locale}.json`), 'utf8'))
}
function at(json: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((n, p) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[p] : undefined), json)
}
function flatten(o: unknown, prefix = ''): string[] {
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`]))
}
const placeholders = (text: unknown) => [...String(text).matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).sort()

/** Every literal t('loyalty.…', 'English') in the workspace's source, with its English. */
function literalKeys(): Map<string, string> {
  const root = path.resolve(__dirname, '..')
  const files: string[] = []
  const walk = (dir: string) => fs.readdirSync(dir).forEach(entry => {
    const full = path.join(dir, entry)
    if (fs.statSync(full).isDirectory()) walk(full)
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) files.push(full)
  })
  walk(root)
  const out = new Map<string, string>()
  for (const file of files) {
    const re = /\bt\(\s*'(loyalty\.[a-z0-9_.]+)'\s*,\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g
    for (const m of fs.readFileSync(file, 'utf8').matchAll(re)) out.set(m[1], (m[2] ?? m[3]).replace(/\\'/g, "'").replace(/\\"/g, '"'))
  }
  return out
}

describe('HexaTech Loyalty words', () => {
  it('checks every area bundle that i18n/index.ts registers', () => {
    expect(AREAS).toEqual(expect.arrayContaining(['program', 'rewards', 'membership', 'insights', 'campaigns', 'app', 'push']))
  })

  for (const b of BUNDLES) {
    describe(`${b.name}.<lang>.json`, () => {
      it('the five bundles carry exactly the same key set', () => {
        const en = flatten(bundle(b.name, 'en')).sort()
        // The workspace's own bundle is never empty; an area's may still be the placeholder `{}` of its wiring.
        if (b.name === 'loyalty') expect(en.length).toBeGreaterThan(0)
        for (const locale of LOCALES) expect(flatten(bundle(b.name, locale)).sort(), `${locale} keys differ from en`).toEqual(en)
      })

      it('no value is empty', () => {
        for (const locale of LOCALES) {
          const json = bundle(b.name, locale)
          expect(flatten(json).filter(k => { const v = at(json, k); return typeof v !== 'string' || !v.trim() }), locale).toEqual([])
        }
      })

      it('every {{placeholder}} of the English survives in each translation', () => {
        const en = bundle(b.name, 'en')
        for (const key of flatten(en)) {
          for (const locale of LOCALES) expect(placeholders(at(bundle(b.name, locale), key)), `${locale}:${key}`).toEqual(placeholders(at(en, key)))
        }
      })

      it('holds every word the code builds at run time, the English equal to the code\'s', () => {
        const words: Record<string, string> = {}
        for (const [family, list] of Object.entries(b.families)) for (const [k, v] of Object.entries(list)) words[`${family}.${k}`] = v
        for (const [family, list] of Object.entries(b.errors)) for (const [k, v] of Object.entries(list)) words[`${family}.error.${k}`] = v
        for (const locale of LOCALES) {
          const json = bundle(b.name, locale)
          expect(Object.keys(words).filter(k => typeof at(json, k) !== 'string'), `${locale} misses`).toEqual([])
        }
        const en = bundle(b.name, 'en')
        for (const [key, text] of Object.entries(words)) expect(at(en, key), key).toBe(text)
      })
    })
  }

  it('the English reads as the code\'s fallback for every literal key, in the bundle the key belongs to', () => {
    const misses: string[] = []
    for (const [key, text] of literalKeys()) {
      const b = BUNDLES.slice().reverse().find(x => key.startsWith(x.prefix))!
      const value = at(bundle(b.name, 'en'), key.slice(b.prefix.length))
      if (value !== text) misses.push(`${key}: bundle ${JSON.stringify(value)} vs code ${JSON.stringify(text)}`)
    }
    expect(misses).toEqual([])
  })
})
