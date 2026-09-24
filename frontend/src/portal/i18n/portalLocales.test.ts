import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const LOCALES = ['en', 'ru', 'de', 'fr', 'es'] as const
const INDUSTRIES = ['hotel', 'beauty', 'medical', 'restaurant', 'fitness', 'other'] as const
const NOUNS = ['booking', 'booking_plural', 'service', 'service_plural', 'staff', 'venue', 'visit'] as const
const STATUSES = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'] as const

function bundle(locale: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(__dirname, `portal.${locale}.json`), 'utf8'))
}
function at(json: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((n, p) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[p] : undefined), json)
}

describe('portal bundle — keys built at runtime', () => {
  for (const locale of LOCALES) {
    it(`${locale}: every industry noun and booking status is translated`, () => {
      const json = bundle(locale)
      const missing: string[] = []
      for (const ind of INDUSTRIES) for (const noun of NOUNS) {
        const v = at(json, `vocab.${ind}.${noun}`)
        if (typeof v !== 'string' || !v.trim()) missing.push(`vocab.${ind}.${noun}`)
      }
      for (const s of STATUSES) {
        const v = at(json, `bookings.status.${s}`)
        if (typeof v !== 'string' || !v.trim()) missing.push(`bookings.status.${s}`)
      }
      expect(missing, `${locale} is missing: ${missing.join(', ')}`).toEqual([])
    })
  }

  it('the five bundles carry exactly the same key set', () => {
    const flatten = (o: unknown, prefix = ''): string[] =>
      Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
        v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`])
    const en = flatten(bundle('en')).sort()
    for (const locale of LOCALES) {
      expect(flatten(bundle(locale)).sort(), `${locale} keys differ from en`).toEqual(en)
    }
  })
})
