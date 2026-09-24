import { describe, expect, it } from 'vitest'
import { offerValueLabel } from './offerLabel'

const t = (key: string, fallback: string, vars?: Record<string, unknown>) =>
  Object.entries(vars ?? {}).reduce((s, [k, v]) => s.replace(`{{${k}}}`, String(v)), fallback || key)

describe('offerValueLabel', () => {
  it('reads the three money-shaped offer types', () => {
    expect(offerValueLabel({ id: 1, title: 'x', type: 'discount', value: 15 }, t)).toBe('15% off')
    expect(offerValueLabel({ id: 1, title: 'x', type: 'percent_discount', value: '10' }, t)).toBe('10% off')
    expect(offerValueLabel({ id: 1, title: 'x', type: 'fixed_amount', value: 25 }, t)).toBe('25 off')
    expect(offerValueLabel({ id: 1, title: 'x', type: 'points_multiplier', value: 2 }, t)).toBe('2x points')
  })
  it('says nothing for a type it cannot price', () => {
    expect(offerValueLabel({ id: 1, title: 'x', type: 'free_night', value: 1 }, t)).toBeNull()
    expect(offerValueLabel({ id: 1, title: 'x', type: 'discount', value: 0 }, t)).toBeNull()
  })
})
