import { describe, expect, it } from 'vitest'
import {
  blend, capLuminance, contrast, hexToRgb, isHex, luminance, rgbToHex, rotateHue, shadeScale, toTriplet,
} from './colour'

describe('hex and RGB', () => {
  it('parses six-digit, three-digit and #-less hex', () => {
    expect(hexToRgb('#3b82f6')).toEqual([59, 130, 246])
    expect(hexToRgb('#fff')).toEqual([255, 255, 255])
    expect(hexToRgb('c9a84c')).toEqual([201, 168, 76])
  })

  it('reads anything else as black and says it is not hex', () => {
    expect(hexToRgb('')).toEqual([0, 0, 0])
    expect(hexToRgb('#3b8')).toEqual([51, 187, 136])
    expect(isHex('')).toBe(false)
    expect(isHex('#3b82f6')).toBe(true)
    expect(isHex('blue')).toBe(false)
  })

  it('writes uppercase hex and R G B triplets', () => {
    expect(rgbToHex([59, 130, 246])).toBe('#3B82F6')
    expect(rgbToHex([300, -4, 12.6])).toBe('#FF000D')
    expect(toTriplet([28.08, 33.66, 47.61])).toBe('28 34 48')
  })
})

describe('contrast maths', () => {
  it('matches the WCAG reference points', () => {
    expect(luminance([255, 255, 255])).toBeCloseTo(1, 5)
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5)
  })

  it('measures the muted grey the clean-up replaces against the one it adopts', () => {
    const card = hexToRgb('#161616')
    expect(contrast(hexToRgb('#636366'), card)).toBeLessThan(3.2)
    expect(contrast(hexToRgb('#8E8E93'), card)).toBeGreaterThan(5.3)
  })

  it('blends a translucent colour over an opaque one', () => {
    const [r, g, b] = blend([255, 255, 255], 0.07, [11, 17, 32])
    expect(r).toBeCloseTo(28.08, 2)
    expect(g).toBeCloseTo(33.66, 2)
    expect(b).toBeCloseTo(47.61, 2)
  })
})

describe('hue and luminance shifts', () => {
  it('rotates the hue and keeps saturation and lightness', () => {
    expect(rotateHue([255, 0, 0], 120)).toEqual([0, 255, 0])
    expect(rotateHue([255, 0, 0], -120)).toEqual([0, 0, 255])
  })

  it('caps luminance by darkening, and leaves darker colours alone', () => {
    const capped = capLuminance(hexToRgb('#f5f5f5'), 0.25)
    expect(luminance(capped)).toBeLessThanOrEqual(0.25)
    expect(luminance(capped)).toBeGreaterThan(0.22)
    expect(capLuminance(hexToRgb('#3b82f6'), 0.25)).toEqual([59, 130, 246])
  })
})

describe('shadeScale', () => {
  it('produces exactly the shades the palette has always had', () => {
    expect(shadeScale('#c9a84c')).toEqual({
      50: '250 246 237',
      100: '244 238 219',
      200: '233 220 183',
      300: '220 198 139',
      400: '209 181 103',
      500: '201 168 76',
      600: '177 148 67',
      700: '151 126 57',
      800: '131 109 49',
      900: '111 92 42',
    })
  })
})
