import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CreateForm } from './CreateForm'
import { emptyDraft, type CreateDraft } from './panelState'
import type { CalendarMaster, CatalogueService, ClientSummary, SlotsPayload } from '../lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en' },
  }),
}))

const masters: CalendarMaster[] = [
  { id: 1, name: 'Emma', title: null, avatar: null, days: {} },
  { id: 2, name: 'James', title: null, avatar: null, days: {} },
]
const services: CatalogueService[] = [
  { id: 3, name: 'Haircut & Styling', duration_minutes: 60, buffer_after_minutes: 0, price: 45, currency: 'GBP', master_ids: [1] },
  { id: 4, name: 'Beard Trim', duration_minutes: 30, buffer_after_minutes: 0, price: 20, currency: 'GBP', master_ids: [2] },
]
const slots: SlotsPayload = {
  slots: [
    { start: '2026-10-06T10:00', end: '2026-10-06T11:00', label: '10:00' },
    { start: '2026-10-06T11:00', end: '2026-10-06T12:00', label: '11:00' },
  ],
  duration_minutes: 60, price: 45, currency: 'GBP',
}
const sophie: ClientSummary = { id: 5, name: 'Sophie Williams', phone: '+44 7700 900123', email: null, member: { id: 9, number: 'HL-9', tier: 'Gold', points: 120 } }

function render(draft: Partial<CreateDraft>, extra: { slots?: SlotsPayload; error?: { code: string; message: string } } = {}) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <CreateForm
        draft={{ ...emptyDraft('2026-10-06'), ...draft }} masters={masters} services={services}
        slots={extra.slots} slotsLoading={false} today="2026-10-06" saving={false} error={extra.error ?? null}
        onEdit={() => {}} onSave={() => {}} tell onTell={() => {}}
      />
    </QueryClientProvider>,
  )
}

// The attribute, not the word: the button's class list contains `disabled:opacity-50` either way.
const SAVE_DISABLED = /<button[^>]*type="submit"[^>]* disabled=""/

describe('CreateForm', () => {
  it('offers only the services the chosen person performs', () => {
    const html = render({ masterId: 1 })
    expect(html).toContain('Haircut &amp; Styling')
    expect(html).not.toContain('Beard Trim')
  })

  it('shows the chosen client with their membership', () => {
    const html = render({ client: sophie })
    expect(html).toContain('Sophie Williams')
    expect(html).toContain('Gold')
  })

  it('reviews the end time, duration and price from the server before saving', () => {
    const html = render({ masterId: 1, serviceId: 3, client: sophie, time: '10:00' }, { slots })
    expect(html).toContain('10:00 – 11:00')
    expect(html).toContain('60 min')
    expect(html).toMatch(/£45[.,]00/) // the admin's money() uses the machine's number format
    expect(html).not.toMatch(SAVE_DISABLED)
  })

  it('will not save a time the server no longer offers, and says so', () => {
    const html = render({ masterId: 1, serviceId: 3, client: sophie, time: '09:30' }, { slots })
    expect(html).toContain('That time is no longer free')
    expect(html).toMatch(SAVE_DISABLED)
  })

  it('cannot be saved until it is complete', () => {
    expect(render({ masterId: 1, serviceId: 3, time: '10:00' }, { slots })).toMatch(SAVE_DISABLED)
  })

  it('says when the day has no free time, and that a client without an email will not be told', () => {
    const html = render({ masterId: 1, serviceId: 3, client: sophie }, { slots: { ...slots, slots: [] } })
    expect(html).toContain('No free time on this day')
    expect(html).toContain('No email address — the client will not be told.')
    expect(html).not.toContain('No message is sent to the client')
  })

  it('offers "Tell the client" once a client with an email is chosen, and nothing before', () => {
    expect(render({ masterId: 1, serviceId: 3, client: { ...sophie, email: 'sophie@example.test' } }, { slots })).toContain('Tell the client by email (sophie@example.test)')
    expect(render({ masterId: 1, serviceId: 3 }, { slots })).not.toContain('Tell the client')
  })

  it('shows a refusal in words', () => {
    const html = render({ masterId: 1, serviceId: 3, client: sophie, time: '10:00' }, { slots, error: { code: 'slot_taken', message: 'That time is not free for Emma. Choose another.' } })
    expect(html).toContain('That time is not free for Emma')
  })

  it('cannot pick a day that has passed', () => {
    expect(render({})).toContain('min="2026-10-06"')
  })
})
