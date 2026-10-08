import colors from 'tailwindcss/colors'
import { SHADES, hexToRgb, toTriplet } from './colour'
import {
  COLOURED_TEXT_SHADES, GLASS_FONTS, GLASS_GREY_TEXT, GLASS_RADIUS, GLASS_SOLID_SURFACES, GLASS_STATUS_TEXT,
  GLASS_SURFACES, GLASS_TEXT, GLASS_TEXT_SHIFT, GLASS_THEME_RADIUS, GLOWS, GREY_HUES, GREY_TEXT_SHADES,
  SHIFTED_HUES,
} from './glassTokens'

/*
 * Build-time only: tailwind.config.js turns these maps into the Glass
 * variable blocks. Kept out of the runtime bundle because it pulls in
 * Tailwind's colour table.
 */

const triplet = (hex: string) => toTriplet(hexToRgb(hex))

/** Coloured text one shade lighter, as `R G B` (text-red-400 → red-300). */
export function shiftedTextColour(hue: (typeof SHIFTED_HUES)[number], shade: (typeof COLOURED_TEXT_SHADES)[number]): string {
  return triplet(colors[hue][GLASS_TEXT_SHIFT[shade]])
}

/** The Glass variable block: surfaces, text, brand text, radius and type. */
export function glassVariables(): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const [name, { rgb, alpha }] of Object.entries(GLASS_SURFACES)) {
    vars[`--style-${name}`] = rgb
    vars[`--alpha-${name}`] = String(alpha)
  }
  for (const [name, hex] of Object.entries(GLASS_TEXT)) vars[`--style-text-${name}`] = triplet(hex)
  for (const [name, hex] of Object.entries(GLASS_STATUS_TEXT)) vars[`--tc-${name}`] = triplet(hex)
  // The lifted brand shades are written inline by the theme code (they
  // depend on the organisation's colour); Glass points brand text at them.
  for (const shade of SHADES) vars[`--tc-primary-${shade}`] = `var(--glass-primary-${shade})`
  for (const hue of GREY_HUES) {
    for (const shade of GREY_TEXT_SHADES) vars[`--tc-${hue}-${shade}`] = triplet(GLASS_GREY_TEXT[shade])
  }
  for (const hue of SHIFTED_HUES) {
    for (const shade of COLOURED_TEXT_SHADES) vars[`--tc-${hue}-${shade}`] = shiftedTextColour(hue, shade)
  }
  // Glow strengths for the backdrop in glass.css; the colours come inline
  // from the theme code (--glass-glow-1..3).
  GLOWS.forEach((glow, i) => {
    vars[`--glass-glow-alpha-${i + 1}`] = String(glow.alpha)
  })
  for (const [step, value] of Object.entries(GLASS_RADIUS)) vars[`--radius-${step}`] = value
  for (const [step, value] of Object.entries(GLASS_THEME_RADIUS)) vars[`--theme-radius-${step}`] = value
  vars['--theme-font-body'] = GLASS_FONTS.body
  vars['--theme-font-display'] = GLASS_FONTS.display
  vars['--theme-letter-spacing'] = '0'
  return vars
}

/** Opaque surfaces, for reduced transparency and browsers without blur. */
export function glassSolidVariables(): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const [name, hex] of Object.entries(GLASS_SOLID_SURFACES)) {
    vars[`--style-${name}`] = triplet(hex)
    vars[`--alpha-${name}`] = '1'
  }
  return vars
}
