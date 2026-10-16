import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Content's own colours (spec §6.2): every platform's mark reads (white ink while white reads 4.5:1 on the fill,
 * else the dark ink — owner, 2026-10-15), and every post status's tone reads 4.5:1 as text over its own 12 % tint
 * and on the bare canvas and surface, in Light and in Dark.
 */
const css = readFileSync(new URL('./content.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const workspace = readFileSync(new URL('../../workspace/theme/workspace.css', import.meta.url), 'utf8')

function block(source: string, selector: string, prefix: string): Record<string, number[]> {
  const start = source.indexOf(`${selector} {`)
  if (start < 0) return {}
  const body = source.slice(start, source.indexOf('}', start))
  const vars: Record<string, number[]> = {}
  for (const m of body.matchAll(new RegExp(`--${prefix}([a-z0-9-]+):\\s*(\\d+) (\\d+) (\\d+);`, 'g'))) vars[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])]
  return vars
}
const lum = (c: number[]) => {
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
}
const ratio = (a: number[], b: number[]) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
const tint = (tone: number[], under: number[], k = 0.12) => tone.map((v, i) => v * k + under[i] * (1 - k))

const WHITE = [255, 255, 255]
const PLATFORMS = ['linkedin', 'instagram', 'tiktok', 'facebook', 'x', 'youtube', 'blog', 'email']
const STATUSES = ['idea', 'draft', 'review', 'visual', 'approved', 'ready', 'published', 'skipped', 'archived']
const pf = (p: string, dark: boolean) => ({
  ...block(css, `[data-content] [data-platform="${p}"]`, 'c-'),
  ...(dark ? block(css, `[data-content][data-theme="dark"] [data-platform="${p}"]`, 'c-') : {}),
})
const THEMES = [
  { name: 'light', dark: false, own: block(css, '[data-content]', 'c-'), surfaces: block(workspace, '[data-workspace]', 'a-') },
  {
    name: 'dark', dark: true,
    own: { ...block(css, '[data-content]', 'c-'), ...block(css, '[data-content][data-theme="dark"]', 'c-') },
    surfaces: { ...block(workspace, '[data-workspace]', 'a-'), ...block(workspace, '[data-workspace][data-theme="dark"]', 'a-') },
  },
]

for (const theme of THEMES) {
  describe(`content colours — ${theme.name}`, () => {
    for (const p of PLATFORMS) {
      it(`${p}: white ink where white reads 4.5:1 on its fill, else the dark ink — and the ink reads 4.5:1`, () => {
        const v = pf(p, theme.dark)
        expect(v.pf, `--c-pf of ${p}`).toBeDefined()
        const white = ratio(WHITE, v.pf) >= 4.5
        expect(v['pf-ink']).toEqual(white ? WHITE : theme.own.ink)
        expect(ratio(v['pf-ink'], v.pf)).toBeGreaterThanOrEqual(4.5)
      })
    }
    for (const s of STATUSES) {
      for (const under of ['canvas', 'surface']) {
        it(`status ${s} reads 4.5:1 over its tint on ${under}, and on ${under} itself`, () => {
          const tone = theme.own[`st-${s}`]
          expect(tone, `--c-st-${s}`).toBeDefined()
          expect(ratio(tone, tint(tone, theme.surfaces[under]))).toBeGreaterThanOrEqual(4.5)
          expect(ratio(tone, theme.surfaces[under])).toBeGreaterThanOrEqual(4.5)
        })
      }
    }
  })
}

describe('content stylesheet', () => {
  it('marks the open post\'s card with a ring beside its platform edge (one box-shadow carries both)', () => {
    expect(css).toMatch(/\[data-content\] \.c-edge\[aria-current="true"\]\s*\{[^}]*inset 3px 0 0 rgb\(var\(--c-pf\)\),\s*0 0 0 2px rgb\(var\(--a-accent-text\)\)/)
  })

  it('maps every status the server sends to a tone', () => {
    for (const s of ['idea', 'draft', 'needs_review', 'needs_visual', 'approved', 'ready_to_publish', 'published', 'skipped', 'archived']) {
      expect(css, s).toContain(`[data-content] [data-status="${s}"]`)
    }
  })
})
