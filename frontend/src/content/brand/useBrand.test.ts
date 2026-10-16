import { describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/api', () => ({ api: {} }))

import type { BrandPayload } from '../lib/types'
import { brandCache, profileTouchesPlan } from './useBrand'

// Plan 3B Review Focus 5: adopt() kept five keys, so any brand save dropped the hashtag groups and snippets from the cache.
describe('brandCache', () => {
  it('keeps the brand\'s snippets with the rest of the answer, and an empty list when an answer has none', () => {
    const snippets = [{ id: 1, kind: 'hashtags' as const, name: 'Autumn', body: '#autumn' }]
    const answer = { profile: null, audiences: [], channels: [], voice: null, readiness: null, snippets, channel: { id: 9 } } as unknown as BrandPayload
    expect(brandCache(answer)).toEqual({ profile: null, audiences: [], channels: [], voice: null, readiness: null, snippets, templates: [], holiday_country_guess: null })
    expect(brandCache({ profile: null, audiences: [], channels: [], voice: null, readiness: null }).snippets).toEqual([])
  })

  // Spec 2026-10-16 §3.3, §5: the templates and the guessed holiday country ride with every brand answer.
  it('keeps the templates and the guessed holiday country too', () => {
    const templates = [{ id: 1, name: 'Offer', platform: null, pillar_name: null, topic: null, hook: 'Book', main_copy: null, cta: null, hashtags: [] }]
    const answer = { profile: null, audiences: [], channels: [], voice: null, readiness: null, templates, holiday_country_guess: 'GB' } as unknown as BrandPayload
    expect(brandCache(answer)).toMatchObject({ templates, holiday_country_guess: 'GB', snippets: [] })
  })
})

// Final review (Plan 4A-2): a new holiday country or marketing switch showed on the Plan only after its next refresh.
describe('profileTouchesPlan', () => {
  it('says when a brand change alters the Plan’s key dates', () => {
    expect(profileTouchesPlan({ holiday_country: 'US' })).toBe(true)
    expect(profileTouchesPlan({ marketing_days: false })).toBe(true)
    expect(profileTouchesPlan({ holiday_country: null })).toBe(true)
    expect(profileTouchesPlan({ name: 'Lumière' })).toBe(false)
  })
})
