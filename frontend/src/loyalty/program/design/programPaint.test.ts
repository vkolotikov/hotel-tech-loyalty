import { describe, expect, it } from 'vitest'
import { contrast } from '../../../workspace/theme/accent'
import { programTierPaint } from './programPaint'

describe('Program custom tier colours', () => {
  for (const theme of ['dark', 'light'] as const) it(`keeps names legible on ${theme} numeric tiles and rejects non-colours`, () => {
    const colors = ['#000', '#fff', 'invalid', 'red;position:fixed', ...[0, 51, 102, 153, 204, 255].flatMap(r => [0, 51, 102, 153, 204, 255].flatMap(g => [0, 51, 102, 153, 204, 255].map(b => '#' + [r, g, b].map(n => n.toString(16).padStart(2, '0')).join(''))))]
    for (const color of colors) {
      const { style, tone } = programTierPaint(color, theme)
      const vars = style as Record<string, string>
      expect(contrast(vars['--l-pg-tier-text'], vars['--l-pg-tier-raised'])).toBeGreaterThanOrEqual(4.5)
      expect(vars['--l-pg-tier-swatch']).toMatch(/^#[0-9a-f]{6}$/)
      expect(['bronze', 'silver', 'gold']).toContain(tone)
    }
  })
})
