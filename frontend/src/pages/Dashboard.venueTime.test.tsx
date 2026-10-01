import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * The dashboard's "today" services, drawn with this computer's clock set
 * east of UTC (Riga, UTC+3 in October): a 15:00 appointment reads 15:00.
 */
vi.mock('../lib/api', () => ({ api: { get: () => new Promise(() => {}) }, APP_BASE: '' }))
vi.mock('../stores/authStore', () => ({
  useAuthStore: (selector?: (s: unknown) => unknown) => {
    const state = { user: { user_type: 'staff', organization: { industry: 'beauty' } } }
    return selector ? selector(state) : state
  },
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | { defaultValue?: string }) =>
      typeof fallback === 'string' ? fallback : fallback?.defaultValue ?? key,
    i18n: { language: 'en' },
  }),
}))

const { Dashboard } = await import('./Dashboard')

const original = process.env.TZ
beforeEach(() => {
  process.env.TZ = 'Europe/Riga'
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-21T09:00:00Z')) // 12:00 in Riga
})
afterEach(() => {
  vi.useRealTimers()
  process.env.TZ = original
})

describe('the dashboard, east of UTC', () => {
  it('lists today\'s 15:00 appointment at 15:00', () => {
    const qc = new QueryClient()
    qc.setQueryData(['dashboard-service-bookings-month', '2026-10'], {
      bookings: [{ id: 7, customer_name: 'Emily Johnson', start_at: '2026-10-21T15:00:00.000000Z', service_name: 'Scalp Ritual' }],
    })
    const html = renderToStaticMarkup(
      <QueryClientProvider client={qc}><MemoryRouter><Dashboard /></MemoryRouter></QueryClientProvider>,
    )
    expect(html).toContain('Emily Johnson')
    expect(html).toMatch(/(15:00|03:00\s?PM) · Scalp Ritual/)
  })
})
