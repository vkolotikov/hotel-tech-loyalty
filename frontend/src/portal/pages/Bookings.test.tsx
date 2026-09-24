import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PortalContext, type PortalContextValue } from '../PortalProvider'
import { BookingRow, paymentLabel, statusTone } from './BookingRow'
import type { PortalBooking, PortalBootstrap } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, fallback?: string | Record<string, unknown>, opts?: Record<string, unknown>) => {
      const vars = typeof fallback === 'object' ? fallback : opts
      let text = typeof fallback === 'string' ? fallback : k
      for (const [key, v] of Object.entries(vars ?? {})) text = text.replace(`{{${key}}}`, String(v))
      return text
    },
    i18n: { language: 'en' },
  }),
}))

const data = {
  venue: { timezone: 'Europe/Riga', name: 'Numa', industry: 'beauty', currency: 'EUR', logo_url: null, contact: { email: null, phone: null },
    accent: { hex: '#b04a6e', ink: '#ffffff', deep: '#8e3b58', dark_hex: '#e38ab0', dark_ink: '#1a0b12', dark_deep: '#f0b4cd' }, display_face: 'cormorant' },
  capabilities: { loyalty: true, services: true, stays: false, chat: true, payments: { services: false, stays: false, publishable_key: null } },
  policies: { services_cancel_hours: 24, booking_cancel_hours: 48, services_cancellation_policy: '' },
  member: null, counts: { unread_notifications: 0, upcoming_bookings: 1 },
} as PortalBootstrap

const service: PortalBooking = {
  kind: 'service', id: 7, reference: 'SVC-ABC12345', title: 'Facial', subtitle: 'Mara', starts_at: '2026-10-03T07:30:00Z', ends_at: '2026-10-03T08:15:00Z',
  status: 'confirmed', payment_status: 'unpaid', total: 60, currency: 'EUR', discount: null, can_cancel: false, cancel_deadline: null,
  notes: null, party_size: 1, guests: null, nights: null,
}
const stay: PortalBooking = { ...service, kind: 'stay', id: 9, reference: 'BK-1', title: 'Sea view', subtitle: null, starts_at: '2026-10-10', ends_at: '2026-10-12', total: 240, status: 'cancelled', guests: 2, nights: 2 }

function render(b: PortalBooking) {
  const value: PortalContextValue = { data, isLoading: false, isError: false, error: null, refetch: () => {} }
  return renderToStaticMarkup(<MemoryRouter><PortalContext.Provider value={value}><BookingRow booking={b} onOpen={() => {}} /></PortalContext.Provider></MemoryRouter>)
}

describe('BookingRow', () => {
  it('renders an appointment in the venue timezone with its price and status', () => {
    const html = render(service)
    expect(html).toContain('Facial')
    expect(html).toContain('10:30')
    expect(html).toContain('€60.00')
    expect(html).toContain('Confirmed')
  })
  it('renders a stay as calendar dates with nights and guests', () => {
    const html = render(stay)
    expect(html).toContain('10 Oct 2026')
    expect(html).toContain('2 nights · 2 guests')
    expect(html).toContain('Cancelled')
  })
  it('maps statuses to tones', () => {
    expect(statusTone('confirmed')).toBe('success')
    expect(statusTone('pending')).toBe('warning')
    expect(statusTone('cancelled')).toBe('danger')
    expect(statusTone('completed')).toBe('neutral')
  })
  it('translates a known payment status and hides an unknown one', () => {
    const { t } = useTranslation()
    expect(paymentLabel('disputed', t)).toBe('Payment under review')
    expect(paymentLabel('weird', t)).toBeNull()
  })
})
