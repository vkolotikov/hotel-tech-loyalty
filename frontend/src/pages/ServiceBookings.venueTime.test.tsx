import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * The full admin's service-booking list and its drawer, drawn with this
 * computer's clock set east of UTC (Riga, UTC+3 in October). The server
 * sends the venue's wall clock: 15:00–15:45 must read 15:00–15:45, the
 * hours the new workspace shows.
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

const { default: ServiceBookings, BookingDetailDrawer } = await import('./ServiceBookings')

const booking = {
  id: 7, booking_reference: 'SVC-1', service: { id: 3, name: 'Scalp Ritual' }, master: { id: 1, name: 'Ilze' },
  customer_name: 'Emily Johnson', customer_email: 'emily@example.test', customer_phone: null, party_size: 1,
  start_at: '2026-10-21T15:00:00.000000Z', end_at: '2026-10-21T15:45:00.000000Z', duration_minutes: 45,
  total_amount: 55, currency: 'EUR', status: 'confirmed', payment_status: 'unpaid', source: 'admin',
}

function wrap(node: React.ReactNode, prime: (qc: QueryClient) => void = () => {}): string {
  const qc = new QueryClient()
  prime(qc)
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>,
  )
}

const original = process.env.TZ
beforeEach(() => { process.env.TZ = 'Europe/Riga' })
afterEach(() => { process.env.TZ = original })

/**
 * A wall-clock time in any form this machine's locale prints it: `15:45` (24-hour locales), `3:45:00 PM`
 * (toLocaleString, en-US) or `03:45 PM` (the drawer's hour and minute in two digits, en-US).
 */
const shown = (h: number, m: string) => new RegExp(`(${h}:${m}|0?${h - 12}:${m}(:00)?\\s?PM)`)

describe('the full admin\'s service bookings, east of UTC', () => {
  it('lists a 15:00 appointment at 15:00', () => {
    const html = wrap(<ServiceBookings />, qc => qc.setQueryData(
      ['service-bookings', { page: 1 }], { data: [booking], current_page: 1, last_page: 1, total: 1 },
    ))
    expect(html).toContain('Emily Johnson')
    expect(html).toMatch(shown(15, '00'))
    expect(html).not.toMatch(shown(18, '00'))
  })

  it('opens the booking at 15:00 until 15:45', () => {
    const html = wrap(<BookingDetailDrawer booking={booking} onClose={() => {}} onChanged={() => {}} />)
    expect(html).toMatch(shown(15, '00'))
    expect(html).toMatch(shown(15, '45'))
    expect(html).not.toMatch(shown(18, '00'))
    expect(html).not.toMatch(shown(18, '45'))
  })
})
