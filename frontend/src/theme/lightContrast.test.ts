import colors from 'tailwindcss/colors'
import { describe, expect, it } from 'vitest'
import { blend, contrast, hexToRgb, shadeScale, type RGB } from './colour'
import { onColor } from './glass'
import { COLOURED_TEXT_SHADES, SHIFTED_HUES, type StatusToken } from './glassTokens'
import { deepenForLight, lightTextFor } from './light'
import {
  LIGHT_GREY_TEXT, LIGHT_NAV_ACCENT_TEXT, LIGHT_STATUS_TEXT, LIGHT_SURFACES, LIGHT_TEXT, LIGHT_TEXT_SHADE,
} from './lightTokens'
import { HX_TEXT } from './hxColours'
import { BRAND_COLOURS } from './__fixtures__/brandColours'

/**
 * Clean light text must read at 4.5:1 or better on the four surfaces text
 * sits on: canvas, surface (white), surface-2 and hover. Status, coloured
 * and brand text also on their own tints.
 */
const FLOOR = 4.5
const rgb = (hex: string) => hexToRgb(hex)
const SURFACES: Record<string, RGB> = {
  canvas: rgb(LIGHT_SURFACES['dark-bg']),
  surface: rgb(LIGHT_SURFACES['dark-surface']),
  'surface-2': rgb(LIGHT_SURFACES['dark-surface2']),
  hover: rgb(LIGHT_SURFACES['dark-hover']),
}
const STATUS_FILLS: Record<StatusToken, string> = {
  accent: '#32d74b', success: '#32d74b', warning: '#ffd60a', error: '#ff375f', danger: '#ff375f', info: '#0a84ff', notice: '#0a84ff',
}
const SIDEBAR = rgb('#ECEFF3')

describe('Clean light contrast', () => {
  it('text tokens and every grey step read on every surface', () => {
    for (const [name, hex] of Object.entries({ ...LIGHT_TEXT, ...LIGHT_GREY_TEXT })) {
      for (const [where, surface] of Object.entries(SURFACES)) {
        expect(contrast(rgb(hex), surface), `${name} ${hex} on ${where}`).toBeGreaterThanOrEqual(FLOOR)
      }
    }
  })

  it('status text reads on its own 12 % tint over white and on hover', () => {
    for (const [name, hex] of Object.entries(LIGHT_STATUS_TEXT)) {
      const tint = blend(rgb(STATUS_FILLS[name as StatusToken]), 0.12, SURFACES.surface)
      expect(contrast(rgb(hex), tint), name).toBeGreaterThanOrEqual(FLOOR)
      expect(contrast(rgb(hex), SURFACES.hover), name).toBeGreaterThanOrEqual(FLOOR)
    }
  })

  it('coloured text (each hue at its light shade) reads on paper and on its own 12 % tint', () => {
    for (const hue of SHIFTED_HUES) {
      const text = rgb(colors[hue][LIGHT_TEXT_SHADE[hue]])
      const tint = blend(rgb(colors[hue][500]), 0.12, SURFACES.surface)
      for (const [where, surface] of Object.entries({ ...SURFACES, tint })) {
        expect(contrast(text, surface), `${hue} on ${where}`).toBeGreaterThanOrEqual(FLOOR)
      }
    }
    expect(COLOURED_TEXT_SHADES.length).toBeGreaterThan(0)
  })

  it.each(BRAND_COLOURS)('brand text and brand buttons read for brand %s', brand => {
    const deep = rgb(deepenForLight(brand))
    const tint = blend(rgb(brand), 0.1, SURFACES.canvas)
    expect(contrast(deep, tint), 'on its tint').toBeGreaterThanOrEqual(FLOOR)
    expect(contrast(deep, SURFACES.hover), 'on hover').toBeGreaterThanOrEqual(FLOOR)
    const s600 = shadeScale(deepenForLight(brand))[600].split(' ').map(Number) as RGB
    expect(contrast(s600, tint), 'shade 600 on its tint').toBeGreaterThanOrEqual(FLOOR)
    expect(contrast(rgb(onColor(brand)), rgb(brand)), 'button text').toBeGreaterThanOrEqual(3)
  })

  it('sidebar section labels and the active item read on the light sidebar and on a 16 % accent wash', () => {
    for (const [accent, text] of Object.entries(LIGHT_NAV_ACCENT_TEXT)) {
      expect(contrast(rgb(text), SIDEBAR), accent).toBeGreaterThanOrEqual(FLOOR)
      expect(contrast(rgb(text), blend(rgb(accent), 0.16, SIDEBAR)), `${accent} wash`).toBeGreaterThanOrEqual(FLOOR)
      expect(contrast(rgb(text), SURFACES.surface), `${accent} on the white active pill`).toBeGreaterThanOrEqual(FLOOR)
    }
  })

  it('every registered hard-coded text colour reads on paper in light', () => {
    for (const hex of HX_TEXT) {
      for (const [where, surface] of Object.entries(SURFACES)) {
        expect(contrast(rgb(lightTextFor(hex)), surface), `#${hex} on ${where}`).toBeGreaterThanOrEqual(FLOOR)
      }
    }
  })
})
