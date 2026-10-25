import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import fs from 'node:fs'
import path from 'node:path'
import { PortalContext, type PortalContextValue } from '../../PortalProvider'
import type { PortalBootstrap } from '../../lib/types'
import { CreditBalance } from './CreditBalance'
import { CREDIT_KEY, LINE_WORDS, lineKind, showsCredit, showsNote, signedMoney, type MemberCredit } from './creditView'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_k: string, fallback?: string | Record<string, unknown>, opts?: Record<string, unknown>) => {
      const vars = typeof fallback === 'object' ? fallback : opts
      let text = typeof fallback === 'string' ? fallback : _k
      for (const [k, v] of Object.entries(vars ?? {})) text = text.replace(`{{${k}}}`, String(v))
      return text
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('../../../lib/api', () => ({ api: {} }))

const boot = { venue: { name: 'Numa', currency: 'EUR', timezone: 'Europe/Riga' } } as unknown as PortalBootstrap
const credit = (more: Partial<MemberCredit> = {}): MemberCredit => ({
  enabled: true, balance: 12.4, currency: 'EUR',
  lines: [
    { id: 3, type: 'spend', amount: -2.4, balance_after: 12.4, currency: 'EUR', note: 'Coffee', reference_type: null, created_at: '2026-10-25T09:30:00+00:00' },
    { id: 2, type: 'earn', amount: 14.8, balance_after: 14.8, currency: 'EUR', note: '5% cashback on 296.00 EUR', reference_type: 'booking_mirror', created_at: '2026-10-24T15:00:00+00:00' },
  ],
  ...more,
})

function render(data?: MemberCredit) {
  const client = new QueryClient()
  if (data) client.setQueryData(CREDIT_KEY, data)
  const value: PortalContextValue = { data: boot, isLoading: false, isError: false, error: null, refetch: () => {} }
  return renderToStaticMarkup(
    <QueryClientProvider client={client}><PortalContext.Provider value={value}><CreditBalance /></PortalContext.Provider></QueryClientProvider>,
  )
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

describe('the credit on portal Home', () => {
  it('says the balance in the venue’s currency, that it is spent at the desk, and the latest lines', () => {
    const words = text(render(credit()))
    expect(words).toContain('Credit: €12.40')
    expect(words).toContain('Spend it at the desk: ask the team to take it off your bill.')
    expect(words).toContain('Spent at the desk · Coffee')
    expect(words).toContain('−€2.40')
    expect(words).toContain('Cashback on a stay')
    expect(words).toContain('+€14.80')
    expect(words).not.toContain('5% cashback on')
  })

  it('shows at most five lines', () => {
    const lines = Array.from({ length: 8 }, (_, i) => ({ id: 10 + i, type: 'spend', amount: -1, balance_after: 1, currency: 'EUR', note: null, reference_type: null, created_at: null }))
    expect(render(credit({ lines })).match(/<li/g)).toHaveLength(5)
  })

  it('keeps a balance earned before cashback was switched off, and says no new credit comes', () => {
    const words = text(render(credit({ enabled: false })))
    expect(words).toContain('Credit: €12.40')
    expect(words).toContain('New credit is no longer earned; what you have can still be spent at the desk.')
  })

  it('shows nothing while the venue gives no cashback and the member holds none, or before the answer', () => {
    expect(render(credit({ enabled: false, balance: 0, lines: [] }))).toBe('')
    expect(render()).toBe('')
    expect(text(render(credit({ balance: 0, lines: [] })))).toContain('You get credit back on what you spend, from your next visit.')
  })
})

describe('credit’s words and decisions', () => {
  it('decides by value', () => {
    expect([showsCredit(undefined), showsCredit({ enabled: false, balance: 0 }), showsCredit({ enabled: false, balance: 0.01 }), showsCredit({ enabled: true, balance: 0 })]).toEqual([false, false, true, true])
    expect([lineKind({ type: 'earn', reference_type: 'service_booking' }), lineKind({ type: 'earn', reference_type: 'scan_event' }), lineKind({ type: 'adjust', reference_type: 'member_merge' }), lineKind({ type: 'adjust', reference_type: 'member_erasure' }), lineKind({ type: 'x', reference_type: null })])
      .toEqual(['earn_appointment', 'earn_purchase', 'merge', 'forfeit', 'other'])
    expect([showsNote({ type: 'adjust', reference_type: null, note: 'Goodwill' }), showsNote({ type: 'earn', reference_type: 'service_booking', note: 'x' })]).toEqual([true, false])
    expect([signedMoney(2.25, 'EUR', 'en'), signedMoney(-5, 'EUR', 'en'), signedMoney(0, 'EUR', 'en')]).toEqual(['+€2.25', '−€5.00', '€0.00'])
  })

  // The portal's own sweep reads only portal.<lang>.json: the credit bundles are checked here, as the area's.
  const DIR = path.resolve(__dirname, '../../i18n')
  const bundle = (lang: string) => JSON.parse(fs.readFileSync(path.join(DIR, `credit.${lang}.json`), 'utf8')) as Record<string, unknown>
  const flatten = (o: unknown, prefix = ''): string[] => Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [`${prefix}${k}`]))
  const at = (json: unknown, key: string): unknown => key.split('.').reduce<unknown>((n, p) => (n && typeof n === 'object' ? (n as Record<string, unknown>)[p] : undefined), json)
  const holes = (s: unknown) => [...String(s).matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).sort()

  it('the five credit bundles carry the same keys, none empty, every placeholder kept', () => {
    const en = bundle('en')
    for (const lang of ['ru', 'de', 'fr', 'es']) {
      const other = bundle(lang)
      expect(flatten(other).sort(), lang).toEqual(flatten(en).sort())
      for (const key of flatten(en)) {
        expect(String(at(other, key)).trim(), `${lang}:${key}`).not.toBe('')
        expect(holes(at(other, key)), `${lang}:${key}`).toEqual(holes(at(en, key)))
      }
    }
  })

  it('the English is the code’s: every literal fallback and every line word', () => {
    const en = bundle('en')
    const source = fs.readFileSync(path.join(__dirname, 'CreditBalance.tsx'), 'utf8')
    const literal = [...source.matchAll(/\bt\(\s*'portal\.credit\.([a-z_.]+)'\s*,\s*'((?:[^'\\]|\\.)*)'/g)]
    expect(literal.length).toBeGreaterThan(4)
    for (const [, key, english] of literal) expect(at(en, key), key).toBe(english)
    for (const [kind, english] of Object.entries(LINE_WORDS)) expect(at(en, `line.${kind}`), kind).toBe(english)
  })
})
