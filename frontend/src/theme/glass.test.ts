import { describe, expect, it } from 'vitest'
import { blend, contrast, hexToRgb, luminance, rgbToHex, shadeScale, type RGB } from './colour'
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
  it('keeps white while white reads at 3:1, and turns to dark ink below that', () => {
    expect(onColor('#3b82f6')).toBe('#FFFFFF') // Royal blue, white at 3.7:1
    expect(onColor('#1e3a8a')).toBe('#FFFFFF')
    expect(onColor('#d97742')).toBe('#FFFFFF') // white at 3.15:1
    expect(onColor('#c9a84c')).toBe('#03050A') // gold, white at 2.3:1
    expect(onColor('#10b981')).toBe('#03050A') // emerald
    expect(onColor('#fde68a')).toBe('#03050A')
  })

  it('reads at 3:1 or better on every brand, on the 500 and the 600 fill buttons use', () => {
    for (const brand of BRAND_COLOURS) {
      const text = hexToRgb(onColor(brand))
      for (const shade of [500, 600] as const) {
        const fill = shadeScale(brand)[shade].split(' ').map(Number) as RGB
        expect(contrast(text, fill), `${brand} ${shade}`).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('gives dark ink at least 4.5:1 wherever it is chosen', () => {
    for (const brand of BRAND_COLOURS.filter(b => onColor(b) === '#03050A')) {
      for (const shade of [500, 600] as const) {
        const fill = shadeScale(brand)[shade].split(' ').map(Number) as RGB
        expect(contrast(hexToRgb('#03050A'), fill), `${brand} ${shade}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('leaves no fill under 3:1, across the whole grey ramp', () => {
    for (let v = 0; v <= 255; v++) {
      const fill = rgbToHex([v, v, v])
      expect(contrast(hexToRgb(onColor(fill)), [v, v, v]), fill).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('brandGlassVariables', () => {
  it('writes on-primary, ten lifted text shades and three glows', () => {
    const vars = brandGlassVariables('#3b82f6')
    expect(vars['--color-on-primary']).toBe('255 255 255')
    expect(vars['--glass-primary-500']).toBe('147 186 250')
    expect(Object.keys(vars).filter(k => k.startsWith('--glass-primary-'))).toHaveLength(10)
    expect(vars['--glass-glow-1']).toBe('59 130 246')
    expect(vars['--glass-glow-3']).toBeDefined()
  })
})
