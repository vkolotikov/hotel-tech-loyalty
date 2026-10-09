import { describe, expect, it } from 'vitest'
import { onColor } from '../../theme/glass'
import { tierBadgeText } from './TierBadge'

describe('tierBadgeText', () => {
  it('in light, follows onColor: pale pink gets ink, bronze and navy keep white', () => {
    for (const fill of ['#f9a8d4', '#CD7F32', '#001f3f', '#a21caf']) {
      expect(tierBadgeText(fill, true)).toBe(onColor(fill))
    }
    expect(tierBadgeText('#f9a8d4', true)).not.toBe('#FFFFFF')
    expect(tierBadgeText('#CD7F32', true)).toBe('#FFFFFF')
    expect(tierBadgeText('#001f3f', true)).toBe('#FFFFFF')
  })

  it('outside light the old rule holds: white on any fill', () => {
    expect(tierBadgeText('#f9a8d4', false)).toBe('white')
    expect(tierBadgeText('#CD7F32', false)).toBe('white')
  })

  it('keeps dark text on the metallic tiers, whatever the letter case', () => {
    expect(tierBadgeText('#FFD700', false)).toBe('#333')
    expect(tierBadgeText('#c0c0c0', true)).toBe('#333')
    expect(tierBadgeText('#B9F2FF', true)).toBe('#333')
  })
})
