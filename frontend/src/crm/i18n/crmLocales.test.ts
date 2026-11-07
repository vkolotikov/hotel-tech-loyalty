import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { KNOWN_ERRORS } from '../lib/errors'
import { crmBundles, LANGS } from './index'

/**
 * Every word HexaTech CRM asks for is there in all five languages: each `t('crm.…')` the sources call resolves in every
 * bundle as index.ts registers them, every area file has the same keys in all five, and the keys the code builds
 * (the areas' names, the setup steps, the refusals) are there too.
 */
const DIR = path.resolve(__dirname, '..')
const I18N = path.resolve(__dirname)

function sources(dir: string): string[] {
  return fs.readdirSync(dir).flatMap(entry => {
    const full = path.join(dir, entry)
    if (fs.statSync(full).isDirectory()) return sources(full)
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : []
  })
}

function readAt(json: unknown, dotted: string): unknown {
  return dotted.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' && part in (node as object) ? (node as Record<string, unknown>)[part] : undefined), json)
}

function leaves(node: unknown, prefix = ''): string[] {
  if (!node || typeof node !== 'object') return [prefix]
  return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => leaves(v, prefix ? `${prefix}.${k}` : k))
}

const files = Object.fromEntries(fs.readdirSync(I18N).filter(f => f.endsWith('.json')).map(f => [`./${f}`, JSON.parse(fs.readFileSync(path.join(I18N, f), 'utf8'))]))
const bundles = crmBundles(files)
const used = [...new Set(sources(DIR).flatMap(file => [...fs.readFileSync(file, 'utf8').matchAll(/\bt\(\s*['"`](crm\.[a-zA-Z0-9_.]+)['"`]/g)].map(m => m[1])))].sort()
const built = [
  ...['today', 'inbox', 'visitors', 'leads', 'pipeline', 'contacts', 'tasks', 'assistant', 'widget', 'insights', 'settings'].map(a => `crm.nav.${a}`),
  ...['widget', 'assistant', 'knowledge', 'reply', 'pipeline', 'team'].flatMap(s => [`crm.start.${s}.title`, `crm.start.${s}.line`]),
  ...KNOWN_ERRORS.map(code => `crm.errors.${code}`),
  'crm.errors.unknown',
]

describe('HexaTech CRM words', () => {
  it('finds the calls (the scan is not empty)', () => {
    expect(used.length).toBeGreaterThan(80)
    expect(used).toContain('crm.today.title')
  })

  for (const lang of LANGS) {
    it(`every key the code asks for is in ${lang}`, () => {
      const missing = [...used, ...built].filter(key => typeof readAt({ crm: bundles[lang] }, key) !== 'string')
      expect(missing, `${lang} lacks`).toEqual([])
    })
  }

  it('every area file has the same keys in all five languages, and no empty word', () => {
    const areas = [...new Set(Object.keys(files).map(f => /\.\/([a-z]+)\.[a-z]{2}\.json$/.exec(f)?.[1]).filter((a): a is string => !!a))]
    // A language's plural forms (i18next: `_one`, `_few`, `_many`…) are its own: Russian needs more than English, and a
    // count-neutral wording ("Лидов: 3") needs none. Each must sit beside the key it is a form of.
    // A key is a plural form only beside its own key (`rated_many` alone is an ordinary key).
    const PLURAL = /_(zero|one|two|few|many|other)$/
    const base = (words: unknown) => leaves(words).filter(key => !(PLURAL.test(key) && readAt(words, key.replace(PLURAL, '')) !== undefined)).sort()
    for (const area of areas) {
      const english = base(files[`./${area}.en.json`])
      for (const lang of LANGS) {
        const words = files[`./${area}.${lang}.json`]
        expect(words, `${area}.${lang}.json exists`).toBeDefined()
        expect(base(words), `${area}.${lang}.json keys`).toEqual(english)
        const empty = leaves(words).filter(key => String(readAt(words, key) ?? '').trim() === '')
        expect(empty, `${area}.${lang}.json empty words`).toEqual([])
      }
    }
  })

  it('keeps the placeholders of every English word in each translation', () => {
    const holes = (s: unknown) => [...String(s).matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map(m => m[1]).sort()
    for (const file of Object.keys(files).filter(f => f.endsWith('.en.json'))) {
      // A plural form may leave the count out ("1 lead"); the other placeholders it keeps are checked with its key.
      for (const key of leaves(files[file]).filter(k => !(/_(zero|one|two|few|many|other)$/.test(k) && readAt(files[file], k.replace(/_(zero|one|two|few|many|other)$/, '')) !== undefined))) {
        for (const lang of LANGS) {
          const other = files[file.replace('.en.json', `.${lang}.json`)]
          expect(holes(readAt(other, key)), `${file} ${key} in ${lang}`).toEqual(holes(readAt(files[file], key)))
        }
      }
    }
  })
})
