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
import type { Site, SitePayload } from '../lib/types'
import { bootFor, brandWith, renderBrand } from './brandTesting'
import { WebsiteSection } from './sections/Website'

const site = (more: Partial<Site> = {}): Site => ({
  url: 'https://lumiere.example', status: 'ready', error: null, scanned_at: '2026-10-20T09:00:00.000000Z', articles_count: 42, pages_count: 12,
  summary: 'Lumière cuts and colours hair in Riga.', summary_updated_at: '2026-10-20T09:00:00.000000Z', summary_edited: false, summary_note: null, ...more,
})
const render = (payload: SitePayload, canManage: boolean) => {
  const client = new QueryClient()
  client.setQueryData(['content', 3, 'site'], payload)
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ContentContext.Provider value={{ data: bootFor(canManage), isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
          <WebsiteSection canEdit={canManage} />
        </ContentContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('the Website section (spec 2026-10-20 §5)', () => {
  it('sits on the Brand page right after Readiness, before Brand DNA', () => {
    const html = renderBrand(brandWith(), true)
    expect(html.indexOf('id="content-website"')).toBeGreaterThan(-1)
    expect(html.indexOf('id="content-website"')).toBeLessThan(html.indexOf('id="content-dna"'))
  })

  it('gives managers the address, Scan again, Update the company summary (ticked) and the status line', () => {
    const html = render({ site: site(), suggested_url: null, pages: [] }, true)
    expect(html).toContain('value="https://lumiere.example"')
    expect(html).toContain('Scan again')
    expect(html).toMatch(/<input type="checkbox" checked=""[^>]*>Update the company summary/)
    expect(html).toContain('Scanning again replaces the company summary.')
    expect(html).toContain('Scanned 20 October. Articles: 42 · Pages: 12')
    expect(html).toContain('Lumière cuts and colours hair in Riga.')
    // Final review (6-2): a summary quoting a long address wraps on a phone.
    expect(html).toMatch(/class="[^"]*whitespace-pre-line[^"]*break-words/)
    expect(html).toContain('Edit summary')
    expect(html).toContain('href="/content/promote"')
  })

  it('leaves Update unticked for a summary edited by hand, and says it was', () => {
    const html = render({ site: site({ summary_edited: true }), suggested_url: null, pages: [] }, true)
    expect(html).not.toMatch(/<input type="checkbox" checked=""[^>]*>Update the company summary/)
    expect(html).toContain('Edited by hand')
  })

  it('starts from the suggested address and says Scan website before the first scan', () => {
    const html = render({ site: null, suggested_url: 'https://lumiere.example', pages: [] }, true)
    expect(html).toContain('value="https://lumiere.example"')
    expect(html).toContain('Scan website')
    expect(html).toContain('No summary yet. Scan the website to write one.')
  })

  it('shows a scan reading and a failed one in words, and why the summary was not updated', () => {
    expect(render({ site: site({ status: 'scanning' }), suggested_url: null, pages: [] }, true)).toContain('Reading your website…')
    expect(render({ site: site({ status: 'failed', error: 'site_unreachable' }), suggested_url: null, pages: [] }, true)).toContain('The website could not be reached.')
    expect(render({ site: site({ summary_note: 'ai_failed' }), suggested_url: null, pages: [] }, true)).toContain('The AI could not write the company summary this time')
  })

  it('shows staff the address and the summary, with nothing to change', () => {
    const html = render({ site: site(), suggested_url: null, pages: [] }, false)
    expect(html).toContain('href="https://lumiere.example"')
    expect(html).not.toContain('<input')
    expect(html).not.toContain('Edit summary')
    expect(html).toContain('Lumière cuts and colours hair in Riga.')
    expect(render({ site: null, suggested_url: null, pages: [] }, false)).toContain('Your manager has not added the website yet.')
  })
})
