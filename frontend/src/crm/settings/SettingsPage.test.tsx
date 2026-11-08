import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CrmContext } from '../CrmProvider'
import type { Bootstrap } from '../lib/types'
import { SettingsPage } from './SettingsPage'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('../../lib/api', () => ({ api: {}, resolveImage: (url: string | null | undefined) => url ?? null }))

const boot: Bootstrap = {
  name: 'HexaTech CRM',
  organization: { id: 7, name: 'Hotel Riga', industry: 'hotel' },
  accent: null,
  venue: { timezone: 'Europe/Riga', today: '2026-11-07', currency: 'EUR' },
  features: { chatbot: true, engagement: true, ai_capture: true },
  ai: { status: 'under', percent: 10 },
  staff: { id: 1, name: 'Maria', role: 'manager', can: { manage_bot: true, manage_widget: true, manage_pipelines: true, manage_canned: true, manage_team: true, delete_records: true } },
  widget: { key: 'k', active: true },
  counts: { chats_waiting: 0, leads_new: 0, tasks_due: 0 },
  setup: { done: 2, total: 6, complete: false },
}

const pipelines = [{
  id: 1, name: 'Sales', slug: 'sales', description: null, is_default: true, sort_order: 0, inquiries_count: 4,
  stages: [
    { id: 11, name: 'New', slug: 'new', color: '#3b82f6', kind: 'open', sort_order: 0, default_win_probability: 10, inquiries_count: 3 },
    { id: 12, name: 'Confirmed', slug: 'confirmed', color: '#22c55e', kind: 'won', sort_order: 1, default_win_probability: 100, inquiries_count: 1 },
    { id: 13, name: 'Lost', slug: 'lost', color: '#ef4444', kind: 'lost', sort_order: 2, default_win_probability: 0, inquiries_count: 0 },
  ],
}]

function render(at: string, data: Partial<Bootstrap> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(['crm', 'settings', 'canned'], { canned_responses: [{ label: 'Opening hours', text: 'We open at 9.' }] })
  client.setQueryData(['crm', 'settings', 'pipelines'], pipelines)
  client.setQueryData(['crm', 'settings', 'lost-reasons', 'all'], [{ id: 1, label: 'Too expensive', slug: 'p', sort_order: 0, is_active: true, inquiries_count: 2 }])
  client.setQueryData(['crm', 'settings', 'lost-reasons', 'active'], [{ id: 1, label: 'Too expensive', slug: 'p', sort_order: 0 }])
  client.setQueryData(['crm', 'settings', 'lead-forms'], [{ id: 5, name: 'Weddings', embed_key: 'abc', description: null, is_active: true, submission_count: 2, last_submitted_at: null, updated_at: null }])
  client.setQueryData(['crm', 'settings', 'custom-fields'], [{ id: 1, entity: 'inquiry', key: 'budget', label: 'Budget', type: 'number', config: null, help_text: null, required: true, is_active: true, show_in_list: false, sort_order: 0 }])
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[at]}>
        <CrmContext.Provider value={{ data: { ...boot, ...data }, isLoading: false, isError: false, error: null, refetch: () => {} }}>
          <SettingsPage />
        </CrmContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const staff = { staff: { ...boot.staff, role: 'staff', can: { ...boot.staff.can, manage_canned: false, manage_pipelines: false, manage_team: false } } }

describe('SettingsPage', () => {
  it('shows its five sections as cards with captions and opens on the canned replies, editable for a manager and read only for staff', () => {
    const html = render('/crm/settings')
    for (const label of ['Canned replies', 'Pipelines', 'Lead forms', 'Custom fields', 'Account']) expect(html).toContain(label)
    expect(html.match(/role="tab"/g)).toHaveLength(5)
    expect(html).toContain('aria-labelledby="settings-section-canned"')
    expect(html).toContain('Short answers the team inserts in the inbox.')
    expect(html).toContain('value="Opening hours"')
    expect(html).toContain('aria-label="Move Opening hours down"')
    expect(html).toContain('1 of 50')
    expect(html).not.toContain('Unsaved changes')
    const read = render('/crm/settings', staff)
    expect(read).toContain('Opening hours')
    expect(read).not.toContain('value="Opening hours"')
    expect(read).toContain('Only an owner or a manager can change this')
  })

  it('opens the pipelines Get started links to, with stages in aligned columns, their kinds, and the lost reasons', () => {
    const html = render('/crm/settings?tab=pipelines')
    expect(html).toContain('Sales')
    expect(html).toContain('Default')
    expect(html).toContain('Confirmed')
    expect(html).toContain('3 leads')
    expect(html).toContain('What it means')
    expect(html).toContain('role="columnheader"')
    expect(html).toContain('Too expensive')
    expect(html).toContain('Used on 2 leads')
    expect(html).toContain('aria-label="Move New down"')
    expect(html).toContain('Add a stage')
    const read = render('/crm/settings?tab=pipelines', staff)
    expect(read).not.toContain('aria-label="Move New down"')
    expect(read).not.toContain('Add a stage')
  })

  it('lists lead forms and custom fields as aligned rows with their state', () => {
    const forms = render('/crm/settings?tab=forms')
    expect(forms).toContain('Weddings')
    expect(forms).toContain('Live')
    expect(forms).toContain('2 sent')
    expect(forms).toContain('1 of 1 live')
    const fields = render('/crm/settings?tab=fields')
    expect(fields).toContain('Budget')
    expect(fields).toContain('Required')
    expect(fields).toContain('Fields on leads')
    expect(fields).toContain('Number')
  })

  it('links to the account\'s own pages as two cards', () => {
    const html = render('/crm/settings?tab=account')
    expect(html).toContain('href="/account/team"')
    expect(html).toContain('href="/account/products"')
    expect(html).toContain('Open Plan &amp; products')
  })
})
