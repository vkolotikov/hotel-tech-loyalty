import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

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

import { ContentContext } from '../ContentProvider'
import { bootFor } from '../brand/brandTesting'
import type { PromotionRun, Site, SitePage, SitePayload } from '../lib/types'
import { PageRow, focusBack } from './PageRow'
import { PromotePage } from './PromotePage'
import { PromotionLine } from './PromotionLine'

const site: Site = {
  url: 'https://lumiere.example', status: 'ready', error: null, scanned_at: '2026-10-20T09:00:00.000000Z', articles_count: 2, pages_count: 1,
  summary: null, summary_updated_at: null, summary_edited: false, summary_note: null,
}
const page = (more: Partial<SitePage> = {}): SitePage => ({
  id: 1, kind: 'article', url: 'https://lumiere.example/blog/autumn', title: 'Autumn colours', description: null, image_url: 'https://lumiere.example/a.jpg',
  published_at: '2026-09-01T00:00:00.000000Z', seen: true, posts: 0, published: 0, clicks: 0, last_promoted_at: null, ...more,
})
const payload = (pages: SitePage[], s: Site | null = site): SitePayload => ({ site: s, suggested_url: null, pages })
const render = (data: SitePayload, canManage: boolean, run: PromotionRun = { status: 'idle' }) => {
  const client = new QueryClient()
  client.setQueryData(['content', 3, 'site'], data)
  client.setQueryData(['content', 3, 'promotion'], run)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ContentContext.Provider value={{ data: bootFor(canManage), isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
          <PromotePage />
        </ContentContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
const row = (p: SitePage, canManage = true, chosen = false, full = false) => renderToStaticMarkup(
  <PageRow page={p} canManage={canManage} chosen={chosen} full={full} onToggle={() => {}} locale="en-GB" busy={false} />,
)

describe('the Promote page (spec 2026-10-20 §5)', () => {
  it('asks a manager for the address before the first scan, and tells staff the manager has not added it', () => {
    expect(render(payload([], null), true)).toContain('Add your website address to find your blog articles and pages.')
    const staff = render(payload([], null), false)
    expect(staff).toContain('Your manager has not added the website yet.')
    expect(staff).toContain('Only an owner or a manager can scan the website or promote pages.')
  })

  it('shows two tabs with their counts and the articles first', () => {
    const html = render(payload([page(), page({ id: 2, title: 'Winter care' }), page({ id: 3, kind: 'page', title: 'Prices', url: 'https://lumiere.example/prices' })]), true)
    expect(html).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>Blog articles \(2\)</)
    expect(html).toMatch(/role="tab"[^>]*aria-selected="false"[^>]*>Other pages \(1\)</)
    expect(html).toContain('Autumn colours')
    expect(html).toContain('Winter care')
    expect(html).not.toContain('Prices')
  })

  it('says when no article was found, and how to point at the blog', () => {
    expect(render(payload([page({ kind: 'page', title: 'Prices' })]), true)).toContain('No blog articles were found. If your blog has its own address')
  })

  it('gives each row its picture, its link in a new tab, its date and numbers, and a tick box for managers only', () => {
    const promoted = row(page({ posts: 10, published: 4, clicks: 37 }))
    expect(promoted).toContain('src="https://lumiere.example/a.jpg"')
    expect(promoted).toMatch(/<a href="https:\/\/lumiere.example\/blog\/autumn" target="_blank" rel="noopener noreferrer"/)
    expect(promoted).toContain('1 Sept 2026 · Posts: 10 · Published: 4 · Clicks: 37')
    expect(promoted).toContain('aria-label="Choose Autumn colours"')
    expect(promoted).toContain('Show posts')
    expect(row(page(), false)).not.toContain('type="checkbox"')
    expect(row(page())).toContain('Not promoted yet')
    expect(row(page())).not.toContain('Show posts')
  })

  it('marks a page not found on the last scan, and a 21st page cannot be ticked', () => {
    expect(row(page({ seen: false, posts: 2 }))).toContain('Not found on the last scan')
    expect(row(page(), true, false, true)).toMatch(/type="checkbox"[^>]*disabled=""/)
    expect(row(page(), true, true, true)).not.toMatch(/type="checkbox"[^>]*disabled=""/)
  })

  it('follows a promotion: writing with Stop for managers, then what it added with the way to the Plan', () => {
    const running: PromotionRun = { status: 'running', batch: 'b', created_count: 2, wanted_count: 4, finished_at: null, pages: [
      { page_id: 1, title: 'Autumn colours', status: 'done', posts_wanted: 2, posts_made: 2, error: null },
      { page_id: 2, title: 'Winter care', status: 'writing', posts_wanted: 2, posts_made: 0, error: null },
    ] }
    const line = (run: PromotionRun, canManage: boolean) => renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <ContentContext.Provider value={{ data: bootFor(canManage), isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
            <PromotionLine run={run} canManage={canManage} />
          </ContentContext.Provider>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(line(running, true)).toContain('The AI is writing promotion posts. Pages done: 1 of 2')
    expect(line(running, true)).toContain('>Stop<')
    expect(line(running, false)).not.toContain('>Stop<')
    const done: PromotionRun = { ...running, status: 'finished', finished_at: '2026-10-20T10:00:00.000000Z', created_count: 4,
      pages: running.pages.map(p => ({ ...p, status: 'done' as const, posts_made: 2 })) }
    expect(line(done, true)).toContain('Promotion posts added to your plan as drafts: 4')
    expect(line(done, true)).toContain('href="/content"')
    // Final review (6-2): a failure naming a long title wraps on a phone.
    const failed: PromotionRun = { ...done, pages: [...done.pages, { page_id: 3, title: 'A'.repeat(80), status: 'failed', posts_wanted: 2, posts_made: 0, error: 'ai_failed' }] }
    expect(line(failed, true)).toMatch(/<li[^>]*class="[^"]*break-words[^"]*">A{80}: The AI could not write these posts\.<\/li>/)
    expect(render(payload([page()]), true, done)).toContain('Promotion posts added to your plan as drafts: 4')
  })

  // Release check (6-2): removing a page's last drafts takes Remove draft posts away with them; the keyboard must not
  // fall to the page's top.
  it('hands the keyboard back to Remove draft posts, or to Hide posts once Remove is gone', () => {
    const element = () => ({ focus: vi.fn() })
    const remove = element()
    const toggle = element()
    const fake = (found: Record<string, { focus: () => void }>) => ({ querySelector: (selector: string) => found[selector] ?? null }) as unknown as ParentNode
    focusBack(fake({ '[data-remove-trigger]': remove, '[data-posts-toggle]': toggle }))
    expect(remove.focus).toHaveBeenCalledTimes(1)
    expect(toggle.focus).not.toHaveBeenCalled()
    focusBack(fake({ '[data-posts-toggle]': toggle }))
    expect(toggle.focus).toHaveBeenCalledTimes(1)
    expect(() => focusBack(null)).not.toThrow()
    expect(row(page({ posts: 2 }))).toMatch(/<button type="button" data-posts-toggle=""[^>]*aria-expanded="false"/)
  })
})
