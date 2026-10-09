import { describe, expect, it } from 'vitest'
import { contrast, hexToRgb } from '../theme/colour'
import { BAR_BASE, DEFAULT_BAR_BASE, barTextFor } from './bookingBars'

describe('room timeline bar text', () => {
  it('uses the dark ink on the light green and teal bars', () => {
    expect(barTextFor('paid')).toBe('#03050A')
    expect(barTextFor('channel_managed')).toBe('#03050A')
  })
  it('keeps white on a dark bar colour', () => {
    expect(barTextFor('some_dark_status')).toBe('#FFFFFF')
    expect(DEFAULT_BAR_BASE).toBe('#6b7280')
  })
  it('reads at least 3:1 on every bar base colour', () => {
    for (const [status, base] of [...Object.entries(BAR_BASE), ['default', DEFAULT_BAR_BASE]]) {
      const text = status === 'default' ? barTextFor('x') : barTextFor(status)
      expect(contrast(hexToRgb(text), hexToRgb(base))).toBeGreaterThanOrEqual(3)
    }
  })
})
