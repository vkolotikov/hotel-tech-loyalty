import { describe, expect, it } from 'vitest'
import { blend, contrast, hexToRgb } from './colour'
import { brandLightVariables, deepenForLight, lightFillFor, lightTextFor } from './light'
import { DEEPEN_TARGET, DEEPEN_TINT_ALPHA, LIGHT_CANVAS, LIGHT_SURFACES, LIGHT_TEXT } from './lightTokens'
import { BRAND_COLOURS } from './__fixtures__/brandColours'

const rgb = hexToRgb

describe('deepenForLight', () => {
  it('deepens Royal blue until it reads on a 10 % brand tint over the canvas', () => {
    expect(deepenForLight('#3b82f6')).toBe('#0A5BDF')
  })

  it('leaves a colour that already reads alone', () => {
    expect(deepenForLight('#1e3a8a')).toBe('#1E3A8A')
    expect(deepenForLight('#000000')).toBe('#000000')
  })

  it('reaches the target for every fixture brand', () => {
    for (const brand of BRAND_COLOURS) {
      const tint = blend(rgb(brand), DEEPEN_TINT_ALPHA, rgb(LIGHT_CANVAS))
      expect(contrast(rgb(deepenForLight(brand)), tint), brand).toBeGreaterThanOrEqual(DEEPEN_TARGET)
    }
  })
})

describe('brandLightVariables', () => {
  it('writes ten --light-primary shades; 50 to 500 are the deepened colour itself', () => {
    const vars = brandLightVariables('#3b82f6')
    expect(Object.keys(vars).filter(k => k.startsWith('--light-primary-'))).toHaveLength(10)
    expect(vars['--light-primary-300']).toBe('10 91 223')
    expect(vars['--light-primary-500']).toBe('10 91 223')
    expect(vars['--light-primary-700']).not.toBe(vars['--light-primary-500'])
  })
})

describe('lightTextFor (hard-coded text colours)', () => {
  it('maps greys by prominence: the brightest grey on dark becomes the ink', () => {
    expect(lightTextFor('e0e0e0')).toBe(LIGHT_TEXT.primary)
    expect(lightTextFor('c8c8c8')).toBe(LIGHT_TEXT.soft)
    expect(lightTextFor('888888')).toBe('#4A5863')
    expect(lightTextFor('444444')).toBe(LIGHT_TEXT.secondary)
  })

  it('deepens coloured text until it reads on paper', () => {
    const out = lightTextFor('22d3ee')
    expect(contrast(rgb(out), rgb(LIGHT_CANVAS))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(rgb(out), rgb('#FFFFFF'))).toBeGreaterThanOrEqual(4.5)
  })

  it.each(['22d3ee', 'ffd60a', 'ff9500'])('coloured text %s also reads on the hover surface', hex => {
    const out = lightTextFor(hex)
    expect(out).not.toBe(LIGHT_TEXT.primary)
    expect(contrast(rgb(out), rgb(LIGHT_SURFACES['dark-hover']))).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps colours already designed for a light card', () => {
    expect(lightTextFor('1b2a34')).toBe('#1B2A34')
    expect(lightTextFor('54626e')).toBe('#54626E')
  })

  it('does not keep a light-on-dark colour that is unreadable on paper', () => {
    expect(lightTextFor('f4f6f8')).toBe(LIGHT_TEXT.primary)
  })

  it('keeps a pastel colour its hue, deepened to read on paper', () => {
    const out = lightTextFor('fecaca')
    expect(out).not.toBe(LIGHT_TEXT.primary)
    expect(contrast(rgb(out), rgb('#FFFFFF'))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(rgb(out), rgb(LIGHT_CANVAS))).toBeGreaterThanOrEqual(4.5)
    const [r, g, b] = rgb(out)
    expect(r).toBeGreaterThan(g)
    expect(r).toBeGreaterThan(b)
  })
})

describe('lightFillFor (hard-coded fills, borders, gradient stops)', () => {
  it('turns dark surfaces into paper, by how dark they were', () => {
    expect(lightFillFor('0a0a0a')).toBe(LIGHT_SURFACES['dark-bg'])
    expect(lightFillFor('1c1c1e')).toBe(LIGHT_SURFACES['dark-surface'])
    expect(lightFillFor('333333')).toBe(LIGHT_SURFACES['dark-border'])
  })

  it('keeps coloured fills (brand, status, WhatsApp) as they are', () => {
    expect(lightFillFor('c9a84c')).toBe('#C9A84C')
    expect(lightFillFor('25d366')).toBe('#25D366')
    expect(lightFillFor('ef4444')).toBe('#EF4444')
  })

  it('keeps colours already designed for a light card', () => {
    expect(lightFillFor('dde3e8')).toBe('#DDE3E8')
  })
})
