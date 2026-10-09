import colors from 'tailwindcss/colors'
import { SHADES, hexToRgb, toTriplet } from './colour'
import { COLOURED_TEXT_SHADES, GREY_HUES, SHIFTED_HUES } from './glassTokens'
import { HX_FILL, HX_TEXT } from './hxColours'
import { lightFillFor, lightTextFor } from './light'
import {
  LIGHT_FONTS, LIGHT_GREY_SHADES, LIGHT_GREY_TEXT, LIGHT_INK, LIGHT_RADIUS, LIGHT_STATUS_TEXT, LIGHT_SURFACES,
  LIGHT_TEXT, LIGHT_TEXT_SHADE, LIGHT_THEME_RADIUS,
} from './lightTokens'

/*
 * Build-time only: tailwind.config.js turns this map into the Clean light
 * variable block (LIGHT_SCOPE). Kept out of the runtime bundle because it
 * pulls in Tailwind's colour table.
 */

const triplet = (hex: string) => toTriplet(hexToRgb(hex))

export function lightVariables(): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const [name, hex] of Object.entries(LIGHT_SURFACES)) {
    vars[`--style-${name}`] = triplet(hex)
    vars[`--alpha-${name}`] = '1'
  }
  for (const [name, hex] of Object.entries(LIGHT_TEXT)) vars[`--style-text-${name}`] = triplet(hex)
  for (const [name, hex] of Object.entries(LIGHT_STATUS_TEXT)) vars[`--tc-${name}`] = triplet(hex)
  // The deepened brand shades are written inline by the theme code (they
  // depend on the organisation's colour).
  for (const shade of SHADES) vars[`--tc-primary-${shade}`] = `var(--light-primary-${shade})`
  for (const hue of GREY_HUES) {
    for (const shade of LIGHT_GREY_SHADES) vars[`--tc-${hue}-${shade}`] = triplet(LIGHT_GREY_TEXT[shade])
  }
  for (const hue of SHIFTED_HUES) {
    for (const shade of COLOURED_TEXT_SHADES) vars[`--tc-${hue}-${shade}`] = triplet(colors[hue][LIGHT_TEXT_SHADE[hue]])
  }
  vars['--hx-white'] = triplet(LIGHT_INK)
  for (const hex of HX_TEXT) vars[`--hx-t-${hex}`] = triplet(lightTextFor(hex))
  for (const hex of HX_FILL) vars[`--hx-f-${hex}`] = triplet(lightFillFor(hex))
  for (const [step, value] of Object.entries(LIGHT_RADIUS)) vars[`--radius-${step}`] = value
  for (const [step, value] of Object.entries(LIGHT_THEME_RADIUS)) vars[`--theme-radius-${step}`] = value
  vars['--theme-font-body'] = LIGHT_FONTS.body
  vars['--theme-font-display'] = LIGHT_FONTS.display
  vars['--theme-letter-spacing'] = '0'
  vars['--hx-color-scheme'] = 'light'
  return vars
}
