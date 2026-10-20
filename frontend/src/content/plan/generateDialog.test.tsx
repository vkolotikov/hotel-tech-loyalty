import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ContentContext } from '../ContentProvider'
import type { Bootstrap, BrandPayload } from '../lib/types'
import { GenerateDialog } from './GenerateDialog'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>, vars?: Record<string, unknown>) => {
      const text = typeof fallback === 'string' ? fallback : key
      return text.replace(/\{\{(\w+)\}\}/g, (_, name) => String((vars ?? {})[name] ?? ''))
    },
    i18n: { language: 'en-GB' },
  }),
}))
vi.mock('../../lib/api', () => ({ api: {} }))

const boot = {
  name: 'HexaTech Content', organization: { id: 16, name: 'Lumière Salon', industry: 'beauty' },
  brand: { id: 3, name: 'Lumière Salon' }, brands: [], accent: null,
  venue: { timezone: 'Europe/London', timezone_named: true, today: '2026-10-08' },
  staff: { name: 'Vitalij K', role: 'manager', can_manage: true }, profile: { id: 1, setup_completed: true, readiness: 80 },
  ai: { status: 'under', percent: 10 }, platforms: ['instagram', 'linkedin', 'tiktok'], statuses: [], rewrites: [],
} as unknown as Bootstrap

function render() {
  const client = new QueryClient()
  // Only what Generate reads of the brand: its channels.
  const brand = {
    audiences: [],
    channels: [
      { id: 1, platform: 'instagram', label: 'Instagram', active: true },
      { id: 2, platform: 'linkedin', label: 'LinkedIn', active: true },
      { id: 3, platform: 'tiktok', label: 'TikTok', active: false },
    ],
  } as unknown as BrandPayload
  client.setQueryData(['content', 3, 'brand'], brand)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <ContentContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
        <GenerateDialog today="2026-10-08" onClose={() => {}} onDone={() => {}} />
      </ContentContext.Provider>
    </QueryClientProvider>,
  )
}

describe('GenerateDialog', () => {
  it('is a modal that offers the presets (this week first), the active channels, empty slots only, and instructions', () => {
    const out = render()
    expect(out).toContain('role="dialog"')
    expect(out).toContain('aria-modal="true"')
    expect(out).toContain('Generate posts')
    expect(out).toMatch(/aria-pressed="true"[^>]*>This week</)
    for (const preset of ['Next week', 'This month', 'Custom']) expect(out).toContain(preset)
    expect(out).toContain('5 Oct – 11 Oct 2026')
    expect(out).toContain('instagram')
    expect(out).toContain('linkedin')
    expect(out).not.toContain('tiktok')
    expect(out).toMatch(/<input type="checkbox" checked=""[^>]*>[^<]*Empty slots only/)
    expect(out).toContain('Instructions for the AI (optional)')
  })
})

// Generate on the queue (2026-10-20): while the worker writes, the dialog says so and may be closed.
describe('Generate while the run is on the queue', () => {
  it('says the AI is writing, in a live region, with Close and no second Generate', () => {
    const client = new QueryClient()
    client.setQueryData(['content', 3, 'brand'], { audiences: [], channels: [{ id: 1, platform: 'instagram', label: 'Instagram', active: true }] })
    client.setQueryData(['content', 3, 'generation'], { status: 'running', started_at: '2026-10-20T12:00:00+00:00' })
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <ContentContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
          <GenerateDialog today="2026-10-08" onClose={() => {}} onDone={() => {}} />
        </ContentContext.Provider>
      </QueryClientProvider>,
    )
    expect(html).toMatch(/role="status"[^>]*>(?:<[^>]+>)*The AI is writing your posts\./)
    expect(html).toContain('you can close this window')
    expect(html).toContain('>Close<')
    expect(html).not.toContain('The AI writes drafts for the days your channels expect.')
  })
})
