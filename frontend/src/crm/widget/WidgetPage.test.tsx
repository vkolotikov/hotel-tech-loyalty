import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CrmContext } from '../CrmProvider'
import type { Bootstrap } from '../lib/types'
import { EMBED_KEY } from './embed'
import { WIDGET_KEY } from './tabs'
import { WidgetPage } from './WidgetPage'

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
  features: { chatbot: true, engagement: true },
  ai: { status: 'under', percent: 10 },
  staff: { id: 1, name: 'Maria', role: 'manager', can: { manage_bot: true, manage_widget: true, manage_pipelines: true, manage_canned: true, manage_team: true, delete_records: true } },
  widget: { key: 'k', active: true },
  counts: { chats_waiting: 0, leads_new: 0, tasks_due: 0 },
  setup: { done: 2, total: 6, complete: false },
}

const config = { id: 4, widget_key: '3f2a9c1e-1111-2222-3333-44444444b81d', company_name: 'Hotel Riga', header_title: 'Talk to Riga', primary_color: '#1d4ed8', is_active: true, suggestions: ['Parking?'] }

function render(at: string, data: Partial<Bootstrap> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(WIDGET_KEY, config)
  client.setQueryData(EMBED_KEY, { embed_code: '<script>window.HotelChat={key:"3f2a"}</script>', iframe_code: '<iframe src="x"></iframe>', widget_key: config.widget_key })
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[at]}>
        <CrmContext.Provider value={{ data: { ...boot, ...data }, isLoading: false, isError: false, error: null, refetch: () => {} }}>
          <WidgetPage />
        </CrmContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('WidgetPage', () => {
  it('draws the look with a preview in the chosen colour and words', () => {
    const html = render('/crm/widget')
    for (const label of ['Look', 'Behaviour', 'Install', 'Style', 'Suggested questions']) expect(html).toContain(label)
    expect(html).toContain('Talk to Riga')
    expect(html).toContain('background:#1d4ed8')
    expect(html).toContain('Parking?')
  })

  it('opens the install section Get started links to, with the server\'s code and the key', () => {
    const html = render('/crm/widget?tab=install')
    expect(html).toContain('window.HotelChat')
    expect(html).toContain('3f2a9c1e…b81d')
    expect(html).toContain('WordPress')
    expect(html).toContain('Make a new API key')
  })

  it('shows staff the settings read only, without the key\'s replacement', () => {
    const can = { ...boot.staff.can, manage_widget: false }
    const staff = { staff: { ...boot.staff, role: 'staff', can } }
    expect(render('/crm/widget', staff)).toContain('Only an owner or a manager can change the chat widget')
    expect(render('/crm/widget', staff)).toContain('disabled=""')
    expect(render('/crm/widget?tab=install', staff)).not.toContain('Make a new API key')
  })

  it('lists the opening hours by weekday on the behaviour section', () => {
    const html = render('/crm/widget?tab=behaviour')
    expect(html).toContain('Opening hours')
    expect(html).toContain('Monday')
    expect(html).toContain('Ask for contact details')
  })
})
