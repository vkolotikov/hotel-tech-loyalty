import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { ERRORS } from '../lib/errors'

const LOCALES = ['en', 'ru', 'de', 'fr', 'es'] as const

/** Keys the code builds at run time (`content.status.${s}` and the like); src/i18n/localeCompleteness.test.ts sees only literal keys. */
const FAMILIES: Record<string, readonly string[]> = {
  platform: ['linkedin', 'instagram', 'tiktok', 'facebook', 'x', 'youtube', 'blog', 'email'],
  status: ['idea', 'draft', 'needs_review', 'needs_visual', 'approved', 'ready_to_publish', 'published', 'skipped', 'archived'],
  'plan.view': ['week', 'month', 'list'],
  'generate.preset': ['this_week', 'next_week', 'this_month', 'custom'],
  'generate.problem': ['missing', 'order', 'too_long', 'past'],
  'panel.ai.rewrite_type': ['shorter', 'longer', 'professional', 'friendly', 'alternative'],
  'panel.ai.brief_field': ['visual_type', 'aspect_ratio', 'style', 'description', 'scene', 'mood', 'composition', 'text_overlay', 'avoid'],
  ...Object.fromEntries(Object.entries(ERRORS).map(([family, words]) => [`${family}.error`, Object.keys(words)])),
}

function bundle(locale: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(__dirname, `content.${locale}.json`), 'utf8'))
}
function at(json: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((n, p) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[p] : undefined), json)
}
function flatten(o: unknown, prefix = ''): string[] {
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`]))
}

describe('content bundle', () => {
  for (const locale of LOCALES) {
    it(`${locale}: every key built at run time is translated`, () => {
      const json = bundle(locale)
      const missing = Object.entries(FAMILIES).flatMap(([family, keys]) =>
        keys.map(k => `${family}.${k}`).filter(k => { const v = at(json, k); return typeof v !== 'string' || !v.trim() }))
      expect(missing, `${locale} is missing: ${missing.join(', ')}`).toEqual([])
    })

    it(`${locale}: no value is empty, and every {{name}} of the English text is kept`, () => {
      const json = bundle(locale)
      const en = bundle('en')
      expect(flatten(json).filter(k => { const v = at(json, k); return typeof v !== 'string' || !v.trim() })).toEqual([])
      const names = (s: unknown) => [...String(s).matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).sort()
      const lost = flatten(en).filter(k => JSON.stringify(names(at(en, k))) !== JSON.stringify(names(at(json, k))))
      expect(lost, `${locale} changes the {{…}} names of: ${lost.join(', ')}`).toEqual([])
    })
  }

  it('the five bundles carry exactly the same key set', () => {
    const en = flatten(bundle('en')).sort()
    for (const locale of LOCALES) expect(flatten(bundle(locale)).sort(), `${locale} keys differ from en`).toEqual(en)
  })
})
