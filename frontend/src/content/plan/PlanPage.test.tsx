import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ContentContext } from '../ContentProvider'
import { PanelProvider } from '../panel/PanelProvider'
import type { Bootstrap, PlanPayload } from '../lib/types'
import { PlanPage } from './PlanPage'

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

const boot: Bootstrap = {
  name: 'HexaTech Content', organization: { id: 16, name: 'Lumière Salon', industry: 'beauty' },
  brand: { id: 3, name: 'Lumière Salon', logo_url: null }, brands: [{ id: 3, name: 'Lumière Salon', logo_url: null }], accent: null,
  venue: { timezone: 'Europe/Riga', timezone_named: true, today: '2026-10-07' },
  staff: { name: 'Vitalij K', role: 'manager', can_manage: true }, profile: { id: 1, setup_completed: true, readiness: 80 },
  ai: { status: 'under', percent: 10 }, platforms: ['instagram', 'linkedin'], statuses: ['draft', 'ready_to_publish', 'published'],
  rewrites: ['shorter'],
}
const week: PlanPayload = {
  posts: [
    { id: 1, platform: 'instagram', scheduled_date: '2026-10-07', scheduled_time: '09:00', status: 'draft', title: null, hook: 'Autumn colours', topic: null, pillar_id: null, image_url: null, updated_at: 'x' },
    { id: 2, platform: 'linkedin', scheduled_date: '2026-10-08', scheduled_time: null, status: 'published', title: 'Team news', hook: null, topic: null, pillar_id: null, image_url: null, updated_at: 'x' },
  ],
  unscheduled: [{ id: 3, platform: 'instagram', scheduled_date: null, scheduled_time: null, status: 'idea', title: null, hook: 'An idea for later', topic: null, pillar_id: null, image_url: null, updated_at: 'x' }],
  slots: [{ date: '2026-10-09', platform: 'instagram' }],
  figures: { planned: 2, ready: 0, published: 1, open_slots: 1 },
}

function page(path = '/content', data: Bootstrap = boot, seed: PlanPayload | null = week) {
  const client = new QueryClient()
  if (seed) client.setQueryData(['content', 3, 'plan', '2026-10-05', '2026-10-11'], seed)
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <QueryClientProvider client={client}>
        <ContentContext.Provider value={{ data, isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
          <PanelProvider><PlanPage /></PanelProvider>
        </ContentContext.Provider>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('PlanPage', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('opens on the venue\'s week even when this computer\'s clock is days out', () => {
    vi.setSystemTime(new Date('2026-10-20T12:00:00Z'))
    expect(page()).toContain('5 Oct – 11 Oct 2026')
  })

  it('below 1024 px (and before the width is known) the Plan is the list: no view choice, no seven columns', () => {
    const html = page()
    expect(html).not.toContain('>Month<')
    expect(html).not.toContain('grid-cols-7')
    expect(html).toContain('Autumn colours')
  })

  // Release 7a (spec 2026-10-21 §6.1): the page header with the numbers line, New post in it.
  it('heads the Plan with its title, its line and the numbers, then shows its posts, empty slots and the tray', () => {
    const html = page()
    expect(html).toMatch(/<h1[^>]*>Plan<\/h1>/)
    expect(html).toContain('A clear view of what comes next.')
    expect(html).toContain('Planned: 2 · Ready: 0 · Published: 1 · Empty slots: 1')
    expect(html).not.toContain('data-figure')
    expect(html).toContain('data-new-post=""')
    expect(html).toContain('Team news')
    expect(html).toContain('aria-label="Empty instagram slot"')
    expect(html).toContain('data-drop="tray"')
    // Release 7a (spec 2026-10-21 §6.2): the tray is the chip's list, opened from "Unscheduled (n)".
    expect(html).toContain('Unscheduled (1)')
    expect(html).not.toContain('aria-labelledby="content-tray-title"')
    expect(html).toContain(`id="content-move-hint"`)
  })

  it('offers Generate to managers only', () => {
    expect(page()).toContain('Generate')
    expect(page('/content', { ...boot, staff: { name: 'Sam', role: 'staff', can_manage: false } })).not.toContain('Generate')
  })

  it('opens on the day a link names', () => {
    expect(page('/content?date=2026-10-20', boot, null)).toContain('19 Oct – 25 Oct 2026')
  })

  // Spec 2026-10-15 §4: the list (the phone's view) offers a new post on the days ahead.
  it('offers a new post on a day ahead', () => {
    expect(page()).toMatch(/data-add="\d{4}-\d{2}-\d{2}"/)
  })
})
