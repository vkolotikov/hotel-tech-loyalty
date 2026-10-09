import { describe, expect, it } from 'vitest'
import { HX_COLOR_SCHEME, LIGHT_CHART, dataInkFor, hx, hxWhite } from './hx'
import { contrast, hexToRgb } from './colour'
import { LIGHT_SURFACES } from './lightTokens'

describe('inline colour helpers', () => {
  it('hx keeps the exact old colour as the fallback', () => {
    expect(hx('f', '#2c2c2c')).toBe('rgb(var(--hx-f-2c2c2c, 44 44 44) / 1)')
    expect(hx('t', '888', 0.5)).toBe('rgb(var(--hx-t-888888, 136 136 136) / 0.5)')
  })

  it('hxWhite is white unless Clean light sets the ink', () => {
    expect(hxWhite(0.06)).toBe('rgb(var(--hx-white, 255 255 255) / 0.06)')
  })

  it('keeps native controls dark outside Clean light', () => {
    expect(HX_COLOR_SCHEME).toBe('var(--hx-color-scheme, dark)')
  })

  it('has light chart colours', () => {
    expect(LIGHT_CHART.grid).toBe('#E5EAEF')
    expect(LIGHT_CHART.tooltipBg).toBe('#FFFFFF')
  })

  it('dataInkFor reads 4.5:1 on every light surface, and leaves non-hex values alone', () => {
    for (const c of ['#74c895', '#fbbf24', '#22d3ee', '#a78bfa']) {
      const [r, g, b] = dataInkFor(c).match(/[0-9a-f]{2}/gi)!.map(x => parseInt(x, 16))
      for (const s of ['dark-surface', 'dark-bg', 'dark-surface2', 'dark-hover'] as const) {
        expect(contrast([r, g, b], hexToRgb(LIGHT_SURFACES[s])), `${c} on ${s}`).toBeGreaterThanOrEqual(4.5)
      }
    }
    expect(dataInkFor('var(--x)')).toBe('var(--x)')
  })
})
