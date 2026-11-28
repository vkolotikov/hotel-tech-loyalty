import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CrmContext } from '../CrmProvider'
import whatsappWords from '../i18n/whatsapp.en.json'
import type { Bootstrap } from '../lib/types'
import { INTEGRATION_KEYS } from './integrationsApi'
import { IntegrationsPage } from './IntegrationsPage'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const word = key.startsWith('crm.whatsapp.') && key.slice(13).split('.').reduce<unknown>(
        (node, part) => (node as Record<string, unknown> | undefined)?.[part], whatsappWords,
      )
      const text = typeof fallback === 'string' ? fallback : typeof word === 'string' ? word : key
      const values = typeof fallback === 'object' ? fallback : vars ?? {}
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String(values[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))
vi.mock('../../lib/api', () => ({ api: {}, resolveImage: (url: string | null | undefined) => url ?? null }))

const boot: Bootstrap = {
  name: 'HexaTech CRM',
  organization: { id: 7, name: 'Harbour Clinic', industry: 'medical' },
  accent: null,
  venue: { timezone: 'Europe/Riga', today: '2026-11-04', currency: 'EUR' },
  features: { chatbot: true, engagement: true, ai_capture: true },
  ai: { status: 'under', percent: 40 },
  staff: { id: 1, name: 'Laura', role: 'manager', can: { manage_bot: true, manage_widget: true, manage_pipelines: true, manage_canned: true, manage_team: true, delete_records: true, manage_integrations: true } },
  widget: { key: 'k', active: true },
  counts: { chats_waiting: 0, leads_new: 0, tasks_due: 0 },
  setup: { done: 2, total: 6, complete: false },
  brands: [{ id: 3, name: 'Harbour', is_default: true, color: null, logo: null }, { id: 4, name: 'Spa', is_default: false, color: null, logo: null }],
}

function render(at: string, data: Partial<Bootstrap> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(INTEGRATION_KEYS.tokens, { data: [{ id: 9, label: 'website_form', last_used_at: null, created_at: '2026-11-03T10:00:00Z' }], limit: 20 })
  client.setQueryData(INTEGRATION_KEYS.mail, {
    from_name: null, reply_to: 'hello@harbour.test', defaults: { from_name: 'Harbour Clinic', reply_to: 'desk@harbour.test' },
    identity: { from_name: 'Harbour Clinic', from_address: 'noreply@platform.test', reply_to: 'hello@harbour.test' }, can_change: false,
  })
  client.setQueryData(INTEGRATION_KEYS.ai, {
    month: '2026-11', today: '2026-11-04', budget: { status: 'under', used_cents: 1000, cap_cents: 2500, percent: 40 },
    plan: { modules: ['crm'], tiers: { crm: 'standard' } },
    by_feature: [{ feature: 'website_chatbot', cost_cents: 800, calls: 2 }, { feature: 'crm_draft', cost_cents: 200, calls: 1 }],
    by_day: [{ day: '2026-11-01', cost_cents: 0, calls: 0 }, { day: '2026-11-02', cost_cents: 300, calls: 1 }, { day: '2026-11-03', cost_cents: 0, calls: 0 }, { day: '2026-11-04', cost_cents: 700, calls: 2 }],
    calls: 3,
  })
  client.setQueryData(INTEGRATION_KEYS.messengerConfig, { configured: true, app_id: '1', graph_version: 'v25.0', required_scopes: [], subscribed_fields: [] })
  client.setQueryData(INTEGRATION_KEYS.messenger, [{ id: 5, channel: 'messenger', external_id: '111', display_name: 'Harbour Page', display_avatar_url: null, status: 'reauth_required', brand_id: 3, token_verified_at: null, last_webhook_at: null, last_error: 'Token expired', created_at: null }])
  client.setQueryData(['crm', 'whatsapp-status', data.brand_id], { available: true, state: 'setup_required', message_count: 0 })
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[at]}>
        <CrmContext.Provider value={{ data: { ...boot, ...data }, isLoading: false, isError: false, error: null, refetch: () => {} }}>
          <IntegrationsPage />
        </CrmContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const staff = { staff: { ...boot.staff, role: 'staff', can: { ...boot.staff.can, manage_integrations: false } } }

describe('IntegrationsPage', () => {
  it('opens on Lead intake for a manager: four tabs, the token list without any token, and the guide with the brands', () => {
    const html = render('/crm/integrations')
    expect(html.match(/role="tab"/g)).toHaveLength(4)
    for (const label of ['Lead intake', 'Email', 'AI usage', 'Channels']) expect(html).toContain(label)
    expect(html).toContain('aria-labelledby="integrations-section-leads"')
    expect(html).toContain('website form')
    expect(html).toContain('Never used')
    expect(html).toContain('aria-label="Revoke website form"')
    expect(html).toContain('1 of 20')
    expect(html).toContain('/api/v1/integrations/leads')
    expect(html).toContain('Authorization: Bearer YOUR_API_TOKEN')
    expect(html).toContain('Harbour · default')
    expect(html).toContain('&quot;brand_id&quot;: 3,')
  })

  it('shows staff only the sender, read only, with how the next email reads', () => {
    const html = render('/crm/integrations?tab=leads', staff)
    expect(html).not.toContain('role="tab"')
    expect(html).not.toContain('API tokens')
    expect(html).toContain('Only an owner can change this.')
    expect(html).toContain('disabled=""')
    expect(html).toContain('Harbour Clinic')
    expect(html).toContain('&lt;noreply@platform.test&gt;')
    expect(html).toContain('hello@harbour.test')
  })

  it('draws the month against the allowance, by day and by feature', () => {
    const html = render('/crm/integrations?tab=ai')
    expect(html).toContain('$10.00')
    expect(html).toContain('of $25.00')
    expect(html).toContain('$15.00')
    expect(html).toContain('40 % used')
    expect(html).toContain('HexaTech CRM Standard')
    expect(html).toContain('aria-valuenow="40"')
    expect(html).toContain('Website assistant')
    expect(html).toContain('Inbox drafts')
    expect(html).toContain('80 % · 2 calls')
    expect(html).toContain('2026-11-04: $7.00, 2 calls')
  })

  it('lists Messenger pages and the WhatsApp widget shortcut', () => {
    const html = render('/crm/integrations?tab=channels')
    expect(html).toContain('Harbour Page')
    expect(html).toContain('Reconnect')
    expect(html).toContain('Something needs attention: run Check.')
    expect(html).not.toContain('Token expired</')
    expect(html).toContain('More for Harbour Page')
    expect(html).toContain('WhatsApp on the chat widget')
    expect(html).not.toContain('Open Contacts DB')
    expect(html).toContain('href="/crm/widget?tab=behaviour"')
  })

  it('shows the Contacts DB capture status for the connected brand', () => {
    const html = render('/crm/integrations?tab=channels', { brand_id: 23, features: { ...boot.features, whatsapp_brand_id: 23 } })
    expect(html).toContain('Setup required')
    expect(html).toContain('0 messages captured')
    expect(html).toContain('https://contacts.hexa-tech.uk/#integrations')
  })
})
