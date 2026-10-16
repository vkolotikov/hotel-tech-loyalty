import { describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/api', () => ({ api: {} }))

import type { BrandPayload } from '../lib/types'
import { brandCache } from './useBrand'

// Plan 3B Review Focus 5: adopt() kept five keys, so any brand save dropped the hashtag groups and snippets from the cache.
describe('brandCache', () => {
  it('keeps the brand\'s snippets with the rest of the answer, and an empty list when an answer has none', () => {
    const snippets = [{ id: 1, kind: 'hashtags' as const, name: 'Autumn', body: '#autumn' }]
    const answer = { profile: null, audiences: [], channels: [], voice: null, readiness: null, snippets, channel: { id: 9 } } as unknown as BrandPayload
    expect(brandCache(answer)).toEqual({ profile: null, audiences: [], channels: [], voice: null, readiness: null, snippets })
    expect(brandCache({ profile: null, audiences: [], channels: [], voice: null, readiness: null }).snippets).toEqual([])
  })
})
