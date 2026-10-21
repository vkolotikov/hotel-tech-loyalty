import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Push messages' words (spec 2026-10-22 release 3 §5): i18n/push.<lang>.json, read under `loyalty.push`. The key sets,
 * placeholders, run-time families and the English fallbacks are i18n/loyaltyLocales.test.ts's (it checks every area's
 * bundle); this adds the one rule of tone it does not: Spanish speaks to the reader as usted.
 */
const at = (json: unknown, key: string): unknown =>
  key.split('.').reduce<unknown>((n, p) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[p] : undefined), json)
const flatten = (o: unknown, prefix = ''): string[] =>
  Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`]))

describe('Push messages words in Spanish', () => {
  it('address the reader as usted, never as tú', () => {
    const es = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../i18n/push.es.json'), 'utf8'))
    const keys = flatten(es)
    expect(keys.length).toBeGreaterThan(150)
    const informal = keys.filter(k => /(?:^|[\s¿¡(«])(tú|tu|tus|contigo|vosotros)(?=[\s,.:;)»]|$)/i.test(String(at(es, k))))
    expect(String(at(es, 'blocker.unsaved'))).toBe('Primero guarde sus cambios.')
    expect(String(at(es, 'blocker.title'))).toBe('Escriba un título.')
    expect(informal).toEqual([])
  })
})
