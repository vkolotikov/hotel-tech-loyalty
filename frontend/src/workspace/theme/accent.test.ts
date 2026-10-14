import { describe, expect, it } from 'vitest'
import { FALLBACK_ACCENT, accentStyle, accentTokens, contrast, tint, triplet } from './accent'

const BRANDS = ['#3b82f6', '#c9a84c', '#ffffff', '#f5f5f5', '#fde68a', '#111111', '#000000', '#0e8f7e', '#b4884d', '#9b5c8f',
  '#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4', '#0ea5e9', '#6366f1', '#8b5cf6',
  '#d946ef', '#ec4899', '#f43f5e', '#64748b', '#78716c', '#1e3a8a', '#7c2d12', '#a3e635']
// The ten industry defaults (OrganizationSetupService::industryPrimaryColor, with the hotel gold as the fallback).
const INDUSTRY_DEFAULTS = ['#d96aa8', '#4a9fd8', '#d97742', '#f97316', '#7c6fd8', '#8a99b5', '#3fae8a', '#2a9db5', '#4c6ef5', '#c9a84c']
const SURFACES = {
  light: ['#f4f6f8', '#ffffff', '#eef2f5'],
  dark: ['#0e1a24', '#13232f', '#1a2e3c'],
} as const

describe('contrast', () => {
  it('matches the WCAG known values', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 1)
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
  })
})

describe('accentTokens', () => {
  it('falls back to the default palette blue for a missing or broken colour', () => {
    expect(accentTokens(null, 'light').accent).toBe(FALLBACK_ACCENT)
    expect(accentTokens(undefined, 'dark').accent).toBe(FALLBACK_ACCENT)
    expect(accentTokens('blue', 'light').accent).toBe(FALLBACK_ACCENT)
    expect(accentTokens('#ABC', 'light').accent).toBe('#aabbcc')
    expect(accentTokens('#C9A84C', 'light').accent).toBe('#c9a84c')
  })

  for (const theme of ['light', 'dark'] as const) {
    for (const brand of BRANDS) {
      it(`${brand} in ${theme}: button text, hover and accent text all read`, () => {
        const t = accentTokens(brand, theme)
        const minInk = t.ink === '#ffffff' ? 3 : 4.5
        expect(contrast(t.ink, t.accent)).toBeGreaterThanOrEqual(minInk)
        expect(contrast(t.ink, t.deep)).toBeGreaterThanOrEqual(minInk)
        for (const s of SURFACES[theme]) expect(contrast(t.text, s)).toBeGreaterThanOrEqual(4.5)
        // accent text also sits on a 14 % accent tint over the canvas, the surface and surface-2
        for (const s of SURFACES[theme]) expect(contrast(t.text, tint(s, t.accent))).toBeGreaterThanOrEqual(4.5)
        expect(contrast(t.rail, theme === 'light' ? '#0e1a24' : '#0a141c')).toBeGreaterThanOrEqual(3)
      })
    }
  }

  it('white text while white reads at 3:1 on the brand, dark ink below (owner, 2026-10-09)', () => {
    expect(accentTokens('#3b82f6', 'light').ink).toBe('#ffffff')
    expect(accentTokens('#fde68a', 'light').ink).toBe('#0e1a24')
  })

  // Accent LINES (the focus ring, the selected card's ring, the selected row, the setup tab underline, the today ring)
  // are drawn in `text`, never in the raw brand: a line needs 3:1 against what it is drawn on (WCAG 1.4.11), and
  // most brands do not give the page that much (spec 4.2; final review, 2026-10-12).
  const LINE_BRANDS = [...BRANDS, ...INDUSTRY_DEFAULTS.filter(b => !BRANDS.includes(b))]
  for (const theme of ['light', 'dark'] as const) {
    it(`accent lines in ${theme}: the line colour reads 3:1 on the canvas, the surface and surface-2 for all ${LINE_BRANDS.length} brands`, () => {
      for (const brand of LINE_BRANDS) {
        const t = accentTokens(brand, theme)
        for (const s of SURFACES[theme]) {
          expect(contrast(t.text, s), `${brand} line (${t.text}) on ${s} in ${theme}`).toBeGreaterThanOrEqual(3)
          expect(contrast(t.text, tint(s, t.accent)), `${brand} line (${t.text}) on its tint over ${s} in ${theme}`).toBeGreaterThanOrEqual(3)
        }
      }
    })
  }

  it('shows why: the raw brand of most industries is under 3:1 on a Light surface, the line colour is not', () => {
    // Clinical blue, the Medical default (2.58:1 on surface-2).
    expect(contrast('#4a9fd8', '#eef2f5')).toBeLessThan(3)
    expect(contrast(accentTokens('#4a9fd8', 'light').text, '#eef2f5')).toBeGreaterThanOrEqual(3)
    const under = INDUSTRY_DEFAULTS.filter(b => SURFACES.light.some(s => contrast(b, s) < 3))
    expect(under.length).toBeGreaterThanOrEqual(8)
  })

  it('gives an edge to a brand that is almost the page colour', () => {
    expect(accentTokens('#ffffff', 'light').edge).toBe(true)
    expect(accentTokens('#f5f5f5', 'light').edge).toBe(true)
    expect(accentTokens('#111111', 'dark').edge).toBe(true)
    expect(accentTokens('#3b82f6', 'light').edge).toBe(false)
    expect(accentTokens('#3b82f6', 'dark').edge).toBe(false)
  })

  it('judges the edge on the weakest of the canvas, the surface and surface-2, not on the surface alone', () => {
    // Lime in Light: 1.39 / 1.51 / 1.34. Navy in Dark: 1.70 / 1.55 / 1.35. Each is only under 1.5 on surface-2 (lime also on the canvas).
    expect(contrast('#a3e635', '#ffffff')).toBeGreaterThan(1.5)
    expect(contrast('#a3e635', '#eef2f5')).toBeLessThan(1.5)
    expect(accentTokens('#a3e635', 'light').edge).toBe(true)
    expect(contrast('#1e3a8a', '#13232f')).toBeGreaterThan(1.5)
    expect(contrast('#1e3a8a', '#1a2e3c')).toBeLessThan(1.5)
    expect(accentTokens('#1e3a8a', 'dark').edge).toBe(true)
    // Brands that stand out from all three keep a plain fill.
    expect(accentTokens('#c9a84c', 'light').edge).toBe(false)
    expect(accentTokens('#4a9fd8', 'light').edge).toBe(false)
    expect(accentTokens('#1e3a8a', 'light').edge).toBe(false)
  })

  it('writes the CSS variables as triplets', () => {
    expect(triplet('#0e1a24')).toBe('14 26 36')
    const style = accentStyle(accentTokens('#c9a84c', 'light'))
    expect(Object.keys(style).sort()).toEqual(['--a-accent', '--a-accent-deep', '--a-accent-ink', '--a-accent-rail', '--a-accent-text'])
    expect(style['--a-accent']).toBe('201 168 76')
  })
})
