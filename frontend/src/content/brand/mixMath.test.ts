import { describe, expect, it } from 'vitest'
import { DEFAULT_MIX } from '../lib/options'
import { balanceMix, mixTotal } from './mixMath'

describe('the content mix', () => {
  it('adds up what is set', () => {
    expect(mixTotal({ education: 40, myths: 35 })).toBe(75)
    expect(mixTotal({})).toBe(0)
  })

  it('balances to exactly 100 % in proportion, rounding fairly, leaving zeros at zero', () => {
    const balanced = balanceMix({ education: 50, myths: 25, community: 25, social_proof: 0 })
    expect(balanced).toEqual({ education: 50, myths: 25, community: 25, social_proof: 0 })
    const thirds = balanceMix({ education: 10, myths: 10, community: 10 })
    expect(mixTotal(thirds)).toBe(100)
    expect(Object.values(thirds).sort()).toEqual([33, 33, 34])
  })

  it('starts from the usual mix when nothing is set', () => {
    expect(balanceMix({ education: 0 })).toEqual(DEFAULT_MIX)
  })
})
