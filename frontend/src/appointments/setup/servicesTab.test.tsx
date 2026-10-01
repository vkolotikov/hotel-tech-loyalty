import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import type { SetupPayload, SetupService } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))
// useVocab() reaches the provider module, which imports onWorkspaceOff from the same file.
vi.mock('../lib/api', () => ({ appointmentsApi: {}, failureOf: () => ({ status: 0, code: '', message: '' }), onWorkspaceOff: () => () => {} }))

const { ServicesTab, groupServices } = await import('./ServicesTab')
const { ServiceEditor, bodyOf, draftOf, saveServiceDraft } = await import('./ServiceEditor')
const { appointmentsApi } = await import('../lib/api')

const service = (id: number, name: string, category_id: number | null, is_active = true): SetupService => ({
  id, name, category_id, duration_minutes: 45, buffer_after_minutes: 0, price: 60, currency: 'EUR', short_description: null, is_active,
  performers: [{ id: 2, duration_minutes: null, price: 70 }],
})

const data: SetupPayload = {
  can_manage: true, my_team_member_id: null,
  services: [service(1, 'Deep Tissue Massage', 10), service(2, 'Scalp Ritual', null), service(3, 'Old Facial', 10, false)],
  categories: [{ id: 10, name: 'Massage' }],
  team: [{ id: 2, name: 'Mara Ilves', title: null, email: null, phone: null, user_id: null, is_active: true, services: [], week: [], time_off: [] }],
  staff_accounts: [], checklist: { steps: [], complete: true },
  settings: {} as SetupPayload['settings'],
}

const render = (node: React.ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>)

describe('groupServices', () => {
  it('groups by category in order, puts the rest under Other, hides inactive unless asked, and searches by name', () => {
    expect(groupServices(data.services, data.categories, '', false, 'Other').map(g => [g.name, g.services.map(s => s.id)])).toEqual([['Massage', [1]], ['Other', [2]]])
    expect(groupServices(data.services, data.categories, '', true, 'Other')[0].services.map(s => s.id)).toEqual([1, 3])
    expect(groupServices(data.services, data.categories, 'scalp', false, 'Other').map(g => g.name)).toEqual(['Other'])
  })
})

describe('the service form', () => {
  it('reads a service into a draft and writes back what the server takes', () => {
    const draft = draftOf(data.services[0], data.team)
    expect(draft.performers[2]).toEqual({ on: true, duration: '', price: '70' })
    expect(bodyOf({ ...draft, price: '65', buffer: '' })).toEqual({
      name: 'Deep Tissue Massage', category_id: 10, duration_minutes: 45, buffer_after_minutes: 0, price: 65,
      short_description: null, is_active: true, performers: [{ id: 2, duration_minutes: null, price: 70 }],
    })
  })

  it('starts a new service with no one performing it and an hour long', () => {
    const draft = draftOf(null, data.team)
    expect([draft.name, draft.duration, draft.performers[2].on]).toEqual(['', '60', false])
  })
})

describe('saveServiceDraft', () => {
  it('creates a new category once: going Back in the conflict dialog and saving again does not make a second one', async () => {
    const api = appointmentsApi as unknown as Record<string, ReturnType<typeof vi.fn>>
    api.createCategory = vi.fn(async () => ({ category: { id: 9, name: 'Hair' } }))
    api.updateService = vi.fn(async () => ({ affected: [{ id: 7, start: '2026-10-06T10:00', end: '2026-10-06T10:45', client: 'Sophie', service: 'Massage', team_member: 'Mara' }], total: 1 }))
    const created: number[] = []

    const first = await saveServiceDraft(data.services[0], draftOf(data.services[0], data.team), 'Hair', async () => false, (id) => created.push(id))
    expect(first).toBe(false)
    expect(created).toEqual([9])

    // The editor now holds the category's id and no pending name: the next save creates nothing.
    const second = await saveServiceDraft(data.services[0], { ...draftOf(data.services[0], data.team), category_id: 9 }, null, async () => true, (id) => created.push(id))
    expect(second).toBe(true)
    expect(api.createCategory).toHaveBeenCalledTimes(1)
    expect(api.updateService).toHaveBeenLastCalledWith(1, expect.objectContaining({ category_id: 9 }), false)
  })
})

describe('ServicesTab', () => {
  it('lists services by category with their length and price, and offers New service to a manager', () => {
    const html = render(<ServicesTab data={data} refresh={() => {}} />)
    expect(html).toContain('Massage')
    expect(html).toContain('Deep Tissue Massage')
    expect(html).toContain('45 min')
    expect(html).toContain('New service')
    expect(html).not.toContain('Old Facial')
  })

  it('offers nothing to change to someone who is not a manager', () => {
    expect(render(<ServicesTab data={{ ...data, can_manage: false }} refresh={() => {}} />)).not.toContain('New service')
  })
})

describe('ServiceEditor', () => {
  it('shows who performs it and points to the full admin for photos', () => {
    const html = render(<ServiceEditor service={data.services[0]} data={data} onClose={() => {}} onSaved={() => {}} />)
    expect(html).toContain('Mara Ilves')
    expect(html).toContain('href="/services"')
    expect(html).toContain('Save')
  })

  it('is read-only for someone who is not a manager', () => {
    const html = render(<ServiceEditor service={data.services[0]} data={{ ...data, can_manage: false }} onClose={() => {}} onSaved={() => {}} />)
    expect(html).toContain('<fieldset disabled=""')
    expect(html).not.toContain('>Save<')
  })
})
