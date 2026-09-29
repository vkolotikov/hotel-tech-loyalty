import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PortalContext, type PortalContextValue } from '../PortalProvider'
import { Home } from './Home'
import type { Paginated, PortalBooking, PortalBootstrap, PortalMember } from '../lib/types'

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
vi.mock('../lib/portalApi', () => ({
  portalApi: { card: () => new Promise(() => {}), bookings: () => new Promise(() => {}) },
  apiMessage: (_e: unknown, f: string) => f,
}))

const member: PortalMember = {
  member_number: 'HL-000123', name: 'Ada Lovelace', tier: { id: 2, name: 'Gold', color_hex: '#FFD700' },
  current_points: 1250, lifetime_points: 4100, referral_code: 'ADA1', progress: { percentage: 25, points_needed: 3750, next_tier: { id: 3, name: 'Platinum' } },
  recent_activity: [{ id: 1, type: 'earn', points: 120, description: 'Facial', created_at: '2026-09-01T10:00:00Z' }],
  marketing_consent: false, email_notifications: true, push_notifications: true, member_since: '2026-01-15',
  user: { id: 1, name: 'Ada Lovelace', email: 'ada@example.test', phone: null, language: 'en' }, benefits: [],
}
const base: PortalBootstrap = {
  venue: { name: 'Numa', logo_url: null, industry: 'beauty', currency: 'EUR', timezone: 'Europe/Riga', contact: { email: 'hi@numa.test', phone: null },
    accent: { hex: '#b04a6e', ink: '#ffffff', deep: '#8e3b58', dark_hex: '#e38ab0', dark_ink: '#1a0b12', dark_deep: '#f0b4cd' }, display_face: 'cormorant' },
  capabilities: { loyalty: true, services: true, stays: false, chat: true, payments: { services: false, stays: false, publishable_key: null } },
  policies: { services_cancel_hours: 24, booking_cancel_hours: 48, services_cancellation_policy: '', booking_cancellation_policy: '', check_in_time: '15:00', check_out_time: '11:00' },
  member, counts: { unread_notifications: 0, upcoming_bookings: 0 },
}

const booking: PortalBooking = {
  kind: 'service', id: 7, reference: 'SVC-ABC12345', title: 'Facial', subtitle: null, starts_at: '2026-10-03T07:30:00Z', ends_at: '2026-10-03T08:15:00Z',
  status: 'pending', payment_status: 'unpaid', total: 60, currency: 'EUR', discount: null, can_cancel: false, cancel_deadline: null,
  notes: null, party_size: 1, guests: null, nights: null, paid_online: false,
}

/** A client that already holds the upcoming-bookings answer, as if the query had landed. */
function clientWith(upcoming: PortalBooking[]) {
  const client = new QueryClient()
  const page: Paginated<PortalBooking> = { data: upcoming, meta: { scope: 'upcoming', page: 1, per_page: 1, total: upcoming.length } }
  client.setQueryData(['portal-bookings', 'upcoming', 1], page)
  return client
}

function render(data: PortalBootstrap, client = new QueryClient()) {
  const value: PortalContextValue = { data, isLoading: false, isError: false, error: null, refetch: () => {} }
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter><PortalContext.Provider value={value}><Home /></PortalContext.Provider></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Home', () => {
  it('shows the balance, the tier, the progress and the member number', () => {
    const html = render(base)
    expect(html).toContain('1,250')
    expect(html).toContain('Gold')
    expect(html).toContain('Platinum')
    expect(html).toContain('HL-000123')
    expect(html).toContain('href="/portal/rewards?tab=catalogue"')
  })

  it('hides every points element for a venue without loyalty but keeps the member number', () => {
    const html = render({ ...base, capabilities: { ...base.capabilities, loyalty: false } })
    expect(html).not.toContain('1,250')
    expect(html).not.toContain('href="/portal/rewards')
    expect(html).toContain('HL-000123')
  })

  it('offers the venue contact when it has one', () => {
    expect(render(base)).toContain('hi@numa.test')
  })

  it('does not say nothing is booked before the bookings have loaded', () => {
    expect(render(base)).not.toContain('Nothing booked yet.')
    expect(render(base, clientWith([]))).toContain('Nothing booked yet.')
  })

  it('invites the member to book when nothing is booked', () => {
    expect(render(base, clientWith([]))).toContain('href="/portal/book"')
  })

  it('offers to book a stay at a venue that only sells stays', () => {
    const html = render({ ...base, capabilities: { ...base.capabilities, services: false, stays: true } }, clientWith([]))
    expect(html).toContain('href="/portal/book"')
    expect(html).toContain('Book a stay')
  })

  it('offers nothing to book at a venue that sells neither', () => {
    const html = render({ ...base, capabilities: { ...base.capabilities, services: false, stays: false } }, clientWith([]))
    expect(html).not.toContain('href="/portal/book"')
  })

  it('labels the next booking the way the bookings list does', () => {
    const html = render(base, clientWith([booking]))
    expect(html).toContain('Facial')
    expect(html).toContain('Awaiting confirmation')
    expect(html).not.toContain('>pending<')
  })

  it('translates an activity row with no description instead of showing the raw type', () => {
    const noDescription: PortalMember = { ...member, recent_activity: [{ id: 2, type: 'earn', points: 40, description: null, created_at: '2026-09-02T10:00:00Z' }] }
    const html = render({ ...base, member: noDescription })
    expect(html).toContain('Earned')
    expect(html).not.toContain('>earn<')
  })
})
