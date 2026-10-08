import { describe, expect, it } from 'vitest'
import { blend, contrast, hexToRgb, luminance, rgbToHex } from './colour'
import { brandGlassVariables, glowsFor, liftForGlass, onColor, worstGlassPanel } from './glass'
import { GLASS_INK, GLOW_MAX_LUMINANCE, LIFT_PANEL_ALPHA } from './glassTokens'
import { BRAND_COLOURS } from './__fixtures__/brandColours'

describe('glowsFor', () => {
  it('keeps the brand colour as the first glow when it is dark enough', () => {
    expect(glowsFor('#3b82f6')[0]).toBe('#3B82F6')
  })

  it('caps every glow, so a near-white brand cannot wash the panels out', () => {
    for (const brand of BRAND_COLOURS) {
      for (const glow of glowsFor(brand)) {
        expect(luminance(hexToRgb(glow)), `${brand} → ${glow}`).toBeLessThanOrEqual(GLOW_MAX_LUMINANCE)
      }
    }
  })
})

describe('worstGlassPanel', () => {
  it('is lighter than bare ink and than the plain 7 % panel', () => {
    const ink = hexToRgb(GLASS_INK)
    const plain = blend([255, 255, 255], 0.07, ink)
    const worst = worstGlassPanel('#3b82f6')
    expect(luminance(worst)).toBeGreaterThan(luminance(plain))
  })
})

describe('liftForGlass', () => {
  it('lifts Royal blue to a light blue and gold a little', () => {
    expect(liftForGlass('#3b82f6')).toBe('#93BAFA')
    expect(liftForGlass('#c9a84c')).toBe('#D7BF7B')
  })

  it('leaves colours that already read alone', () => {
    expect(liftForGlass('#fde68a')).toBe('#FDE68A')
    expect(liftForGlass('#f5f5f5')).toBe('#F5F5F5')
  })

  it('makes every brand colour readable on its own tint over the worst 10 % card', () => {
    for (const brand of BRAND_COLOURS) {
      const tint = blend(hexToRgb(brand), 0.15, worstGlassPanel(brand, LIFT_PANEL_ALPHA))
      expect(contrast(hexToRgb(liftForGlass(brand)), tint), brand).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('onColor', () => {
  it('picks dark ink on light fills and white on dark fills', () => {
    expect(onColor('#3b82f6')).toBe('#03050A')
    expect(onColor('#fde68a')).toBe('#03050A')
    expect(onColor('#1e3a8a')).toBe('#FFFFFF')
  })

  it('gives button text at least 4.5:1 on every brand fill', () => {
    for (const brand of BRAND_COLOURS) {
      expect(contrast(hexToRgb(onColor(brand)), hexToRgb(brand)), brand).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('leaves no fill without readable text, across the whole grey ramp', () => {
    for (let v = 0; v <= 255; v++) {
      const fill = rgbToHex([v, v, v])
      expect(contrast(hexToRgb(onColor(fill)), [v, v, v]), fill).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('brandGlassVariables', () => {
  it('writes on-primary, ten lifted text shades and three glows', () => {
    const vars = brandGlassVariables('#3b82f6')
    expect(vars['--color-on-primary']).toBe('3 5 10')
    expect(vars['--glass-primary-500']).toBe('147 186 250')
    expect(Object.keys(vars).filter(k => k.startsWith('--glass-primary-'))).toHaveLength(10)
    expect(vars['--glass-glow-1']).toBe('59 130 246')
    expect(vars['--glass-glow-3']).toBeDefined()
  })
})
