import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import type { Checklist as ChecklistData, SetupPayload } from '../lib/types'

// Keys built at run time (`setup.step.${key}`) carry no fallback, so the stub reads them from the real
// English bundle: the test checks the words a person sees.
vi.mock('react-i18next', async () => {
  const en = (await import('../i18n/appointments.en.json')).default as Record<string, unknown>
  const lookup = (key: string): unknown => key.replace(/^appointments\./, '').split('.')
    .reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), en)
  return {
    useTranslation: () => ({
      t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
        const found = lookup(key)
        const text = typeof fallback === 'string' ? fallback : typeof found === 'string' ? found : key
        return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
      },
      i18n: { language: 'en' },
    }),
  }
})
vi.mock('../lib/api', () => ({ appointmentsApi: {}, failureOf: () => ({ status: 0, code: '', message: '' }), onWorkspaceOff: () => () => {} }))

const { SetupView, tabOf } = await import('./SetupPage')
const { Checklist, ChecklistBanner } = await import('./Checklist')

const checklist: ChecklistData = {
  steps: [
    { key: 'timezone', done: true, optional: false }, { key: 'service', done: true, optional: false },
    { key: 'performer', done: false, optional: false }, { key: 'hours', done: false, optional: false },
    { key: 'online', done: false, optional: true }, { key: 'first_appointment', done: false, optional: false },
  ],
  complete: false,
}
const data = {
  can_manage: true, my_team_member_id: null, categories: [], team: [], staff_accounts: [], checklist,
  services: [{ id: 1, name: 'Deep Tissue Massage', category_id: null, duration_minutes: 45, buffer_after_minutes: 0, price: 60, currency: 'EUR', short_description: null, is_active: true, performers: [] }],
  settings: {} as SetupPayload['settings'],
} as SetupPayload

const render = (node: React.ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>)

describe('tabOf', () => {
  it('opens Services unless the address names another tab', () => {
    expect(tabOf(null)).toBe('services')
    expect(tabOf('team')).toBe('team')
    expect(tabOf('billing')).toBe('services')
  })
})

describe('Checklist', () => {
  it('counts the steps, marks the optional one and leads to where each is done', () => {
    const html = render(<Checklist checklist={checklist} onTab={() => {}} />)
    expect(html).toContain('2 of 6 done')
    expect(html).toContain('Choose who performs it')
    expect(html).toContain('Optional')
    expect(html).toContain('href="/appointments?new=1"')
  })

  it('banner: says how far setup is and links to it', () => {
    const html = render(<ChecklistBanner checklist={checklist} />)
    expect(html).toContain('Setup is not finished: 2 of 6 steps done.')
    expect(html).toContain('href="/appointments/setup"')
  })
})

describe('SetupView', () => {
  it('shows the checklist until it is complete, the tabs, and the chosen tab', () => {
    const html = render(<SetupView tab="services" onTab={() => {}} data={data} loading={false} failed={false} refresh={() => {}} />)
    expect(html).toContain('Get ready to take bookings')
    expect(html).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>Services</)
    expect(html).toContain('Deep Tissue Massage')
    expect(render(<SetupView tab="services" onTab={() => {}} data={{ ...data, checklist: { ...checklist, complete: true } }} loading={false} failed={false} refresh={() => {}} />))
      .not.toContain('Get ready to take bookings')
  })

  it('tells someone who is not a manager that setup is read-only for them', () => {
    expect(render(<SetupView tab="services" onTab={() => {}} data={{ ...data, can_manage: false }} loading={false} failed={false} refresh={() => {}} />))
      .toContain('Only an owner or a manager can change setup.')
  })
})
