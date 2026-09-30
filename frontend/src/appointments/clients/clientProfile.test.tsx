import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ClientProfileView, bookAgainPath, openPath } from './ClientProfileView'
import type { AppointmentSummary, ClientProfile } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('react-router-dom', () => ({ Link: ({ to, children, className }: { to: string; children: unknown; className?: string }) => <a href={to} className={className}>{children as never}</a> }))

const appt = (id: number, start: string, status: AppointmentSummary['status']): AppointmentSummary => ({
  id, reference: `SVC-${id}`, start, end: start.replace(':00', ':45'), duration_minutes: 45,
  service: { id: 3, name: 'Manicure' }, master: { id: 2, name: 'Olivia' },
  client: { id: 5, name: 'Emily Johnson', is_member: true }, status, payment: { state: 'not_paid_online' }, revision: 'r',
})

const profile: ClientProfile = {
  client: { id: 5, name: 'Emily Johnson', phone: '+44 7700 900777', email: 'emily@example.test', member: { id: 9, number: 'HL-9', tier: 'Silver', points: 340 } },
  upcoming: [appt(11, '2026-10-09T11:00', 'confirmed')],
  past: [appt(10, '2026-09-12T15:00', 'completed')],
  matched_by_email: [appt(3, '2026-06-01T09:00', 'completed')],
  loyalty: { member: { id: 9, number: 'HL-9', tier: 'Silver', points: 340 }, benefits: [] },
  last: { service_id: 3, master_id: 2 },
}

const render = (p: ClientProfile) => renderToStaticMarkup(<ClientProfileView profile={p} locale="en-GB" />)

describe('bookAgainPath / openPath', () => {
  it('book again preselects the client, the last service and person — never a time or a price', () => {
    expect(bookAgainPath(profile)).toBe('/appointments?new=1&client=5&service=3&master=2')
    expect(bookAgainPath({ ...profile, last: { service_id: 3, master_id: null } })).toBe('/appointments?new=1&client=5&service=3')
    expect(bookAgainPath({ ...profile, last: null })).toBe('/appointments?new=1&client=5')
  })

  it('an appointment opens on its own day in the calendar', () => {
    expect(openPath(profile.upcoming[0])).toBe('/appointments?open=11&date=2026-10-09')
  })
})

describe('ClientProfileView', () => {
  it('shows contact details, the membership and a prominent Book again', () => {
    const html = render(profile)
    expect(html).toContain('Emily Johnson')
    expect(html).toContain('+44 7700 900777')
    expect(html).toContain('emily@example.test')
    expect(html).toContain('Silver')
    expect(html).toContain('340')
    expect(html).toContain('href="/appointments?new=1&amp;client=5&amp;service=3&amp;master=2"')
    expect(html).toContain('Book again')
  })

  it('lists upcoming and past appointments, each a link to the calendar', () => {
    const html = render(profile)
    expect(html).toContain('href="/appointments?open=11&amp;date=2026-10-09"')
    expect(html).toContain('href="/appointments?open=10&amp;date=2026-09-12"')
    expect(html.indexOf('Upcoming')).toBeLessThan(html.indexOf('Past'))
    expect(html).toContain('Manicure')
    expect(html).toContain('appointments.status.completed')
  })

  it('labels bookings that only share the email, and hides the section when there are none', () => {
    expect(render(profile)).toContain('Matched by email')
    expect(render({ ...profile, matched_by_email: [] })).not.toContain('Matched by email')
  })

  it('says when there is nothing yet', () => {
    const html = render({ ...profile, upcoming: [], past: [], matched_by_email: [], last: null })
    expect(html).toContain('No upcoming appointments.')
    expect(html).toContain('No past appointments.')
    expect(html).toContain('Book an appointment')
  })
})
