import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const LOCALES = ['en', 'ru', 'de', 'fr', 'es'] as const

/** Keys the code builds at run time (`appointments.status.${s}` and the like); the literal-key scan in src/i18n/localeCompleteness.test.ts cannot see these. */
const FAMILIES: Record<string, readonly string[]> = {
  'vocab.beauty': ['client', 'clients', 'team_member', 'service'],
  'vocab.other': ['client', 'clients', 'team_member', 'service'],
  status: ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show'],
  payment: ['not_paid_online', 'card_held', 'paid_by_card', 'marked_paid', 'refunded', 'marked_refunded', 'partially_refunded', 'failed', 'hold_released', 'unknown'],
  'consequence.payment': ['none', 'hold_will_be_charged', 'hold_will_be_released', 'hold_expired', 'captured_not_refunded', 'marked_only'],
  points_reason: ['not_a_member', 'programme_off', 'points_on_bookings_off', 'already_awarded', 'zero_amount', 'refunded', 'failed'],
  action: ['confirm', 'start', 'complete', 'award_points', 'move', 'mark_paid_at_venue', 'no_show', 'cancel'],
  history: ['created', 'moved', 'confirm', 'start', 'complete', 'no_show', 'cancel', 'mark_paid_at_venue', 'award_points', 'updated', 'cancelled', 'bulk_cancel', 'bulk_mark_complete', 'bulk_mark_paid', 'bulk_mark_no_show', 'bulk_mark_status'],
  error: ['slot_taken', 'stale', 'not_allowed', 'master_not_eligible', 'before_today', 'time_does_not_exist', 'invalid_time', 'idempotency_key_reused', 'possible_duplicate', 'workspace_disabled', 'not_found', 'client_not_found', 'service_not_found', 'master_not_found', 'network'],
  'setup.step': ['timezone', 'service', 'performer', 'hours', 'online', 'first_appointment'],
  'setup.hours.problem': ['format', 'order', 'overlap', 'too_many'],
}

function bundle(locale: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(__dirname, `appointments.${locale}.json`), 'utf8'))
}
function at(json: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((n, p) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[p] : undefined), json)
}
function flatten(o: unknown, prefix = ''): string[] {
  return Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`]))
}

describe('appointments bundle', () => {
  for (const locale of LOCALES) {
    it(`${locale}: every key built at run time is translated`, () => {
      const json = bundle(locale)
      const missing = Object.entries(FAMILIES).flatMap(([family, keys]) =>
        keys.map(k => `${family}.${k}`).filter(k => { const v = at(json, k); return typeof v !== 'string' || !v.trim() }))
      expect(missing, `${locale} is missing: ${missing.join(', ')}`).toEqual([])
    })

    it(`${locale}: no value is empty`, () => {
      const json = bundle(locale)
      expect(flatten(json).filter(k => { const v = at(json, k); return typeof v !== 'string' || !v.trim() })).toEqual([])
    })
  }

  it('the five bundles carry exactly the same key set', () => {
    const en = flatten(bundle('en')).sort()
    for (const locale of LOCALES) expect(flatten(bundle(locale)).sort(), `${locale} keys differ from en`).toEqual(en)
  })

  it('every placeholder in the English text survives in each translation', () => {
    const en = bundle('en')
    for (const key of flatten(en)) {
      const wanted = [...String(at(en, key)).matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).sort()
      for (const locale of LOCALES) {
        const got = [...String(at(bundle(locale), key)).matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).sort()
        expect(got, `${locale}:${key}`).toEqual(wanted)
      }
    }
  })

  it('no translation says a captured payment is flagged for a refund — nothing flags it', () => {
    const promise: Record<(typeof LOCALES)[number], RegExp> = { en: /flag/i, ru: /помеча/i, de: /vorgemerkt/i, fr: /signalé/i, es: /señalad/i }
    for (const locale of LOCALES) {
      const text = String(at(bundle(locale), 'consequence.payment.captured_not_refunded'))
      expect(text, locale).toContain('Stripe')
      expect(text, locale).not.toMatch(promise[locale])
    }
  })

  it('has no generic "something went wrong" for an unknown error: the server\'s own sentence is shown instead', () => {
    expect(at(bundle('en'), 'error.unknown')).toBeUndefined()
  })
})
