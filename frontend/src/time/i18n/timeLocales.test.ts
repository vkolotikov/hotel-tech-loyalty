import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { KNOWN_ERRORS } from '../lib/errors'
import { SIGNAL_CODES } from '../lib/signals'
import { REASONS, SKIPPED, UNPLACED } from '../plan/planLogic'
import { timeBundles, LANGS } from './index'

/**
 * Every word HexaTech Time Planner asks for is there in all five languages: each `t('time.…')` the sources call resolves
 * in every bundle as index.ts registers them, every area file has the same keys in all five, and the keys the code
 * builds (the areas' names, signals, plan reasons, priorities, statuses, repeats, AI states, refusals) are there too.
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
const bundles = timeBundles(files)
const used = [...new Set(sources(DIR).flatMap(file => [...fs.readFileSync(file, 'utf8').matchAll(/\bt\(\s*['"`](time\.[a-zA-Z0-9_.]+)['"`]/g)].map(m => m[1])))].sort()
const built = [
  ...['today', 'plan', 'backlog', 'team', 'insights', 'settings'].map(a => `time.nav.${a}`),
  ...['planning', 'people', 'reports', 'setup'].map(g => `time.nav.groups.${g}`),
  ...SIGNAL_CODES.map(code => `time.signals.${code}`),
  ...REASONS.map(r => `time.plan.reason.${r}`),
  ...UNPLACED.map(r => `time.plan.unplaced.${r}`),
  ...SKIPPED.map(r => `time.plan.skipped.${r}`),
  ...['high', 'normal', 'low'].map(p => `time.priority.${p}`),
  ...['todo', 'in_progress', 'blocked', 'done'].map(p => `time.status.${p}`),
  ...['none', 'daily', 'weekly', 'monthly'].map(p => `time.repeat.${p}`),
  ...['ready', 'not_configured', 'over', 'model_not_allowed', 'unknown'].map(p => `time.ai_state.${p}`),
  ...KNOWN_ERRORS.map(code => `time.errors.${code}`),
  'time.errors.unknown',
]

describe('HexaTech Time Planner words', () => {
  it('finds the calls (the scan is not empty)', () => {
    expect(used.length).toBeGreaterThan(80)
    expect(used).toContain('time.today.plan')
  })

  for (const lang of LANGS) {
    it(`every key the code asks for is in ${lang}`, () => {
      const missing = [...used, ...built].filter(key => typeof readAt({ time: bundles[lang] }, key) !== 'string')
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
