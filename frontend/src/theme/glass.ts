import {
  SHADES, blend, capLuminance, contrast, hexToRgb, hslToRgb, luminance, rgbToHex, rgbToHsl, rotateHue,
  shadeScale, toTriplet, type RGB,
} from './colour'
import {
  GLASS_INK, GLASS_PANEL_ALPHA, GLOWS, GLOW_MAX_LUMINANCE, LIFT_PANEL_ALPHA, LIFT_TARGET, LIFT_TINT_ALPHA, ON_PRIMARY_INK,
} from './glassTokens'

const WHITE: RGB = [255, 255, 255]

/** The three backdrop glow colours for a brand: hue-rotated, then capped. */
export function glowsFor(brandHex: string): [string, string, string] {
  const brand = hexToRgb(brandHex)
  const [first, second, third] = GLOWS.map(glow =>
    rgbToHex(capLuminance(rotateHue(brand, glow.rotate), GLOW_MAX_LUMINANCE)),
  )
  return [first, second, third]
}

/**
 * The lightest spot text can land on: a glass surface (white at `alpha`)
 * over the brightest of the brand's three glows. Light text has the least
 * contrast there, so every Glass contrast rule is measured on it.
 */
export function worstGlassPanel(brandHex: string, alpha: number = GLASS_PANEL_ALPHA): RGB {
  const ink = hexToRgb(GLASS_INK)
  const glowSpots = glowsFor(brandHex).map((hex, i) => blend(hexToRgb(hex), GLOWS[i].alpha, ink))
  const brightest = glowSpots.reduce((a, b) => (luminance(b) > luminance(a) ? b : a))
  return blend(WHITE, alpha, brightest)
}

/**
 * The brand colour as Glass text. Lightness rises in 2 % steps until the
 * colour reaches LIFT_TARGET on a 15 % brand tint over a 10 % card at the
 * brightest glow (LIFT_PANEL_ALPHA): the lightest place brand text
 * commonly sits, relative to itself. Colours that already pass come back
 * unchanged.
 */
export function liftForGlass(brandHex: string): string {
  const brand = hexToRgb(brandHex)
  const tint = blend(brand, LIFT_TINT_ALPHA, worstGlassPanel(brandHex, LIFT_PANEL_ALPHA))
  const [h, s, start] = rgbToHsl(brand)
  let lifted: RGB = brand
  for (let l = start; contrast(lifted, tint) < LIFT_TARGET && l < 0.97; ) {
    l = Math.min(0.97, l + 0.02)
    const [r, g, b] = hslToRgb([h, s, l])
    lifted = [Math.round(r), Math.round(g), Math.round(b)]
  }
  return rgbToHex(lifted)
}

/** Dark ink or white, whichever reads better on a fill of `fillHex`. */
export function onColor(fillHex: string): string {
  const fill = hexToRgb(fillHex)
  return contrast(hexToRgb(ON_PRIMARY_INK), fill) >= contrast(WHITE, fill) ? ON_PRIMARY_INK : '#FFFFFF'
}

/**
 * The inline variables the theme code writes for a brand colour, in every
 * style: text on brand fills, the lifted text shades and the glow colours.
 * Only Glass's stylesheet reads the --glass-* ones, so Classic is untouched.
 */
export function brandGlassVariables(brandHex: string): Record<string, string> {
  const vars: Record<string, string> = { '--color-on-primary': toTriplet(hexToRgb(onColor(brandHex))) }
  const lifted = shadeScale(liftForGlass(brandHex))
  for (const shade of SHADES) vars[`--glass-primary-${shade}`] = lifted[shade]
  glowsFor(brandHex).forEach((hex, i) => {
    vars[`--glass-glow-${i + 1}`] = toTriplet(hexToRgb(hex))
  })
  return vars
}
