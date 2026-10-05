import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import fs from 'node:fs'
import path from 'node:path'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_k: string, fallback: string, vars?: Record<string, unknown>) => fallback.replace(/\{\{(\w+)\}\}/g, (_, n) => String((vars ?? {})[n] ?? '')) }),
}))

const { DeskMoney } = await import('./DeskMoney')

const money = { total: 60, currency: 'EUR', held_online: 0, paid_online: 0, refunded_online: 0, paid_desk: 20, refunded_desk: 0, legacy_marked_paid: false, owed: 40, to_refund: 0, refundable_online: 0, refundable_desk: 20, paid_in: 20, paid_back: 0, can_take: true,
  movements: [{ id: 1, kind: 'payment', method: 'cash', amount: 20, currency: 'EUR', note: null, by: 'Mara', at: '2026-10-05T06:00:00+00:00' }] }

describe('DeskMoney', () => {
  it('shows the money read-only and sends staff to the workspace to take or refund', () => {
    const html = renderToStaticMarkup(<MemoryRouter><DeskMoney money={money as never} bookingId={42} /></MemoryRouter>)
    expect(html).toContain('Paid at the desk')
    expect(html).toContain('Still owed')
    expect(html).toContain('Mara')
    expect(html).toContain('/appointments?open=42')
    expect(html).not.toContain('<input')
  })

  it('names a correction as a correction', () => {
    const corrected = { ...money, movements: [{ id: 2, kind: 'refund', method: 'cash', amount: 20, currency: 'EUR', note: null, corrects: true, by: 'Mara', at: null }] }
    const html = renderToStaticMarkup(<MemoryRouter><DeskMoney money={corrected as never} bookingId={42} /></MemoryRouter>)
    expect(html).toMatch(/<p[^>]*>Correction(<!-- -->)? · /)
  })
})

describe('the Service bookings page', () => {
  it('no longer labels a booking paid', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../pages/ServiceBookings.tsx'), 'utf8')
    expect(src).not.toContain("runBulk('mark_paid')")
    expect(src).not.toMatch(/status, payment_status: paymentStatus/) // the drawer's save; the list's read-only filter stays
    expect(src).toContain('<DeskMoney')
  })

  it('is said in all five languages', () => {
    for (const lang of ['en', 'ru', 'de', 'fr', 'es']) {
      const bundle = JSON.parse(fs.readFileSync(path.resolve(__dirname, `../i18n/locales/${lang}/common.json`), 'utf8'))
      expect(Object.keys(bundle.desk_money.method).sort(), lang).toEqual(['card_desk', 'cash', 'online_card', 'other', 'transfer'])
    }
  })
})
