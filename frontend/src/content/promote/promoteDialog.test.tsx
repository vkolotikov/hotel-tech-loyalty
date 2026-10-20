import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
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
import { bootFor, brandWith } from '../brand/brandTesting'
import type { Channel, PromotionPreview, SitePage } from '../lib/types'
import { PromoteDialog } from './PromoteDialog'
import { newForm, previewBody } from './promoteMath'

const page = (id: number, title: string): SitePage => ({
  id, kind: 'article', url: `https://lumiere.example/blog/${id}`, title, description: null, image_url: null, published_at: null,
  seen: true, posts: 0, published: 0, clicks: 0, last_promoted_at: null,
})
const channel = (platform: string, active = true) => ({ id: platform.length, platform, label: platform, active } as unknown as Channel)
const render = (pages: SitePage[], preview?: PromotionPreview, channels = [channel('instagram'), channel('linkedin'), channel('blog')]) => {
  const client = new QueryClient()
  client.setQueryData(['content', 3, 'brand'], brandWith({ channels }))
  if (preview) {
    const body = previewBody(pages.map(p => p.id), newForm('2026-10-07', pages.length, ['instagram', 'linkedin']))
    client.setQueryData(['content', 3, 'promotion-preview', JSON.stringify(body)], preview)
  }
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <ContentContext.Provider value={{ data: bootFor(true), isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
        <PromoteDialog pages={pages} onClose={() => {}} onStarted={() => {}} />
      </ContentContext.Provider>
    </QueryClientProvider>,
  )
}

describe('the promote dialog (spec 2026-10-20 §4.2)', () => {
  it('starts from 10 posts a page, 3 a week, every active channel but the blog, from tomorrow, with the picture', () => {
    const html = render([page(1, 'Autumn colours'), page(2, 'Winter care')])
    expect(html).toContain('Pages chosen: 2')
    expect(html).toContain('Autumn colours')
    expect(html).toMatch(/Posts per page[\s\S]*?value="10"/)
    expect(html).toMatch(/At most per week[\s\S]*?value="3"/)
    // The mocked t answers a platform's key with its fallback (the platform's id); the mark prints its short form first.
    expect(html).toMatch(/type="checkbox" checked=""[^>]*>(?:(?!<\/label>).)*instagram<\/label>/s)
    expect(html).toMatch(/type="checkbox" checked=""[^>]*>(?:(?!<\/label>).)*linkedin<\/label>/s)
    expect(html).not.toContain('blog</label>')
    expect(html).toContain('value="2026-10-08"')
    expect(html).toMatch(/type="checkbox" checked=""[^>]*>Use the page’s picture/)
    expect(html).toContain('The posts land on your plan as drafts.')
  })

  it('says the preview: posts and days, and Promote is on', () => {
    const html = render([page(1, 'A'), page(2, 'B')], { wanted: 20, fit: 20, first_date: '2026-10-08', last_date: '2026-12-15', weeks: 10 })
    expect(html).toContain('Posts: 20 · 8 Oct – 15 Dec')
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Promote<\/button>/)
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Promote<\/button>/)
  })

  it('says how many fit when not all do, and Promote is off', () => {
    const html = render([page(1, 'A')], { wanted: 10, fit: 6, first_date: '2026-10-08', last_date: '2026-10-20', weeks: 2 })
    expect(html).toContain('Posts that fit in these days: 6 of 10.')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Promote<\/button>/)
  })

  it('names more than five pages by count, and says when the brand has no channel to post on', () => {
    expect(render([1, 2, 3, 4, 5, 6, 7].map(i => page(i, `Page ${i}`)))).toContain('More: 2')
    expect(render([page(1, 'A')], undefined, [channel('blog')])).toContain('This brand has no active channel to post on.')
  })
})
