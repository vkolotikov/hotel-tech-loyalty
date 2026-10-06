import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { AppointmentDetail } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('../lib/vocab', () => ({ useVocab: () => (k: string) => k }))
vi.mock('react-router-dom', () => ({ Link: ({ to, children }: { to: string; children: unknown }) => <a href={to}>{children as never}</a> }))

const { MoveForm } = await import('./MoveForm')
const { AppointmentView } = await import('./AppointmentView')
const { lengthBody, lengthChoices, lengthLabel } = await import('./lengths')

const booking = {
  id: 3, reference: 'SVC-3', start: '2026-10-06T10:00', end: '2026-10-06T11:30', duration_minutes: 90, length_set_by_staff: true,
  service: { id: 1, name: 'Massage' }, master: { id: 1, name: 'Mara' },
  client: { id: 5, name: 'Sophie', phone: null, email: null, member: null }, client_email: null, status: 'confirmed', revision: 'r',
  payment: { state: 'not_paid_online', raw: 'unpaid', amount: 60, refunded_amount: null, carries_card_payment: false, currency: 'EUR' },
  price: { total: 60, list: null, discount_label: null, currency: 'EUR' }, source: 'admin', notes: { customer: null, staff: null },
  actions: [], loyalty: null, history: [],
} as unknown as AppointmentDetail

describe('lengths', () => {
  it('offers 15 minutes to 8 hours in 15-minute steps', () => {
    const choices = lengthChoices()
    expect(choices[0]).toBe(15)
    expect(choices[choices.length - 1]).toBe(480)
    expect(choices).toHaveLength(32)
  })

  it('words a length in minutes, hours, or both', () => {
    expect(lengthLabel(45)).toMatchObject({ key: 'appointments.panel.length_min', vars: { m: 45 } })
    expect(lengthLabel(60)).toMatchObject({ key: 'appointments.panel.length_h', vars: { h: 1 } })
    expect(lengthLabel(90)).toMatchObject({ key: 'appointments.panel.length_h_min', vars: { h: 1, m: 30 } })
  })

  it('sends a length, forgets the staff one, or keeps it', () => {
    expect(lengthBody(90, false)).toEqual({ length: 90 })
    expect(lengthBody('normal', true)).toEqual({ normal_length: true })
    expect(lengthBody('normal', false)).toEqual({})
  })
})

describe('the Move form and the panel', () => {
  it('starts the Length field at the length staff set', () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <MoveForm booking={booking} masters={[{ id: 1, name: 'Mara', title: null, avatar: null, days: {} }]}
          services={[{ id: 1, name: 'Massage', duration_minutes: 45, buffer_after_minutes: 0, price: 60, currency: 'EUR', master_ids: [1] }]}
          today="2026-10-05" saving={false} error={null} tell={false} onTell={() => {}} onMove={() => {}} onBack={() => {}} />
      </QueryClientProvider>,
    )
    expect(html).toContain('Length')
    expect(html).toContain('Normal length')
    expect(html).toMatch(/<option value="90" selected="">1 h 30 min<\/option>/)
  })

  it('says when the length was set by staff', () => {
    const view = (b: AppointmentDetail) => renderToStaticMarkup(
      <AppointmentView booking={b} zone="Europe/London" locale="en-GB" saving={false} error={null} outcome={null} onAction={() => {}} />,
    )
    expect(view(booking)).toContain('Length set by staff')
    expect(view({ ...booking, length_set_by_staff: false })).not.toContain('Length set by staff')
  })
})
