import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Takings } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))

const { TakingsView } = await import('./TakingsPage')

const day: Takings = {
  date: '2026-10-05',
  totals: { EUR: { cash: { in: 60, out: 5 }, card_desk: { in: 45, out: 0 }, transfer: { in: 0, out: 0 }, other: { in: 0, out: 0 }, online_card: { in: 0, out: 0 } } },
  rows: [{ id: 1, kind: 'payment', method: 'cash', amount: 60, currency: 'EUR', note: null, by: 'Mara', at: '2026-10-05T06:00:00+00:00', reference: 'SVC-1', client: 'Sophie' }],
  online: { EUR: 120 },
}

describe('Takings', () => {
  it('totals each method in and out, lists every movement, and shows what was paid online', () => {
    const html = renderToStaticMarkup(<TakingsView data={day} locale="en" zone="Europe/Riga" />)
    expect(html).toContain('Cash')
    expect(html).toContain('Card at the desk')
    expect(html).toContain('SVC-1')
    expect(html).toContain('Sophie')
    expect(html).toContain('Paid online for this day')
    expect(html).not.toContain('Bank transfer') // methods with nothing that day are left out
  })

  it('names a correction as a correction', () => {
    const corrected: Takings = { ...day, rows: [{ ...day.rows[0], id: 2, kind: 'refund', corrects: true }] }
    expect(renderToStaticMarkup(<TakingsView data={corrected} locale="en" zone="Europe/Riga" />)).toContain('Correction')
  })

  it('says so when nothing was recorded', () => {
    expect(renderToStaticMarkup(<TakingsView data={{ ...day, totals: {}, rows: [], online: {} }} locale="en" zone="UTC" />)).toContain('No money was recorded on this day.')
  })
})
