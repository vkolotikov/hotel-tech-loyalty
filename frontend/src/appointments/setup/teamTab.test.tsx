import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import type { Bootstrap, SetupPayload, SetupTeamMember } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('../lib/api', () => ({ appointmentsApi: {}, failureOf: () => ({ status: 0, code: '', message: '' }), onWorkspaceOff: () => () => {} }))

const { AppointmentsContext } = await import('../AppointmentsProvider')
const { TeamTab } = await import('./TeamTab')
const { TeamEditor, teamBodyOf, teamDraftOf } = await import('./TeamEditor')

const mara: SetupTeamMember = {
  id: 2, name: 'Mara Ilves', title: 'Therapist', email: 'mara@example.test', phone: null, user_id: 13, is_active: true,
  services: [{ id: 1, duration_minutes: 50, price: null }],
  week: [{ day_of_week: 1, start_time: '09:00', end_time: '17:00', is_active: true }],
  time_off: [{ id: 5, date: '2026-10-09', start_time: null, end_time: null, reason: 'Holiday' }],
}
const data: SetupPayload = {
  can_manage: true, my_team_member_id: null,
  services: [{ id: 1, name: 'Deep Tissue Massage', category_id: null, duration_minutes: 45, buffer_after_minutes: 0, price: 60, currency: 'EUR', short_description: null, is_active: true, performers: [] }],
  categories: [], team: [mara], staff_accounts: [{ user_id: 13, name: 'Mara Ilves', email: 'mara@example.test' }],
  checklist: { steps: [], complete: true }, settings: {} as SetupPayload['settings'],
}
const boot = { venue: { today: '2026-10-05', timezone: 'Europe/Riga', timezone_named: true, currency: 'EUR' }, organization: { id: 1, name: 'Lumière', industry: 'beauty' } } as Bootstrap

const render = (node: React.ReactNode) => renderToStaticMarkup(
  <MemoryRouter>
    <AppointmentsContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {} }}>{node}</AppointmentsContext.Provider>
  </MemoryRouter>,
)

describe('the team form', () => {
  it('reads a person into a draft and writes back what the server takes', () => {
    const draft = teamDraftOf(mara, data.services)
    expect(draft.services[1]).toEqual({ on: true, duration: '50', price: '' })
    expect(teamBodyOf({ ...draft, phone: ' +371 2000 0000 ' })).toEqual({
      name: 'Mara Ilves', title: 'Therapist', email: 'mara@example.test', phone: '+371 2000 0000', user_id: 13, is_active: true,
      services: [{ id: 1, duration_minutes: 50, price: null }],
    })
  })
})

describe('TeamTab', () => {
  it('lists the team and offers New team member to a manager', () => {
    const html = render(<TeamTab data={data} refresh={() => {}} />)
    expect(html).toContain('Mara Ilves')
    expect(html).toContain('Services: 1')
    expect(html).toContain('New team member')
    expect(html).not.toContain('My time off')
  })

  it('gives a team member who is not a manager their own time off', () => {
    const html = render(<TeamTab data={{ ...data, can_manage: false, my_team_member_id: 2, staff_accounts: [] }} refresh={() => {}} />)
    expect(html).toContain('My time off')
    expect(html).toContain('Holiday')
    expect(html).toContain('Add time off')
    expect(html).not.toContain('New team member')
  })

  it('tells someone whose sign-in is not linked how to get it linked', () => {
    expect(render(<TeamTab data={{ ...data, can_manage: false, staff_accounts: [] }} refresh={() => {}} />)).toContain('A manager can link it under Team.')
  })
})

describe('TeamEditor', () => {
  it('shows the profile, the sign-in, the services, the week and the time off', () => {
    const html = render(<TeamEditor member={mara} data={data} onClose={() => {}} onChanged={() => {}} />)
    expect(html).toContain('value="Therapist"')
    expect(html).toMatch(/<option value="13" selected="">Mara Ilves/)
    expect(html).toContain('Deep Tissue Massage')
    expect(html).toContain('Save hours')
    expect(html).toContain('Holiday')
  })

  it('asks only for the profile of a new person', () => {
    const html = render(<TeamEditor member={null} data={data} onClose={() => {}} onChanged={() => {}} />)
    expect(html).toContain('Save profile')
    expect(html).not.toContain('Save hours')
  })
})
