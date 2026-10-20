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
import type { PostCard } from '../lib/types'
import { ScheduleDialog } from './ScheduleDialog'
import { PosterSelect } from '../ui/PosterSelect'

const idea = { id: 9, platform: 'instagram', scheduled_date: null, scheduled_time: null, status: 'idea', title: null, hook: 'An idea', topic: null, pillar_id: null, image_url: null, updated_at: '2026-10-05T06:00:00.000000Z', poster_id: 7 } as PostCard

describe('Ideas → Schedule (spec 2026-10-19 §4.1)', () => {
  it('asks who posts it, starting on the post’s own poster', () => {
    const client = new QueryClient()
    client.setQueryData(['content', 3, 'team'], { team: [{ id: 3, name: 'Mia', role: 'manager' }, { id: 7, name: 'Sam', role: 'staff' }] })
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <ContentContext.Provider value={{ data: bootFor(false), isLoading: false, isError: false, error: null, refetch: () => {}, switchBrand: () => {} }}>
          <ScheduleDialog post={idea} today="2026-10-07" channels={[]} industry={null} onClose={() => {}} onScheduled={() => {}} />
        </ContentContext.Provider>
      </QueryClientProvider>,
    )
    expect(html).toContain('Who posts it')
    expect(html).toMatch(/<option value="7" selected="">Sam<\/option>/)
    expect(html).toMatch(/<option value="3">Mia<\/option>/)
  })
})

// 5A-2 review: Schedule showed "Not set" while the team was still loading, even for an idea with a poster.
describe('who posts it while the team loads', () => {
  it('says it is loading and cannot be changed yet', () => {
    const html = renderToStaticMarkup(<PosterSelect value="" onChange={() => {}} choices={[]} className="x" loading />)
    expect(html).toMatch(/<select[^>]*disabled=""[^>]*aria-busy="true"/)
    expect(html).toContain('Loading…')
    expect(html).not.toContain('Not set')
  })
})
