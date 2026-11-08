import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CRM_SURFACES, accentTokens, contrast } from '../../workspace/theme/accent'

/**
 * HexaTech CRM's palette (2026-11-07, Dark by default): equal to CRM_SURFACES (the accent is worked out on it); every
 * text pair at 4.5:1 or better; the shared status tones, the danger tone and the AI's violet read on every surface and
 * on their own 12 % tints, in both themes; the accent's text reads for brand colours venues pick, and its ink on the
 * accent by the shared 3:1 rule for bold labels (accent.ts).
 */
const css = readFileSync(new URL('./crm.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const workspace = readFileSync(new URL('../../workspace/theme/workspace.css', import.meta.url), 'utf8')

function block(source: string, selector: string): Record<string, number[]> {
  const start = source.indexOf(`${selector} {`)
  if (start < 0) return {}
  const body = source.slice(start, source.indexOf('}', start))
  const vars: Record<string, number[]> = {}
  for (const m of body.matchAll(/--((?:a|crm)-[a-z0-9-]+):\s*(\d+) (\d+) (\d+);/g)) vars[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])]
  return vars
}
const tokens = (theme: 'light' | 'dark'): Record<string, number[]> => theme === 'light'
  ? { ...block(workspace, '[data-workspace]'), ...block(css, '[data-crm]') }
  : { ...block(workspace, '[data-workspace]'), ...block(workspace, '[data-workspace][data-theme="dark"]'), ...block(css, '[data-crm]'), ...block(css, '[data-crm][data-theme="dark"]') }
const hex = (c: number[]) => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('')
const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
const ratio = (a: number[], b: number[]) => contrast(hex(a), hex(b))

const PAIRS: [string, string][] = [
  ['a-text', 'a-canvas'], ['a-text', 'a-surface'], ['a-text', 'a-surface-2'],
  ['a-text-2', 'a-canvas'], ['a-text-2', 'a-surface'], ['a-text-2', 'a-surface-2'],
  ['a-side-text', 'a-side'], ['a-side-text', 'a-side-2'], ['a-side-text-2', 'a-side'], ['a-side-text-2', 'a-side-2'],
]
const SURFACES = ['a-canvas', 'a-surface', 'a-surface-2']
const TONES = ['a-danger', 'a-st-pending', 'a-st-confirmed', 'a-st-progress', 'a-st-completed', 'a-st-cancelled', 'crm-ai-text']
const BRANDS = ['#3b82f6', '#1e3a8a', '#0f766e', '#f5c518', '#e11d48', '#ffffff', '#000000']

for (const theme of ['light', 'dark'] as const) {
  describe(`crm palette — ${theme}`, () => {
    const t = tokens(theme)

    it('is the palette CRM_SURFACES holds', () => {
      const s = CRM_SURFACES[theme]
      expect([hex(t['a-canvas']), hex(t['a-surface']), hex(t['a-surface-2']), hex(t['a-side'])]).toEqual([s.canvas, s.surface, s.surface2, s.side])
    })

    for (const [fg, bg] of PAIRS) {
      it(`--${fg} on --${bg} is at least 4.5:1`, () => {
        expect(ratio(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5)
      })
    }

    for (const tone of TONES) {
      it(`--${tone} reads on every surface and on its own 12 % tint`, () => {
        const ink = tone === 'crm-ai-text' ? t['crm-ai'] : t[tone]
        for (const surface of SURFACES) {
          expect(ratio(t[tone], t[surface]), `${tone} on ${surface}`).toBeGreaterThanOrEqual(4.5)
          expect(ratio(t[tone], mix(t[surface], ink, 0.12)), `${tone} on its tint over ${surface}`).toBeGreaterThanOrEqual(4.5)
        }
      })
    }

    it('works the accent out so its text reads on the surfaces, and its ink on the accent by the 3:1 rule of bold labels', () => {
      for (const brand of BRANDS) {
        const a = accentTokens(brand, theme, CRM_SURFACES[theme])
        expect(contrast(a.text, CRM_SURFACES[theme].surface), `${brand} text`).toBeGreaterThanOrEqual(4.5)
        expect(contrast(a.ink, a.accent), `${brand} ink`).toBeGreaterThanOrEqual(3)
      }
    })
  })
}
