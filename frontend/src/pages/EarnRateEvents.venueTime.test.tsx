import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { formWall, listWall } from './earnRateEventTimes'

/**
 * The full admin's boost events on the venue's clock (HexaTech Loyalty release 4, R4-6), drawn with this computer's
 * clock in Riga (UTC+3 in October) for a venue in New York: a boost from 18:00 New York time reads 18:00, not the
 * instant's UTC digits nor Riga's 01:00.
 */
vi.mock('../lib/api', () => ({ api: { get: () => new Promise(() => {}) }, APP_BASE: '' }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | { defaultValue?: string; zone?: string }) => {
      const text = typeof fallback === 'string' ? fallback : fallback?.defaultValue ?? key
      return typeof fallback === 'object' && fallback?.zone ? text.replace('{{zone}}', fallback.zone) : text
    },
    i18n: { language: 'en' },
  }),
}))

const { EarnRateEvents } = await import('./EarnRateEvents')

const original = process.env.TZ
beforeEach(() => {
  process.env.TZ = 'Europe/Riga'
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-05T09:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
  process.env.TZ = original
})

const event = {
  id: 7, name: 'Double weekend', multiplier: '2.00', is_active: true, days_of_week: null, tier_ids: null,
  starts_at: '2026-10-09T22:00:00.000000Z', ends_at: '2026-10-12T03:59:00.000000Z',
  starts_at_venue: '2026-10-09T18:00', ends_at_venue: '2026-10-11T23:59',
}

describe('the boost times', () => {
  it('the form holds the venue’s wall clock, and the instant’s digits only from a server without it', () => {
    expect(formWall('2026-10-09T18:00', '2026-10-09T22:00:00.000000Z')).toBe('2026-10-09T18:00')
    expect(formWall(undefined, '2026-10-09T22:00:00.000000Z')).toBe('2026-10-09T22:00')
    expect(formWall('not a time', null)).toBe('')
  })

  it('the list reads the venue’s wall clock whatever this computer’s zone', () => {
    expect(listWall('2026-10-09T18:00', '2026-10-09T22:00:00.000000Z')).toBe('Oct 9, 18:00')
    expect(listWall('2026-10-11T23:59', '2026-10-12T03:59:00.000000Z')).toBe('Oct 11, 23:59')
    expect(listWall(null, null)).toBe('')
  })

  it('the page lists a boost from 18:00 at the venue at 18:00', () => {
    const qc = new QueryClient()
    qc.setQueryData(['earn-rate-events'], { active: [], upcoming: [event], past: [], timezone: 'America/New_York' })
    qc.setQueryData(['admin-tiers'], { tiers: [] })
    qc.setQueryData(['admin-properties'], { properties: [] })
    const html = renderToStaticMarkup(<QueryClientProvider client={qc}><EarnRateEvents /></QueryClientProvider>)

    expect(html).toContain('Double weekend')
    expect(html).toContain('Oct 9, 18:00 → Oct 11, 23:59')
    expect(html).not.toContain('01:00')
  })
})
