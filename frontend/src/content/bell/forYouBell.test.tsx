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
import { bootFor } from '../brand/brandTesting'
import { PanelProvider } from '../panel/PanelProvider'
import { ForYouBell } from './ForYouBell'

function render(count: number | null) {
  const client = new QueryClient()
  if (count !== null) client.setQueryData(['content', 3, 'inbox', 'count'], { count })
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <ContentContext.Provider value={{ data: bootFor(true), isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
        <PanelProvider><ForYouBell /></PanelProvider>
      </ContentContext.Provider>
    </QueryClientProvider>,
  )
}

describe('the "For you" button (spec 2026-10-16 §8)', () => {
  it('names its count and shows it as a badge', () => {
    const html = render(3)
    expect(html).toContain('aria-label="For you (3)"')
    expect(html).toContain('>3</span>')
    expect(html).toContain('data-bell=""')
  })

  it('shows no badge with nothing new, or before the count is read', () => {
    expect(render(0)).toContain('aria-label="For you"')
    expect(render(0)).not.toMatch(/>\d+<\/span>/)
    expect(render(null)).toContain('aria-label="For you"')
  })

  it('caps the badge at 99+', () => {
    expect(render(120)).toContain('>99+</span>')
  })
})
