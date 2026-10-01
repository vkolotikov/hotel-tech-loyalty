import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * The full admin's service calendar, drawn with this computer's clock set
 * east of UTC (Riga, UTC+3 in October). The server sends the venue's wall
 * clock; the calendar must put 1 October under Thursday and show a 15:00
 * appointment at 15:00 — the hour the new workspace shows.
 */
vi.mock('../lib/api', () => ({ api: { get: () => new Promise(() => {}) }, APP_BASE: '' }))
vi.mock('../stores/authStore', () => ({
  useAuthStore: (selector?: (s: unknown) => unknown) => {
    const state = { user: { user_type: 'staff', workspaces: undefined } }
    return selector ? selector(state) : state
  },
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key, i18n: { language: 'en' } }),
}))

const { default: ServiceBookingCalendar } = await import('./ServiceBookingCalendar')

const booking = {
  id: 7, booking_reference: 'SVC-1', service_id: 3, service_master_id: 1, customer_name: 'Emily Johnson',
  start_at: '2026-10-21T15:00:00.000000Z', end_at: '2026-10-21T15:45:00.000000Z', duration_minutes: 45,
  status: 'confirmed', payment_status: 'unpaid', total_amount: 55,
  service: { id: 3, name: 'Scalp Ritual' }, master: { id: 1, name: 'Ilze' },
}

function render(): string {
  const qc = new QueryClient()
  qc.setQueryData(['service-booking-calendar', '2026-10'], { bookings: [booking] })
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <MemoryRouter><ServiceBookingCalendar /></MemoryRouter>
    </QueryClientProvider>,
  )
}

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

describe('the full admin\'s service calendar, east of UTC', () => {
  it('puts the days of October under the right weekdays', () => {
    const html = render()
    const days = [...html.matchAll(/text-\[11px\] font-bold[^"]*">(\d+)</g)].map(m => Number(m[1]))
    expect(days.slice(0, 7)).toEqual([28, 29, 30, 1, 2, 3, 4])
  })

  it('shows a 15:00 appointment at 15:00, as the workspace does', () => {
    const html = render()
    expect(html).toMatch(/>(15:00|03:00\s?PM)</)
    expect(html).not.toMatch(/>(18:00|06:00\s?PM)</)
  })
})
