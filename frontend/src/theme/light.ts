import {
  SHADES, blend, contrast, hexToRgb, hslToRgb, rgbToHex, rgbToHsl, shadeScale, type RGB,
} from './colour'
import { LIGHT_HEX_KEEP, LIGHT_HEX_OVERRIDES } from './hxColours'
import {
  DEEPEN_TARGET, DEEPEN_TINT_ALPHA, LIGHT_CANVAS, LIGHT_GREY_TEXT, LIGHT_SURFACES, LIGHT_TEXT, PALE_BRAND_CONTRAST,
} from './lightTokens'

const CANVAS = hexToRgb(LIGHT_CANVAS)
const WHITE: RGB = [255, 255, 255]
const HOVER = hexToRgb(LIGHT_SURFACES['dark-hover'])

/** Lower the colour's HSL lightness in 2 % steps until `fits` holds (or lightness hits 2 %). */
function deepen(hex: string, fits: (c: RGB) => boolean): string {
  const start = hexToRgb(hex)
  const [h, s, l0] = rgbToHsl(start)
  let out: RGB = start
  for (let l = l0; !fits(out) && l > 0.02; ) {
    l = Math.max(0.02, l - 0.02)
    const [r, g, b] = hslToRgb([h, s, l])
    out = [Math.round(r), Math.round(g), Math.round(b)]
  }
  return rgbToHex(out)
}

/** The brand colour as Clean light text: deepened until it reads DEEPEN_TARGET on a 10 % brand tint over the canvas. */
export function deepenForLight(brandHex: string): string {
  const tint = blend(hexToRgb(brandHex), DEEPEN_TINT_ALPHA, CANVAS)
  return deepen(brandHex, c => contrast(c, tint) >= DEEPEN_TARGET)
}

/**
 * The inline variables for brand text in Clean light, written in every
 * style; only the light scope reads them (--tc-primary-* → --light-primary-*).
 * On paper a lighter brand shade reads worse, so 50-500 are the deepened
 * colour itself and 600-900 its darker shades.
 */
export function brandLightVariables(brandHex: string): Record<string, string> {
  const scale = shadeScale(deepenForLight(brandHex))
  const vars: Record<string, string> = {}
  for (const shade of SHADES) vars[`--light-primary-${shade}`] = shade <= 500 ? scale[500] : scale[shade]
  return vars
}

/**
 * A brand too close to white to hold its shape on paper (white, #f5f5f5,
 * #fde68a: 1.0-1.25:1). The theme code marks <html> with data-brand-pale for
 * it in every style; only Clean light reads the mark (light.css: a hairline
 * in the deepened brand around solid brand fills).
 */
export function isPaleBrand(brandHex: string): boolean {
  return contrast(hexToRgb(brandHex), WHITE) < PALE_BRAND_CONTRAST
}

const norm = (hex: string) => hex.replace('#', '').toLowerCase()
/** Greys, and near-white tints with a faint cast (f4f6f8). Pastel colours (fecaca) keep their hue. */
const isNeutral = (hex: string) => {
  const [, s, l] = rgbToHsl(hexToRgb(hex))
  return s < 0.15 || (l >= 0.9 && s < 0.3)
}

/**
 * A hard-coded TEXT colour in Clean light. Greys keep their prominence
 * (the lightest grey on dark becomes the ink); near-white tints with a
 * faint cast (lightness >= 0.9, saturation < 0.3) count as greys too, so
 * they become ink instead of a deepened hue. Other coloured text is
 * deepened until it reads 4.6:1 on white, the canvas and the hover surface. Colours made
 * for a light card stay, but only where they already read 4.5:1 on white
 * and on the canvas (a light-on-dark colour such as f4f6f8 falls through).
 */
export function lightTextFor(hex6: string): string {
  const h = norm(hex6)
  if (LIGHT_HEX_OVERRIDES.t[h]) return LIGHT_HEX_OVERRIDES.t[h]
  if (LIGHT_HEX_KEEP.includes(h) && contrast(hexToRgb(h), WHITE) >= 4.5 && contrast(hexToRgb(h), CANVAS) >= 4.5) {
    return `#${h.toUpperCase()}`
  }
  if (isNeutral(h)) {
    const l = rgbToHsl(hexToRgb(h))[2]
    if (l >= 0.8) return LIGHT_TEXT.primary
    if (l >= 0.62) return LIGHT_TEXT.soft
    if (l >= 0.45) return LIGHT_GREY_TEXT[500]
    return LIGHT_TEXT.secondary
  }
  return deepen(h, c => contrast(c, WHITE) >= 4.6 && contrast(c, CANVAS) >= 4.6 && contrast(c, HOVER) >= 4.6)
}

/**
 * A hard-coded FILL colour (background, border, ring, gradient stop) in
 * Clean light. Dark surfaces, neutral or tinted, become paper by how dark
 * they were; coloured fills (brand, status, WhatsApp green) and light
 * colours stay.
 */
export function lightFillFor(hex6: string): string {
  const h = norm(hex6)
  if (LIGHT_HEX_OVERRIDES.f[h]) return LIGHT_HEX_OVERRIDES.f[h]
  if (LIGHT_HEX_KEEP.includes(h)) return `#${h.toUpperCase()}`
  const [, s, l] = rgbToHsl(hexToRgb(h))
  const darkSurface = l < 0.3 && (s < 0.15 || l < 0.2)
  if (!darkSurface) return `#${h.toUpperCase()}`
  if (l < 0.07) return LIGHT_SURFACES['dark-bg']
  if (l < 0.16) return LIGHT_SURFACES['dark-surface']
  if (l < 0.24) return LIGHT_SURFACES['dark-border']
  return LIGHT_SURFACES['dark-border2']
}
