import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { LOYALTY_SURFACES, accentTokens, contrast } from '../../workspace/theme/accent'
import { tierHex, tierPaint } from './tierChip'

/**
 * Loyalty's palette (spec 2026-10-21 §6.1, §6.2; release 10: the owner's Figma navy in Dark): equal to
 * LOYALTY_SURFACES; every text pair at 4.5:1 or better; a request's state, a ledger line's sign and each colour family
 * read over their tints and the surfaces (a family's title also over the chosen section card's fill); the shared
 * status tones still read on Loyalty's surfaces; a tier's chip reads for any colour a tier may have.
 */
const css = readFileSync(new URL('./loyalty.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const workspace = readFileSync(new URL('../../workspace/theme/workspace.css', import.meta.url), 'utf8')

function block(source: string, selector: string): Record<string, number[]> {
  const start = source.indexOf(`${selector} {`)
  if (start < 0) return {}
  const body = source.slice(start, source.indexOf('}', start))
  const vars: Record<string, number[]> = {}
  for (const m of body.matchAll(/--((?:a|c|l)-[a-z0-9-]+):\s*(\d+) (\d+) (\d+);/g)) vars[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])]
  return vars
}
const tokens = (theme: 'light' | 'dark'): Record<string, number[]> => theme === 'light'
  ? { ...block(workspace, '[data-workspace]'), ...block(css, '[data-loyalty]') }
  : {
      ...block(workspace, '[data-workspace]'), ...block(workspace, '[data-workspace][data-theme="dark"]'),
      ...block(css, '[data-loyalty]'), ...block(css, '[data-loyalty][data-theme="dark"]'),
    }
const hex = (c: number[]) => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('')
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
const ratio = (a: number[], b: number[]) => contrast(hex(a), hex(b))

const PAIRS: [string, string][] = [
  ['a-text', 'a-canvas'], ['a-text', 'a-surface'], ['a-text', 'a-surface-2'],
  ['a-text-2', 'a-canvas'], ['a-text-2', 'a-surface'], ['a-text-2', 'a-surface-2'],
  ['a-side-text', 'a-side'], ['a-side-text', 'a-side-2'], ['a-side-text-2', 'a-side'], ['a-side-text-2', 'a-side-2'],
]
const SURFACES = ['a-canvas', 'a-surface', 'a-surface-2']
const HUES = ['l-hue-earn', 'l-hue-bonus', 'l-hue-rule', 'l-hue-gift', 'l-hue-offer', 'l-hue-tier', 'l-hue-place']
const TONES = ['l-st-waiting', 'l-st-approved', 'l-st-done', 'l-st-declined', 'l-st-off', 'l-plus', 'l-minus', ...HUES]
// The workspace's own tones Loyalty's pages use too (a danger line, an appointment-like state).
const SHARED = ['a-danger', 'a-st-pending', 'a-st-confirmed', 'a-st-progress', 'a-st-completed', 'a-st-cancelled', 'a-st-noshow']
// The fallback blue, a deep navy, a pale gold, and the two extremes.
const BRANDS = ['#3b82f6', '#1e3a8a', '#f5c518', '#ffffff', '#000000']
// Tier colours as programmes set them: silver, gold, platinum, bronze, a deep purple, white, black, a mid grey.
const TIERS = ['#9ca3af', '#d4a017', '#e5e4e2', '#cd7f32', '#4c1d95', '#ffffff', '#000000', '#808080', '#ff0000', '#00ff00']

for (const theme of ['light', 'dark'] as const) {
  describe(`loyalty palette — ${theme}`, () => {
    const t = tokens(theme)

    for (const [fg, bg] of PAIRS) {
      it(`--${fg} on --${bg} is at least 4.5:1`, () => {
        expect(ratio(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5)
      })
    }

    it('is the palette LOYALTY_SURFACES holds (the accent is computed against it)', () => {
      const s = LOYALTY_SURFACES[theme]
      expect(hex(t['a-canvas'])).toBe(s.canvas)
      expect(hex(t['a-surface'])).toBe(s.surface)
      expect(hex(t['a-surface-2'])).toBe(s.surface2)
      expect(hex(t['a-side'])).toBe(s.side)
    })

    if (theme === 'dark') {
      it('wears the owner\'s Figma navy (163:88): canvas, card, edge, side, both texts', () => {
        expect([t['a-canvas'], t['a-surface'], t['a-border'], t['a-side'], t['a-text'], t['a-text-2']].map(hex))
          .toEqual(['#182231', '#29384b', '#45576e', '#111b29', '#f5f7fb', '#b8c7dc'])
      })
    }

    it('on each family\'s fill (the chosen section card, a Get started panel) its title, the text and the secondary text read', () => {
      for (const hue of [...HUES, 'l-hue-off']) {
        const fill = t[`${hue}-bg`]
        expect(fill, `${hue}-bg`).toBeDefined()
        if (hue !== 'l-hue-off') expect(ratio(t[hue], fill), `${hue} on its fill`).toBeGreaterThanOrEqual(4.5)
        expect(ratio(t['a-text'], fill), `text on ${hue}-bg`).toBeGreaterThanOrEqual(4.5)
        expect(ratio(t['a-text-2'], fill), `secondary text on ${hue}-bg`).toBeGreaterThanOrEqual(4.5)
      }
    })

    if (theme === 'dark') {
      it('fills the owner\'s sections as the drafts do (163:88: tiers, benefits, places, boosts)', () => {
        expect(['l-hue-tier-bg', 'l-hue-rule-bg', 'l-hue-place-bg', 'l-hue-gift-bg'].map(k => hex(t[k]))).toEqual(['#203a5f', '#352b4a', '#183e3c', '#493a20'])
      })
    }

    it('the workspace\'s shared tones read on Loyalty\'s surfaces', () => {
      for (const tone of SHARED) {
        for (const bg of SURFACES) expect(ratio(t[tone], t[bg]), `${tone} on ${bg}`).toBeGreaterThanOrEqual(4.5)
      }
    })

    it('each state and sign reads at 4.5:1 on the surfaces and over its own 12 % tint', () => {
      for (const tone of TONES) {
        for (const bg of SURFACES) {
          expect(ratio(t[tone], t[bg]), `${tone} on ${bg}`).toBeGreaterThanOrEqual(4.5)
          expect(ratio(t[tone], mix(t[bg], t[tone], 0.12)), `${tone} on its tint over ${bg}`).toBeGreaterThanOrEqual(4.5)
        }
      }
    })

    it('reads accent text on the surfaces for any brand', () => {
      for (const brand of BRANDS) {
        const text = accentTokens(brand, theme, LOYALTY_SURFACES[theme]).text
        for (const bg of SURFACES) expect(contrast(text, hex(t[bg])), `${brand} on ${bg}`).toBeGreaterThanOrEqual(4.5)
      }
    })

    it('reads a tier\'s name on its chip for any colour, at 4.5:1 where either ink can', () => {
      for (const color of TIERS) {
        const paint = tierPaint(color, theme)
        const fill = paint.style['--l-tier'].split(' ').map(Number)
        const ink = paint.style['--l-tier-ink'].split(' ').map(Number)
        const best = Math.max(contrast('#ffffff', color), contrast('#14181c', color))
        expect(ratio(ink, fill), color).toBeGreaterThanOrEqual(Math.min(4.5, best))
      }
    })

    it('outlines a chip whose colour nearly vanishes on the surface', () => {
      expect(tierPaint(hex(t['a-surface']), theme).edge).toBe(true)
      expect(tierPaint('#4c1d95', 'light').edge).toBe(false)
    })
  })
}

describe('a tier\'s colour', () => {
  it('reads #rgb and #rrggbb in any case, and nothing else', () => {
    expect(tierHex('#ABC')).toBe('#aabbcc')
    expect(tierHex(' #D4A017 ')).toBe('#d4a017')
    expect(tierHex('gold')).toBeNull()
    expect(tierHex(null)).toBeNull()
  })

  it('takes white ink on a dark fill and dark ink on a light one', () => {
    expect(tierPaint('#4c1d95', 'light').style['--l-tier-ink']).toBe('255 255 255')
    expect(tierPaint('#e5e4e2', 'light').style['--l-tier-ink']).toBe('20 24 28')
  })

  it('a tier without a colour wears the surface with an outline', () => {
    expect(tierPaint(null, 'dark')).toEqual({ style: {}, edge: true })
  })
})
