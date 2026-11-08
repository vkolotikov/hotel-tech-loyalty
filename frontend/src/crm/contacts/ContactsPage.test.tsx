import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CrmContext } from '../CrmProvider'
import type { Bootstrap } from '../lib/types'
import { ContactPage } from './ContactPage'
import { ContactsPage } from './ContactsPage'
import { ACTIVITY_TYPES, COMPANY_STATUSES, SORT_KEYS, activityKey, companyStatusKey, listParams, filtersFrom, reasonKey } from './contactsLogic'
import { CONTACTS_TABS } from './tabs'
import type { Guest, Paginated } from './types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('../../lib/api', () => ({ api: {} }))

const boot: Bootstrap = {
  name: 'HexaTech CRM',
  organization: { id: 7, name: 'Villa Riga', industry: 'hotel' },
  accent: null,
  venue: { timezone: 'Europe/Riga', today: '2026-11-07', currency: 'EUR' },
  features: { chatbot: true, engagement: true, ai_capture: true },
  ai: { status: 'under', percent: 10 },
  staff: { id: 3, name: 'Anna', role: 'staff', can: { manage_bot: false, manage_widget: false, manage_pipelines: false, manage_canned: false, manage_team: false, delete_records: true } },
  widget: null,
  counts: { chats_waiting: 0, leads_new: 0, tasks_due: 0 },
  setup: { done: 6, total: 6, complete: true },
}

const ada: Guest = {
  id: 12, full_name: 'Ada Lovelace', first_name: null, last_name: null, email: 'ada@example.org', phone: '+371 2000 0000', mobile: null,
  company: 'Analytical Engines', position_title: 'Founder', country: 'Latvia', city: 'Riga', lead_source: 'Website', owner_name: null,
  lifecycle_status: 'Prospect', importance: 'VIP', notes: 'Prefers email.', created_at: '2026-11-01T09:00:00Z', tags: [{ id: 4, name: 'Press' }],
}

function render(at: string, seed: (qc: QueryClient) => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  seed(qc)
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[at]}>
        <CrmContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {} }}>
          <Routes>
            <Route path="/crm/contacts" element={<ContactsPage />} />
            <Route path="/crm/contacts/:id" element={<ContactPage />} />
          </Routes>
        </CrmContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Contacts, rendered', () => {
  it('lists people with a link to each, the filters and no loyalty words', () => {
    const page: Paginated<Guest> = { data: [ada], current_page: 1, last_page: 1, total: 1, per_page: 25 }
    const html = render('/crm/contacts', qc => {
      qc.setQueryData(['crm', 'contacts', 'list', listParams(filtersFrom(new URLSearchParams()), 1)], page)
      qc.setQueryData(['crm', 'contacts', 'tags'], [{ id: 4, name: 'Press' }])
      qc.setQueryData(['crm', 'contacts', 'duplicates'], { pairs: [] })
    })
    expect(html).toContain('Contacts')
    expect(html).toContain('href="/crm/contacts/12"')
    expect(html).toContain('Ada Lovelace')
    expect(html).toContain('Founder · Analytical Engines')
    expect(html).toContain('Lifecycle')
    expect(html).toContain('Choose Ada Lovelace')
    expect(html).not.toMatch(/loyalty|points|member/i)
  })

  it('shows the sections as cards with the chosen one marked, and the filters in a toolbar with chips', () => {
    const at = '/crm/contacts?lifecycle=VIP&company=Analytical%20Engines'
    const page: Paginated<Guest> = { data: [ada], current_page: 1, last_page: 1, total: 1, per_page: 25 }
    const html = render(at, qc => {
      qc.setQueryData(['crm', 'contacts', 'list', listParams(filtersFrom(new URLSearchParams(at.split('?')[1])), 1)], page)
      qc.setQueryData(['crm', 'contacts', 'duplicates'], { pairs: [{ reason: 'shared_email', winner: {}, loser: {} }] })
    })
    expect(html).toMatch(/role="tab"[^>]*id="crm-contacts-section-people"[^>]*aria-selected="true"/)
    expect(html).toContain('id="crm-contacts-section-duplicates"')
    expect(html).toContain('role="tabpanel"')
    expect(html).toContain('Lifecycle: VIP')
    expect(html).toContain('Company: Analytical Engines')
    expect(html).toContain('Clear filters')
  })

  it('says how to start when there is nobody yet', () => {
    const html = render('/crm/contacts', qc => {
      qc.setQueryData(['crm', 'contacts', 'list', listParams(filtersFrom(new URLSearchParams()), 1)], { data: [], current_page: 1, last_page: 1, total: 0, per_page: 25 })
    })
    expect(html).toContain('No contacts yet')
  })

  it('shows a contact with their details, tags, a new lead for them and the way back', () => {
    const html = render('/crm/contacts/12', qc => {
      qc.setQueryData(['crm', 'contacts', 'one', 12], ada)
      qc.setQueryData(['crm', 'contacts', 'leads', 12], { data: [{ id: 81, status: 'New', inquiry_type: 'Wedding', source: null, total_value: '1200.00', next_task_type: null, next_task_due: '2026-11-09', next_task_completed: false, created_at: '2026-11-02T10:00:00Z' }] })
      qc.setQueryData(['crm', 'contacts', 'timeline', 12], { data: [{ id: 5, type: 'call', description: 'Rang about dates', performed_by: 'Anna', created_at: '2026-11-03T10:00:00Z' }] })
    })
    expect(html).toContain('Ada Lovelace')
    expect(html).toContain('href="/crm/leads?new=1&amp;guest=12"')
    expect(html).toContain('href="/crm/leads/81"')
    expect(html).toContain('href="mailto:ada@example.org"')
    expect(html).toContain('Press')
    expect(html).toContain('Rang about dates')
    expect(html).toContain('Change Email')
    expect(html).toContain('href="/crm/contacts"')
    for (const group of ['Contact', 'Work', 'Standing', 'Place', 'Notes']) expect(html).toContain(group)
    expect(html).toContain('Add a tag')
    expect(html).toContain('Remove the tag Press')
    expect(html).not.toContain('cannot be emptied')
  })

  it('lists companies with their state, and the pairs that look like one person', () => {
    const companies = render('/crm/contacts?tab=companies', qc => {
      qc.setQueryData(['crm', 'contacts', 'companies', { search: '', status: '', page: 1, per_page: 25, sort: 'company_name', dir: 'asc' }], {
        data: [{ id: 3, company_name: 'Berg AB', industry: 'Retail', contact_person: 'Bo', account_manager: 'Anna', status: 'Active', contract_end: '2027-01-31' }],
        current_page: 1, last_page: 1, total: 1, per_page: 25,
      })
    })
    expect(companies).toContain('Berg AB')
    expect(companies).toContain('Retail · Bo')
    expect(companies).toContain('Active')
    expect(companies).toContain('Add company')

    const g = (id: number, created: string) => ({ id, full_name: 'Ada L', email: 'ada@example.org', phone: null, mobile: null, company: null, city: null, country: null, lifecycle_status: null, created_at: created, last_activity_at: null })
    const duplicates = render('/crm/contacts?tab=duplicates', qc => {
      qc.setQueryData(['crm', 'contacts', 'duplicates'], { pairs: [{ reason: 'shared_email', winner: g(1, '2026-01-01T00:00:00Z'), loser: g(2, '2026-10-01T00:00:00Z') }] })
    })
    expect(duplicates).toContain('Same email')
    expect(duplicates).toContain('Older, kept by default')
    expect(duplicates).toContain('Review and merge')
    expect(duplicates).toContain('Merging cannot be undone')
  })

  it('says a contact that cannot exist is not here', () => {
    expect(render('/crm/contacts/abc', () => {})).toContain('This is no longer here')
  })
})

describe('Contacts’ words built at runtime are in all five languages', () => {
  const dir = path.resolve(__dirname, '../i18n')
  const built = [
    ...SORT_KEYS.map(k => `sorts.${k}`),
    ...CONTACTS_TABS.map(k => `tabs.${k}`),
    ...COMPANY_STATUSES.map(s => companyStatusKey(s) as string),
    ...[...ACTIVITY_TYPES, 'something_else'].map(activityKey),
    ...['shared_email', 'shared_phone', 'shared_name_context', 'other'].map(reasonKey),
  ]
  for (const lang of ['en', 'de', 'fr', 'es', 'ru']) {
    it(lang, () => {
      const words = JSON.parse(fs.readFileSync(path.join(dir, `contacts.${lang}.json`), 'utf8'))
      const at = (key: string) => key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), words)
      expect(built.filter(key => typeof at(key) !== 'string')).toEqual([])
    })
  }
})
