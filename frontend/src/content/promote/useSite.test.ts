import { describe, expect, it } from 'vitest'
import type { ContentApi } from '../lib/api'
import type { PromotionRun, SitePayload } from '../lib/types'
import { IDLE_POLL_MS, POLL_MS } from './promoteMath'
import { promotionQueryOptions, siteQueryOptions } from './useSite'

const api = { site: () => Promise.resolve({}), promotion: () => Promise.resolve({ status: 'idle' }) } as unknown as ContentApi
const interval = (options: { refetchInterval?: unknown }, data: unknown) =>
  (options.refetchInterval as (query: { state: { data: unknown } }) => number | false)({ state: { data } })

// Final review (6-2): another tab's scan or promotion must reach this tab — on focus, and on a slow poll while idle.
describe('the shared website and promotion reads', () => {
  it('read the website every 4 s while it is scanned, every minute otherwise, and again on focus', () => {
    const options = siteQueryOptions(api, 3)
    expect(options.queryKey).toEqual(['content', 3, 'site'])
    expect(options.refetchOnWindowFocus).toBe('always')
    expect(interval(options, { site: { status: 'scanning' }, suggested_url: null, pages: [] } as unknown as SitePayload)).toBe(POLL_MS)
    expect(interval(options, { site: { status: 'ready' }, suggested_url: null, pages: [] } as unknown as SitePayload)).toBe(IDLE_POLL_MS)
  })

  it('read the promotion every 4 s while it runs, every minute otherwise, and again on focus', () => {
    const options = promotionQueryOptions(api, 3)
    expect(options.queryKey).toEqual(['content', 3, 'promotion'])
    expect(options.refetchOnWindowFocus).toBe('always')
    expect(interval(options, { status: 'running', batch: 'b', pages: [], created_count: 0, wanted_count: 2, finished_at: null } as PromotionRun)).toBe(POLL_MS)
    expect(interval(options, { status: 'idle' } as PromotionRun)).toBe(IDLE_POLL_MS)
  })
})
