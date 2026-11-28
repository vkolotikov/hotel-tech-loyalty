import { describe, expect, it } from 'vitest'
import { brandParam, setBrand, settle, showsSwitcher } from './brand'

const brands = [{ id: 1 }, { id: 2 }]

describe('the brand HexaTech CRM works in', () => {
  it('keeps a choice the person may make', () => {
    expect(settle('all', brands, true, null)).toBe('all')
    expect(settle(2, brands, true, 2)).toBe(2)
  })

  it('falls back when the choice is not theirs: the brand the server held them to, their first, or all', () => {
    expect(settle(9, brands, true, null)).toBe('all')
    expect(settle('all', [{ id: 2 }], false, 2)).toBe(2)
    expect(settle(9, [{ id: 2 }, { id: 3 }], false, null)).toBe(2)
    expect(settle('all', [], false, null)).toBe('all')
  })

  it('sends the choice as brand_id and shows the switcher only with more than one brand', () => {
    setBrand(2)
    expect(brandParam()).toBe('2')
    setBrand('all')
    expect(brandParam()).toBe('all')
    expect([showsSwitcher([]), showsSwitcher([{}]), showsSwitcher([{}, {}])]).toEqual([false, false, true])
  })
})
