import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { WORD_FAMILIES } from './doorWords'

/**
 * The scan screen's run-time words (doorWords.ts) in the door bundles, as loyaltyLocales.test.ts checks an area's
 * `<area>/words.ts` (the door's words live in scan/, so that sweep does not find them): every word of every family in
 * all five door.<lang>.json, the English equal to the code's, each translation keeping the English placeholders.
 */
const I18N = path.resolve(__dirname, '../i18n')
const LOCALES = ['en', 'ru', 'de', 'fr', 'es'] as const
const bundle = (locale: string): Record<string, unknown> => JSON.parse(fs.readFileSync(path.join(I18N, `door.${locale}.json`), 'utf8'))
const at = (json: unknown, key: string): unknown => key.split('.').reduce<unknown>((n, p) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[p] : undefined), json)
const placeholders = (text: unknown) => [...String(text).matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).sort()

const words = Object.entries(WORD_FAMILIES).flatMap(([family, list]) => Object.entries(list).map(([k, v]) => [`${family}.${k}`, v] as const))

describe('the door bundles hold the scan screen’s run-time words', () => {
  it('knows its families', () => {
    expect(Object.keys(WORD_FAMILIES).sort()).toEqual(['fact', 'headline', 'reason', 'validity', 'warning'])
    expect(words.length).toBeGreaterThan(30)
  })

  it('the English bundle says each word as the code does', () => {
    const en = bundle('en')
    for (const [key, text] of words) expect(at(en, key), key).toBe(text)
  })

  for (const locale of LOCALES) {
    it(`door.${locale}.json has every word, with the English placeholders`, () => {
      const json = bundle(locale)
      for (const [key, text] of words) {
        const value = at(json, key)
        expect(typeof value === 'string' && value.trim() !== '', `${locale}:${key}`).toBe(true)
        expect(placeholders(value), `${locale}:${key}`).toEqual(placeholders(text))
      }
    })
  }

  it('every reason AccessVerdict can give has its sentence', () => {
    for (const reason of ['member_erased', 'member_off', 'expired', 'place_off', 'tier_not_allowed', 'event_not_open', 'event_full', 'not_signed_up']) {
      expect(WORD_FAMILIES.reason[reason], reason).toBeTruthy()
    }
  })
})
