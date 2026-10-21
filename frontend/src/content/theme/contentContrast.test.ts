import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CONTENT_SURFACES, accentTokens, cardFill } from '../../workspace/theme/accent'

/**
 * Content's own palette (spec 2026-10-21 §3.1): the owner's navy in Dark, a light set in Light with the navy side panel,
 * every text pair at 4.5:1 or better, the post card's text on its accent-mixed fill for any brand, and the AI violet
 * with its white ink. Content's tokens are read over the Atelier ones they override.
 */
const css = readFileSync(new URL('./content.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const workspace = readFileSync(new URL('../../workspace/theme/workspace.css', import.meta.url), 'utf8')

function block(source: string, selector: string): Record<string, number[]> {
  const start = source.indexOf(`${selector} {`)
  if (start < 0) return {}
  const body = source.slice(start, source.indexOf('}', start))
  const vars: Record<string, number[]> = {}
  for (const m of body.matchAll(/--((?:a|c)-[a-z0-9-]+):\s*(\d+) (\d+) (\d+);/g)) vars[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])]
  return vars
}
const tokens = (theme: 'light' | 'dark'): Record<string, number[]> => theme === 'light'
  ? { ...block(workspace, '[data-workspace]'), ...block(css, '[data-content]') }
  : {
      ...block(workspace, '[data-workspace]'), ...block(workspace, '[data-workspace][data-theme="dark"]'),
      ...block(css, '[data-content]'), ...block(css, '[data-content][data-theme="dark"]'),
    }
const lum = (c: number[]) => {
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
}
const ratio = (a: number[], b: number[]) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
const rgbOf = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
const hex = (c: number[]) => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('')

const PAIRS: [string, string][] = [
  ['a-text', 'a-canvas'], ['a-text', 'a-surface'], ['a-text', 'a-surface-2'],
  ['a-text-2', 'a-canvas'], ['a-text-2', 'a-surface'], ['a-text-2', 'a-surface-2'],
  ['a-side-text', 'a-side'], ['a-side-text', 'a-side-2'], ['a-side-text-2', 'a-side'], ['a-side-text-2', 'a-side-2'],
]
// The fallback blue, a deep navy, a pale gold, and the two extremes (Review Focus 2).
const BRANDS = ['#3b82f6', '#1e3a8a', '#f5c518', '#ffffff', '#000000']

for (const theme of ['light', 'dark'] as const) {
  describe(`content palette — ${theme}`, () => {
    const t = tokens(theme)

    for (const [fg, bg] of PAIRS) {
      it(`--${fg} on --${bg} is at least 4.5:1`, () => {
        expect(ratio(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5)
      })
    }

    it('keeps the side panel navy in both themes', () => {
      expect(t['a-side']).toEqual([28, 35, 44])
      expect(t['a-side-2']).toEqual([35, 44, 58])
    })

    it('the surfaces accent.ts works Content\'s accent out on are the CSS tokens', () => {
      const s = CONTENT_SURFACES[theme]
      expect(hex(t['a-canvas'])).toBe(s.canvas)
      expect(hex(t['a-surface'])).toBe(s.surface)
      expect(hex(t['a-surface-2'])).toBe(s.surface2)
      expect(hex(t['a-side'])).toBe(s.side)
    })

    it('reads a card\'s text and its secondary text on the card fill, for any brand', () => {
      for (const brand of BRANDS) {
        const card = rgbOf(cardFill(accentTokens(brand, theme, CONTENT_SURFACES[theme]).accent, theme))
        expect(ratio(t['a-text'], card), `text on ${brand}`).toBeGreaterThanOrEqual(4.5)
        expect(ratio(t['c-card-text-2'], card), `secondary on ${brand}`).toBeGreaterThanOrEqual(4.5)
      }
    })

    it('reads accent text on Content\'s surfaces for any brand', () => {
      for (const brand of BRANDS) {
        const text = rgbOf(accentTokens(brand, theme, CONTENT_SURFACES[theme]).text)
        for (const bg of ['a-canvas', 'a-surface', 'a-surface-2']) expect(ratio(text, t[bg]), `${brand} on ${bg}`).toBeGreaterThanOrEqual(4.5)
      }
    })

    it('gives Generate and the AI actions a violet with white ink at 4.5:1 or better', () => {
      expect(ratio(t['c-ai-ink'], t['c-ai'])).toBeGreaterThanOrEqual(4.5)
    })

    // Release 7a (spec 2026-10-21 §6.4): a key date's chip — the violet's text over a 14 % tint of the violet.
    it('reads the key-date violet text on its tint over every surface at 4.5:1 or better', () => {
      for (const bg of ['a-canvas', 'a-surface', 'a-surface-2']) {
        const chip = t['c-ai'].map((v, i) => v * 0.14 + t[bg][i] * 0.86)
        expect(ratio(t['c-ai-text'], chip), `on ${bg}`).toBeGreaterThanOrEqual(4.5)
      }
    })
  })
}

describe('content palette — the owner\'s mockup', () => {
  it('takes the navy straight from the screenshot', () => {
    const t = tokens('dark')
    expect(t['a-canvas']).toEqual([32, 40, 54])
    expect(t['a-surface']).toEqual([36, 44, 58])
    expect(t['a-surface-2']).toEqual([41, 48, 63])
    expect(t['a-border']).toEqual([51, 62, 78])
  })

  it('makes the fallback blue card about the mockup\'s #2e4460 in Dark', () => {
    expect(cardFill('#3b82f6', 'dark')).toBe('#2c3f60')
  })
})
