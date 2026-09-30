import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ListView } from './ListView'
import { AppointmentsContext } from '../AppointmentsProvider'
import type { AppointmentSummary, Status } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => (typeof fallback === 'string' ? fallback : key), i18n: { language: 'en' } }),
}))

const appt = (id: number, start: string, status: Status, name: string): AppointmentSummary => ({
  id, reference: `SVC-${id}`, start, end: start.replace(':00', ':45'), duration_minutes: 45,
  service: { id: 1, name: 'Manicure' }, master: { id: 3, name: 'Olivia' },
  client: { id: null, name, is_member: false }, status, payment: { state: 'card_held' }, revision: 'r',
})

function render(appointments: AppointmentSummary[]) {
  return renderToStaticMarkup(
    <AppointmentsContext.Provider value={{ data: undefined, isLoading: false, isError: false, error: null, refetch: () => {} }}>
      <ListView from="2026-10-05" to="2026-10-11" appointments={appointments} locale="en-GB" selectedId={2} onOpen={() => {}} />
    </AppointmentsContext.Provider>,
  )
}

describe('ListView', () => {
  it('is a table with a heading per day and a row per appointment, in time order', () => {
    const html = render([
      appt(2, '2026-10-07T11:00', 'confirmed', 'Emily Johnson'),
      appt(1, '2026-10-06T09:00', 'completed', 'Ava Martinez'),
      appt(3, '2026-10-07T09:00', 'cancelled', 'Chloe Anderson'),
    ])
    expect(html).toContain('<table')
    expect(html.indexOf('Ava Martinez')).toBeLessThan(html.indexOf('Chloe Anderson'))
    expect(html.indexOf('Chloe Anderson')).toBeLessThan(html.indexOf('Emily Johnson'))
    expect((html.match(/scope="colgroup"/g) ?? []).length).toBe(2) // two days have appointments
    expect(html).toContain('09:00 – 09:45')
    expect(html).toContain('Manicure')
    expect(html).toContain('Olivia')
  })

  it('names the status and the payment in words on every row', () => {
    const html = render([appt(1, '2026-10-06T09:00', 'no_show', 'Ava Martinez')])
    expect(html).toContain('appointments.status.no_show')
    expect(html).toContain('appointments.payment.card_held')
  })

  it('opens a row with a button and marks the open one', () => {
    const html = render([appt(1, '2026-10-06T09:00', 'confirmed', 'Ava Martinez'), appt(2, '2026-10-06T10:00', 'confirmed', 'Emily Johnson')])
    expect((html.match(/<button/g) ?? []).length).toBe(2)
    expect(html).toMatch(/aria-current="true"[^>]*>[\s\S]*?Emily Johnson/)
  })

  it('says so when the range is empty', () => {
    expect(render([])).toContain('No appointments in this period.')
  })
})
