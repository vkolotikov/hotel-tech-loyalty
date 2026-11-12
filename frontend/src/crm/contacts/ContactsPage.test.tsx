import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CrmContext } from '../CrmProvider'
import type { Bootstrap } from '../lib/types'
import { CompanyRecordPanel } from './CompanyRecord'
import { ContactPage } from './ContactPage'
import { ContactRecordPanel } from './ContactRecord'
import { ContactsPage } from './ContactsPage'
import { ACTIVITY_TYPES, COMPANY_STATUSES, SORT_KEYS, activityKey, companyStatusKey, listParams, filtersFrom, reasonKey } from './contactsLogic'
import { CONTACTS_TABS } from './tabs'
import type { CompanyDetail, Guest, Paginated } from './types'

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
const clinic: Bootstrap = { ...boot, organization: { id: 7, name: 'Harbour Clinic', industry: 'medical' } }

const ada: Guest = {
  id: 12, full_name: 'Ada Lovelace', first_name: null, last_name: null, email: 'ada@example.org', phone: '+371 2000 0000', mobile: null,
  company: 'Analytical Engines', position_title: 'Founder', country: 'Latvia', city: 'Riga', lead_source: 'Website', owner_name: null,
  lifecycle_status: 'Prospect', importance: 'VIP', notes: 'Prefers email.', created_at: '2026-11-01T09:00:00Z', tags: [{ id: 4, name: 'Press' }],
  guest_type: 'Individual', vip_level: 'Standard', custom_data: { diet: ['Vegan'] },
}
const dietField = { id: 1, entity: 'guest', key: 'diet', label: 'Diet', type: 'multiselect', config: { options: ['Vegan', 'Halal'] }, help_text: null, required: false, sort_order: 0 }
const berg: CompanyDetail = {
  id: 3, company_name: 'Berg AB', industry: 'Retail', tax_id: null, billing_address: null, billing_email: 'bills@berg.example', contact_person: 'Bo',
  contact_email: 'bo@berg.example', contact_phone: '+46 8 123 456', account_manager: 'Anna', contract_start: null, contract_end: '2027-01-31',
  payment_terms: 'Net 30', credit_limit: '5000.00', discount_percentage: '12.50', negotiated_rate: '120.00', rate_type: 'Fixed Rate',
  annual_room_nights_target: 300, status: 'Active', notes: null, inquiries_count: 1,
  ltv: { open_pipeline_value: 1200, open_pipeline_count: 1, last_contact_at: null, renewal_soon: false },
  recent_inquiries: [{ id: 81, guest_name: 'Ada Lovelace', inquiry_type: 'Conference', total_value: '1200.00', status: 'New', created_at: '2026-11-02T10:00:00Z' }],
}
const peopleAt = (name: string) => ['crm', 'contacts', 'list', 'at', { company: name, sort: 'full_name', dir: 'asc', per_page: 50 }]

function render(at: string, seed: (qc: QueryClient) => void, { bootstrap = boot, element }: { bootstrap?: Bootstrap; element?: ReactNode } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  seed(qc)
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[at]}>
        <CrmContext.Provider value={{ data: bootstrap, isLoading: false, isError: false, error: null, refetch: () => {} }}>
          {element ?? (
            <Routes>
              <Route path="/crm/contacts" element={<ContactsPage />} />
              <Route path="/crm/contacts/:id" element={<ContactPage />} />
            </Routes>
          )}
        </CrmContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const seedAda = (qc: QueryClient) => {
  qc.setQueryData(['crm', 'contacts', 'one', 12], ada)
  qc.setQueryData(['crm', 'contacts', 'leads', 12], { data: [{ id: 81, status: 'New', inquiry_type: 'Wedding', source: null, total_value: '1200.00', next_task_type: null, next_task_due: '2026-11-09', next_task_completed: false, created_at: '2026-11-02T10:00:00Z' }] })
  qc.setQueryData(['crm', 'contacts', 'timeline', 12], { data: [{ id: 5, type: 'call', description: 'Rang about dates', performed_by: 'Anna', created_at: '2026-11-03T10:00:00Z' }] })
  qc.setQueryData(['crm', 'contacts', 'custom-fields', 'guest'], [dietField])
  qc.setQueryData(['crm', 'contacts', 'duplicates'], { pairs: [{ reason: 'shared_email', winner: { ...ada, id: 9, full_name: 'Ada L' }, loser: ada }] })
}

describe('Contacts, rendered', () => {
  it('lists people, each opening in its panel over the list, with no loyalty words', () => {
    const page: Paginated<Guest> = { data: [ada], current_page: 1, last_page: 1, total: 1, per_page: 25 }
    const html = render('/crm/contacts', qc => {
      qc.setQueryData(['crm', 'contacts', 'list', listParams(filtersFrom(new URLSearchParams()), 1)], page)
      qc.setQueryData(['crm', 'contacts', 'tags'], [{ id: 4, name: 'Press' }])
      qc.setQueryData(['crm', 'contacts', 'duplicates'], { pairs: [] })
    })
    expect(html).toContain('Contacts')
    expect(html).toContain('href="/crm/contacts?contact=12"')
    expect(html).toContain('Ada Lovelace')
    expect(html).toContain('Founder · Analytical Engines')
    expect(html).toContain('Choose Ada Lovelace')
    expect(html).toContain('aria-label="Filters"')
    expect(html).toContain('aria-label="Saved views"')
    expect(html).toContain('aria-label="Export"')
    expect(html).not.toMatch(/loyalty|points|member/i)
    // The page's sentence is a tooltip now; no sentence sits under the title.
    expect(html).not.toContain('<p class="text-sm text-a-text-2">The people and companies')
  })

  it('shows the sections as tabs with the chosen one marked, and every filter set as a chip', () => {
    const at = '/crm/contacts?lifecycle=VIP&co=Analytical%20Engines&vip=1&from=2026-11-01&nationality=LV&email=1'
    const page: Paginated<Guest> = { data: [ada], current_page: 1, last_page: 1, total: 1, per_page: 25 }
    const html = render(at, qc => {
      qc.setQueryData(['crm', 'contacts', 'list', listParams(filtersFrom(new URLSearchParams(at.split('?')[1])), 1)], page)
      qc.setQueryData(['crm', 'contacts', 'duplicates'], { pairs: [{ reason: 'shared_email', winner: {}, loser: {} }] })
    })
    expect(html).toMatch(/role="tab"[^>]*id="crm-contacts-section-people"[^>]*aria-selected="true"/)
    expect(html).toContain('id="crm-contacts-section-duplicates"')
    expect(html).toContain('role="tabpanel"')
    for (const chip of ['Lifecycle: VIP', 'Company: Analytical Engines', 'VIP', 'Added from ', 'Nationality: LV', 'Has email', 'Clear filters']) expect(html).toContain(chip)
  })

  it('says how to start when there is nobody yet, with the one action', () => {
    const html = render('/crm/contacts', qc => {
      qc.setQueryData(['crm', 'contacts', 'list', listParams(filtersFrom(new URLSearchParams()), 1)], { data: [], current_page: 1, last_page: 1, total: 0, per_page: 25 })
    })
    expect(html).toContain('No contacts yet')
    expect(html).not.toContain('People who leave their details')
  })

  it('lists companies, each opening in its panel, and the pairs that look like one person', () => {
    const companies = render('/crm/contacts?tab=companies', qc => {
      qc.setQueryData(['crm', 'contacts', 'companies', { search: '', status: '', account_manager: '', page: 1, per_page: 25, sort: 'company_name', dir: 'asc' }], {
        data: [{ id: 3, company_name: 'Berg AB', industry: 'Retail', contact_person: 'Bo', account_manager: 'Anna', status: 'Active', contract_end: '2027-01-31' }],
        current_page: 1, last_page: 1, total: 1, per_page: 25,
      })
    })
    expect(companies).toContain('Berg AB')
    expect(companies).toContain('Retail · Bo')
    expect(companies).toContain('Active')
    expect(companies).toContain('href="/crm/contacts?tab=companies&amp;company=3"')
    expect(companies).toContain('Add')

    const g = (id: number, created: string) => ({ id, full_name: 'Ada L', email: 'ada@example.org', phone: null, mobile: null, company: null, city: null, country: null, lifecycle_status: null, created_at: created, last_activity_at: null })
    const duplicates = render('/crm/contacts?tab=duplicates', qc => {
      qc.setQueryData(['crm', 'contacts', 'duplicates'], { pairs: [{ reason: 'shared_email', winner: g(1, '2026-01-01T00:00:00Z'), loser: g(2, '2026-10-01T00:00:00Z') }] })
    })
    expect(duplicates).toContain('Same email')
    expect(duplicates).toContain('Older')
    expect(duplicates).toContain('Merge')
    expect(duplicates).toContain('href="/crm/contacts?tab=duplicates&amp;contact=1"')
  })
})

describe('A contact’s record', () => {
  it('draws the frame on their own page: name, standing, tags in place, ways to reach them, a new lead and the tabs with counts', () => {
    const html = render('/crm/contacts/12', seedAda)
    expect(html).toContain('Ada Lovelace')
    expect(html).toContain('Analytical Engines · ada@example.org · +371 2000 0000')
    expect(html).toContain('href="/crm/contacts/12?create=lead&amp;guest=12"')
    expect(html).toContain('href="mailto:ada@example.org"')
    expect(html).toContain('href="tel:+37120000000"')
    expect(html).toContain('href="https://wa.me/37120000000"')
    expect(html).toContain('Press')
    expect(html).toContain('Remove the tag Press')
    expect(html).toContain('aria-label="Add a tag"')
    expect(html).toContain('aria-label="More for Ada Lovelace"')
    expect(html).toContain('href="/crm/contacts"')
    for (const tab of ['Overview', 'Leads', 'Activity', 'Emails', 'Fields']) expect(html).toMatch(new RegExp(`role="tab"[^>]*>.*?${tab}`))
    // Overview: the details, changed in place, in their groups.
    expect(html).toContain('Change Email')
    for (const group of ['Contact', 'Work', 'Standing', 'Place', 'Notes']) expect(html).toContain(group)
    for (const label of ['Type', 'VIP level', 'Nationality', 'Language']) expect(html).toContain(label)
    expect(html).not.toContain('Leave it empty and save to clear it.')
  })

  it('opens each tab from the address: leads in their panel, the timeline, the organisation’s fields', () => {
    const leads = render('/crm/contacts/12?tab=leads', seedAda)
    expect(leads).toContain('href="/crm/contacts/12?tab=leads&amp;lead=81"')
    expect(leads).toContain('Wedding')
    expect(leads).toContain('Next step')
    const activity = render('/crm/contacts/12?tab=activity', seedAda)
    expect(activity).toContain('Rang about dates')
    expect(activity).toContain('aria-pressed="true"')
    const fields = render('/crm/contacts/12?tab=fields', seedAda)
    expect(fields).toContain('Diet')
    expect(fields).toContain('Vegan')
    expect(fields).toContain('Edit')
  })

  it('in its panel: a dialog with previous, next, the full page on the same tab, and close', () => {
    const html = render('/crm/contacts?contact=12&rtab=activity', seedAda, {
      element: <ContactRecordPanel id={12} tab="activity" onTab={() => {}} onClose={() => {}} onPrev={null} onNext={() => {}} />,
    })
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-label="Ada Lovelace"')
    expect(html).toContain('href="/crm/contacts/12?tab=activity"')
    expect(html).toContain('Rang about dates')
    expect(html).toMatch(/aria-label="Previous"[^>]*disabled/)
  })

  it('says a contact that cannot exist is not here', () => {
    expect(render('/crm/contacts/abc', () => {})).toContain('This is no longer here')
  })
})

describe('A company’s record', () => {
  const seedBerg = (qc: QueryClient) => {
    qc.setQueryData(['crm', 'contacts', 'company', 3], berg)
    qc.setQueryData(['crm', 'contacts', 'custom-fields', 'corporate_account'], [])
    qc.setQueryData(peopleAt('Berg AB'), { data: [{ ...ada, company: 'Berg AB' }], current_page: 1, last_page: 1, total: 1, per_page: 50 })
  }
  const panel = (tab: string | null) => <CompanyRecordPanel id={3} tab={tab} onTab={() => {}} onClose={() => {}} onPrev={null} onNext={null} />

  it('shows a hotel its fields with the rate and room nights, the vitals that say something, and ways to reach the contact', () => {
    const html = render('/crm/contacts?tab=companies&company=3', seedBerg, { element: panel(null) })
    expect(html).toContain('Berg AB')
    expect(html).toContain('Retail · Bo · bo@berg.example')
    expect(html).toContain('href="mailto:bo@berg.example"')
    for (const label of ['Industry', 'Discount %', 'Negotiated rate', 'Rate type', 'Room nights a year', 'Payment terms', 'Billing email']) expect(html).toContain(label)
    expect(html).toContain('12.5 %')
    expect(html).toContain('Open pipeline')
    expect(html).not.toContain('Last contact')
    expect(html).toMatch(/role="tab"[^>]*>.*?People.*?>1</)
  })

  it('keeps the hotel’s words from any other venue, and lists its people opening in their panel', () => {
    const html = render('/crm/contacts?tab=companies&company=3', seedBerg, { element: panel(null), bootstrap: clinic })
    expect(html).toContain('Discount %')
    expect(html).not.toContain('Negotiated rate')
    expect(html).not.toContain('Room nights a year')
    const people = render('/crm/contacts?tab=companies&company=3', seedBerg, { element: panel('people') })
    expect(people).toContain('href="/crm/contacts?tab=companies&amp;contact=12"')
    expect(people).toContain('Ada Lovelace')
    const leads = render('/crm/contacts?tab=companies&company=3', seedBerg, { element: panel('leads') })
    expect(leads).toContain('href="/crm/contacts?tab=companies&amp;lead=81"')
    const fields = render('/crm/contacts?tab=companies&company=3', seedBerg, { element: panel('fields') })
    expect(fields).toContain('No fields of your own yet')
    expect(fields).not.toContain('Set up fields')
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
