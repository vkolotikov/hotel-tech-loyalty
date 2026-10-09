import { describe, expect, it } from 'vitest'
import { HX_COLOR_SCHEME, LIGHT_CHART, hx, hxWhite } from './hx'

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
})
