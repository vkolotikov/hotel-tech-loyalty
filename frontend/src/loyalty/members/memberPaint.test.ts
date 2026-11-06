import { describe, expect, it } from 'vitest'
import { contrast } from '../../workspace/theme/accent'
import { MEMBER_PAINT, memberTierPaint } from './memberPaint'

describe('Members presentation contrast', () => {
  it('keeps summary labels and status text readable on their actual backgrounds', () => {
    for (const theme of ['light', 'dark'] as const) {
      const paint = MEMBER_PAINT[theme]
      const text = theme === 'dark' ? '#c7d3e5' : '#49596d'
      for (const background of [paint.cyanTop, paint.cyanBottom, paint.greenTop, paint.greenBottom, paint.blueTop, paint.blueBottom, paint.violetTop, paint.violetBottom, paint.directory, paint.stripe, paint.hover]) expect(contrast(text, background), `${theme}/${background}`).toBeGreaterThanOrEqual(4.5)
      for (const [foreground, background] of [[paint.activeText, paint.activeBg], [paint.expiringText, paint.expiringBg], [paint.expiredText, paint.expiredBg], [paint.offText, paint.offBg]]) expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5)
      for (const background of [paint.directory, paint.stripe, paint.hover]) expect(contrast(paint.activeText, background)).toBeGreaterThanOrEqual(4.5)
    }
  })
  it('keeps custom tier colours readable, including extreme and invalid input', () => {
    const colors: (string | null | undefined)[] = ['#fff', '#000', '#ffd18a', '#37b6e9', '#8844cc', '#b88d63', null, undefined, '', 'url(https://example.test)', '#badinput']
    for (const r of ['00', '33', '66', '99', 'cc', 'ff']) for (const g of ['00', '33', '66', '99', 'cc', 'ff']) for (const b of ['00', '33', '66', '99', 'cc', 'ff']) colors.push(`#${r}${g}${b}`)
    for (const theme of ['light', 'dark'] as const) for (const color of colors) {
      const paint = memberTierPaint(color, theme)
      expect(contrast(paint.text, paint.background), `${theme}/${color}`).toBeGreaterThanOrEqual(4.5)
      expect(paint.swatch).toMatch(/^#[0-9a-f]{6}$/)
    }
  })
})
