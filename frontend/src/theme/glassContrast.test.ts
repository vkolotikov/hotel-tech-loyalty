import { readFileSync } from 'node:fs'
import colors from 'tailwindcss/colors'
import { describe, expect, it } from 'vitest'
import { blend, contrast, hexToRgb, shadeScale, type RGB } from './colour'
import { liftForGlass, worstGlassPanel } from './glass'
import {
  COLOURED_TEXT_SHADES, GLASS_GREY_TEXT, GLASS_NAV_ACCENT_TEXT, GLASS_PANEL_ALPHA, GLASS_RAISED_ALPHA,
  GLASS_SOLID_SURFACES, GLASS_STATUS_TEXT, GLASS_SURFACES, GLASS_TEXT, GLASS_TEXT_SHIFT, SHIFTED_HUES,
  type StatusToken,
} from './glassTokens'
import { BRAND_COLOURS } from './__fixtures__/brandColours'

/**
 * Glass text must read at 4.5:1 or better on the surfaces it sits on, over
 * the brightest of the brand's three backdrop glows (glass.ts
 * worstGlassPanel), for every brand colour in the fixture:
 *   - a card: white at 10 % (dark-surface2 / dark-card; the 7 % dark-surface
 *     is darker, so it passes whenever the 10 % card does);
 *   - a raised surface: white at 18 % (dark-surface4, chips);
 *   - a hover row in a card: white at 14 % (dark-hover) over the 7 % card.
 * Text tokens and grey steps are held to all three; status, coloured and
 * brand text, which sit on their own tints, to the card.
 * Not gated, and lower right at a glow's peak: status, coloured and brand
 * text on a hover row or raised surface (about 3.5-4.3:1 on a hover row in a
 * card), and every kind of text in deeper stacks such as a hover row inside
 * a 10 % panel or a chip inside a card (text tokens about 3.8-4.3:1, tinted
 * text down to about 2.9:1). The visual pass checks real screens; Part 2's
 * tokens address them.
 */
const FLOOR = 4.5
const WHITE: RGB = [255, 255, 255]
const rgb = (hex: string) => hexToRgb(hex)
const fromTriplet = (t: string): RGB => t.split(' ').map(Number) as RGB

/** The status fills text sits on as a 12 % tint (palette defaults and the fixed tokens). */
const STATUS_FILLS: Record<StatusToken, string> = {
  accent: '#32d74b',
  success: '#32d74b',
  warning: '#ffd60a',
  error: '#ff375f',
  danger: '#ff375f',
  info: '#0a84ff',
  notice: '#0a84ff',
}

describe.each(BRAND_COLOURS)('Glass contrast for brand %s', brand => {
  const card = worstGlassPanel(brand, GLASS_SURFACES['dark-surface2'].alpha)
  const raised = worstGlassPanel(brand, GLASS_RAISED_ALPHA)
  const hoverInCard = blend(WHITE, GLASS_SURFACES['dark-hover'].alpha, worstGlassPanel(brand, GLASS_PANEL_ALPHA))

  it('text tokens and grey text read on a card, a raised surface and a hover row in a card', () => {
    const surfaces = [['card', card], ['raised', raised], ['hover in card', hoverInCard]] as const
    for (const [name, hex] of Object.entries({ ...GLASS_TEXT, ...GLASS_GREY_TEXT })) {
      for (const [where, surface] of surfaces) {
        expect(contrast(rgb(hex), surface), `${name} ${hex} on ${where}`).toBeGreaterThanOrEqual(FLOOR)
      }
    }
  })

  it('status text reads on its own 12 % tint over a card', () => {
    for (const [name, hex] of Object.entries(GLASS_STATUS_TEXT)) {
      const tint = blend(rgb(STATUS_FILLS[name as StatusToken]), 0.12, card)
      expect(contrast(rgb(hex), tint), name).toBeGreaterThanOrEqual(FLOOR)
    }
  })

  it('coloured text, one shade lighter, reads on a card and on its own 15 % tint', () => {
    for (const hue of SHIFTED_HUES) {
      const tint = blend(rgb(colors[hue][500]), 0.15, card)
      for (const shade of COLOURED_TEXT_SHADES) {
        const text = rgb(colors[hue][GLASS_TEXT_SHIFT[shade]])
        expect(contrast(text, card), `${hue}-${shade} on card`).toBeGreaterThanOrEqual(FLOOR)
        expect(contrast(text, tint), `${hue}-${shade} on tint`).toBeGreaterThanOrEqual(FLOOR)
      }
    }
  })

  it('brand text (lifted shades 300 to 500) reads on a 15 % brand tint over a card', () => {
    const tint = blend(rgb(brand), 0.15, card)
    const lifted = shadeScale(liftForGlass(brand))
    for (const shade of [300, 400, 500] as const) {
      expect(contrast(fromTriplet(lifted[shade]), tint), `primary-${shade}`).toBeGreaterThanOrEqual(FLOOR)
    }
  })
})

describe('Glass sidebar: the active item', () => {
  // Layout.tsx draws the active nav item in its group's accent (a Tailwind 400
  // shade, inline) on a 16 % wash of that accent over the 7 % sidebar. In Glass
  // the text takes GLASS_NAV_ACCENT_TEXT through --nav-active-text.
  const layout = readFileSync(new URL('../components/Layout.tsx', import.meta.url), 'utf8')
  const accents = [...layout.matchAll(/accent:\s*'(#[0-9a-fA-F]{6})'/g)].map(m => m[1].toLowerCase())

  it('has a Glass text shade for every group accent, and Layout uses it only through the variable', () => {
    expect(accents.length).toBeGreaterThan(5)
    for (const accent of accents) expect(GLASS_NAV_ACCENT_TEXT[accent], accent).toBeDefined()
    expect(layout).toContain('color: `var(--nav-active-text, ${accent})`')
    expect(layout).toContain("'--nav-accent-glass': GLASS_NAV_ACCENT_TEXT[accent] ?? accent")
    expect(layout).toContain('data-nav-active=')
  })

  it.each(BRAND_COLOURS)('reads at 4.5:1 or better on the active row for brand %s', brand => {
    const sidebar = worstGlassPanel(brand, GLASS_PANEL_ALPHA)
    for (const [accent, text] of Object.entries(GLASS_NAV_ACCENT_TEXT)) {
      const row = blend(rgb(accent), 0.16, sidebar)
      expect(contrast(rgb(text), row), `${accent} → ${text}`).toBeGreaterThanOrEqual(FLOOR)
    }
  })
})

describe('Glass solid surfaces (reduced transparency, no blur)', () => {
  it('keep every text token and grey step readable on the lightest solid surface', () => {
    const lightest = rgb(GLASS_SOLID_SURFACES['dark-surface4'])
    for (const [name, hex] of Object.entries({ ...GLASS_TEXT, ...GLASS_GREY_TEXT })) {
      expect(contrast(rgb(hex), lightest), name).toBeGreaterThanOrEqual(FLOOR)
    }
  })
})
