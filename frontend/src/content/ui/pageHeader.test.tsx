import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string | Record<string, unknown>) => (typeof fallback === 'string' ? fallback : key),
    i18n: { language: 'en-GB' },
  }),
}))
vi.mock('../../lib/api', () => ({ api: {} }))

import { ContentContext } from '../ContentProvider'
import { bootFor } from '../brand/brandTesting'
import { PanelProvider } from '../panel/PanelProvider'
import { PageHeader } from './PageHeader'

const render = (node: ReactNode) => renderToStaticMarkup(
  <QueryClientProvider client={new QueryClient()}>
    <MemoryRouter>
      <ContentContext.Provider value={{ data: bootFor(true), isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
        <PanelProvider>{node}</PanelProvider>
      </ContentContext.Provider>
    </MemoryRouter>
  </QueryClientProvider>,
)

describe('the page header (spec 2026-10-21 §5)', () => {
  it('draws the title in the display face, its line, and New post on the right', () => {
    const html = render(<PageHeader title="Ideas" line="Posts without a day, by stage." newPost />)
    expect(html).toMatch(/<h1[^>]*font-a-display[^>]*>Ideas<\/h1>/)
    expect(html).toContain('Posts without a day, by stage.')
    // Final review (spec §5): the line is the quieter text.
    expect(html).toMatch(/<p class="[^"]*text-a-text-2[^"]*">Posts without a day, by stage\.<\/p>/)
    expect(html).toMatch(/data-new-post=""[^>]*>[\s\S]*?New post<\/span><\/button>/)
  })

  it('puts what goes under the line there (the Plan\'s numbers)', () => {
    const html = render(<PageHeader title="Plan" line="A clear view of what comes next." below={<p data-below="">numbers</p>} />)
    expect(html.indexOf('A clear view')).toBeLessThan(html.indexOf('data-below'))
  })

  it('leaves New post out where the page has its own actions, and keeps them', () => {
    const html = render(<PageHeader title="Strategy"><button type="button">Generate</button></PageHeader>)
    expect(html).not.toContain('New post')
    expect(html).toContain('Generate')
  })
})
