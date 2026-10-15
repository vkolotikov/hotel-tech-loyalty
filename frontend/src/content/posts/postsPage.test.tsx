import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ContentContext } from '../ContentProvider'
import type { Bootstrap, PostCard, PostFilters, PostsPage as Page } from '../lib/types'
import { PanelProvider } from '../panel/PanelProvider'
import { NO_FILTERS } from './postsFilters'
import { PostsPage } from './PostsPage'

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

const boot = {
  name: 'HexaTech Content', organization: { id: 16, name: 'Lumière Salon', industry: 'beauty' },
  brand: { id: 3, name: 'Lumière Salon' }, brands: [], accent: null,
  venue: { timezone: 'Europe/London', timezone_named: true, today: '2026-10-07' },
  staff: { name: 'Sam', role: 'staff', can_manage: false }, profile: { id: 1, setup_completed: true, readiness: 80 },
  ai: { status: 'under', percent: 10 }, platforms: ['instagram', 'linkedin'], statuses: ['idea', 'draft', 'published', 'archived'], rewrites: [],
} as unknown as Bootstrap

const card = (id: number, more: Partial<PostCard> = {}): PostCard => ({
  id, platform: 'instagram', scheduled_date: '2026-10-21', scheduled_time: '09:30', status: 'draft',
  title: null, hook: `Hook ${id}`, topic: null, pillar_id: null, image_url: null, updated_at: '2026-10-05T06:00:00.000000Z', ...more,
})

function render(url: string, filters: PostFilters, page: Page | null, strategyKnown = true) {
  const client = new QueryClient()
  if (page) client.setQueryData(['content', 3, 'posts', filters], page)
  if (strategyKnown) client.setQueryData(['content', 3, 'strategies'], { strategies: [{ id: 2, title: null, summary: null, status: 'active', created_at: null }] })
  if (strategyKnown) client.setQueryData(['content', 3, 'strategy', 2], {
    strategy: { id: 2, title: null, summary: null, status: 'active', created_at: null, ai_output: null, balance: null,
      pillars: [{ id: 7, name: 'Hair care', active: true, description: null, purpose: null, frequency_weight: 30 }] },
  })
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <ContentContext.Provider value={{ data: boot, isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
          <PanelProvider><PostsPage /></PanelProvider>
        </ContentContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('PostsPage', () => {
  it('lists the posts the address asks for, each with its day, pillar and status, and how many there are', () => {
    const filters = { ...NO_FILTERS, status: 'draft' } as const
    const html = render('/content/posts?status=draft', filters, {
      data: [card(1, { pillar_id: 7 }), card(2, { scheduled_date: null, scheduled_time: null, pillar_id: 99 })],
      meta: { page: 1, pages: 1, total: 2 },
    })
    expect(html).toContain('>Posts<')
    expect(html).toContain('Posts: 2')
    expect(html).toContain('Hook 1')
    expect(html).toContain('Hair care')
    expect(html).toContain('Another pillar')
    expect(html).toContain('Unscheduled')
    expect(html).toContain('data-status="draft"')
    expect(html).toMatch(/<option value="draft" selected="">/)
    expect(html).toContain('Clear filters')
  })

  // Found by eyes: while the strategy was still loading, every post with a pillar read "Another pillar".
  it('names no pillar until the strategy is known, rather than calling every one another pillar', () => {
    const html = render('/content/posts', NO_FILTERS, { data: [card(1, { pillar_id: 7 })], meta: { page: 1, pages: 1, total: 1 } }, false)
    expect(html).toContain('Hook 1')
    expect(html).not.toContain('Another pillar')
  })

  it('offers the active strategy\'s pillars as a filter', () => {
    const html = render('/content/posts', NO_FILTERS, { data: [card(1)], meta: { page: 1, pages: 1, total: 1 } })
    expect(html).toMatch(/<option value="7">Hair care<\/option>/)
    expect(html).not.toContain('Clear filters')
  })

  it('says when nothing matches the filters, and when the brand has no post yet', () => {
    const empty = { data: [], meta: { page: 1, pages: 0, total: 0 } }
    expect(render('/content/posts?platform=linkedin', { ...NO_FILTERS, platform: 'linkedin' }, empty)).toContain('No posts match these filters.')
    expect(render('/content/posts', NO_FILTERS, empty)).toContain('No posts yet.')
  })

  it('pages through the list 50 at a time, and says when a page holds nothing', () => {
    const html = render('/content/posts?page=2', { ...NO_FILTERS, page: 2 }, { data: [card(1)], meta: { page: 2, pages: 3, total: 120 } })
    expect(html).toContain('Page 2 of 3')
    const previous = html.match(/<button[^>]*aria-label="Previous page"[^>]*>/)?.[0] ?? ''
    expect(previous).not.toBe('')
    expect(previous).not.toMatch(/\bdisabled=""/)
    const beyond = render('/content/posts?page=9', { ...NO_FILTERS, page: 9 }, { data: [], meta: { page: 9, pages: 3, total: 120 } })
    expect(beyond).toContain('There is nothing on this page.')
    expect(beyond).toContain('First page')
  })

  it('shows a pillar filter the active strategy does not know as "Another pillar", chosen', () => {
    const html = render('/content/posts?pillar=99', { ...NO_FILTERS, pillar_id: 99 }, { data: [], meta: { page: 1, pages: 0, total: 0 } })
    expect(html).toMatch(/<option value="99" selected="">Another pillar<\/option>/)
  })
})
