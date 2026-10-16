import { describe, expect, it } from 'vitest'
import type { Goals } from '../lib/types'
import { goalMet, showGoals } from './goalsMath'

const goals: Goals = {
  week: { from: '2026-10-05', to: '2026-10-11' },
  platforms: [{ platform: 'instagram', target: 3, published: 2, planned: 1 }],
  streak: { weeks: 4, current_met: false, at_risk: false, short_by: 1 },
}

describe('showGoals', () => {
  it('shows this week\'s goals on the week that holds the venue\'s today, once a target exists', () => {
    expect(showGoals(goals, { from: '2026-10-05', to: '2026-10-11' }, '2026-10-07')).toBe(true)
    expect(showGoals(goals, { from: '2026-10-12', to: '2026-10-18' }, '2026-10-07')).toBe(false)
    expect(showGoals({ ...goals, platforms: [] }, { from: '2026-10-05', to: '2026-10-11' }, '2026-10-07')).toBe(false)
    expect(showGoals(undefined, { from: '2026-10-05', to: '2026-10-11' }, '2026-10-07')).toBe(false)
  })
})

describe('goalMet', () => {
  it('is met once the posts marked published reach the target', () => {
    expect(goalMet({ platform: 'instagram', target: 3, published: 3, planned: 0 })).toBe(true)
    expect(goalMet({ platform: 'instagram', target: 3, published: 2, planned: 5 })).toBe(false)
  })
})
