import { describe, expect, it } from 'vitest'
import { floorField, thresholds, tierBody, tierFormOf, tierProblems } from './programMath'
import type { Tier } from './types'
import { THRESHOLD_WORDS } from './words'

/**
 * A tier's floor on the programme's measure (release 8, spec 2026-10-25 §3): the cards and the tier form show what
 * reaches a tier by points, visits or spend — the chosen one only — and the form sends the visits and spend floors.
 */
const tier = (more: Partial<Tier> = {}): Tier => ({
  id: 1, name: 'Gold', description: null, color: '#c9a227', min_points: 1000, min_nights: null, min_stays: null, min_spend: 250,
  min_visits: 10, earn_rate: 1.5, is_active: true, sort_order: 1, members: 12, benefits: [], ...more,
})

describe('a tier on the programme’s measure', () => {
  it('shows the measure’s floor only, or that it is not set', () => {
    expect(thresholds(tier(), 'visits')).toEqual([{ kind: 'visits', value: 10 }])
    expect(thresholds(tier(), 'spend')).toEqual([{ kind: 'spend', value: 250 }])
    expect(thresholds(tier({ min_visits: null }), 'visits')).toEqual([{ kind: 'visits', value: null }])
    expect(thresholds(tier({ min_visits: undefined }), 'visits')).toEqual([{ kind: 'visits', value: null }])
    // By points, as before: points always, the rest where set.
    expect(thresholds(tier())).toEqual([{ kind: 'points', value: 1000 }, { kind: 'spend', value: 250 }])
    expect(THRESHOLD_WORDS.visits).toBe('Visits to reach')
    expect([floorField('points'), floorField('visits'), floorField('spend')]).toEqual(['min_points', 'min_visits', 'min_spend'])
  })

  it('takes the visits and spend floors, empty for none, and checks only the one shown', () => {
    const form = tierFormOf(tier())
    expect([form.min_visits, form.min_spend]).toEqual(['10', '250'])
    expect(tierFormOf(tier({ min_visits: null, min_spend: null })).min_visits).toBe('')

    expect(tierProblems({ ...form, min_visits: '2.5' }, 'visits')).toEqual({ min_visits: 'min_visits' })
    expect(tierProblems({ ...form, min_visits: '' }, 'visits')).toEqual({})
    expect(tierProblems({ ...form, min_visits: '100001' }, 'visits')).toEqual({ min_visits: 'min_visits' })
    expect(tierProblems({ ...form, min_spend: 'lots' }, 'spend')).toEqual({ min_spend: 'min_spend' })
    expect(tierProblems({ ...form, min_spend: '120,5' }, 'spend')).toEqual({})
    expect(tierProblems({ ...form, min_visits: 'x' })).toEqual({})

    expect(tierBody({ ...form, min_visits: ' 12 ', min_spend: '120,5' })).toMatchObject({ min_visits: 12, min_spend: 120.5 })
    expect(tierBody({ ...form, min_visits: '', min_spend: '' })).toMatchObject({ min_visits: null, min_spend: null })
    // A new tier's form carries neither until one is typed: nothing is sent for them.
    expect(Object.keys(tierBody({ ...tierFormOf(null), name: 'Club' }))).not.toContain('min_visits')
  })
})
