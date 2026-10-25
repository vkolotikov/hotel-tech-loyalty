import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contrast } from '../../workspace/theme/accent'

/**
 * The verdict band's colours (verdict.css): each tone's ink reads on its fill at 4.5:1 or better — the band's reason
 * is ordinary-sized text, and a door is read from a step away —, and the three tones stay apart from one another.
 */
const css = readFileSync(new URL('./verdict.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const vars: Record<string, string> = {}
for (const m of css.matchAll(/--(l-[a-z-]+):\s*(\d+) (\d+) (\d+);/g)) vars[m[1]] = '#' + [m[2], m[3], m[4]].map(v => Number(v).toString(16).padStart(2, '0')).join('')

describe('the verdict band’s palette', () => {
  it('defines a fill and an ink for each tone', () => {
    for (const name of ['l-go', 'l-go-ink', 'l-warn', 'l-warn-ink', 'l-stop', 'l-stop-ink']) expect(vars[name], name).toMatch(/^#[0-9a-f]{6}$/)
  })

  for (const tone of ['go', 'warn', 'stop']) {
    it(`--l-${tone}-ink on --l-${tone} reads at 4.5:1 or better`, () => {
      expect(contrast(vars[`l-${tone}-ink`], vars[`l-${tone}`])).toBeGreaterThanOrEqual(4.5)
    })
  }

  it('green, amber and red are told apart by more than their hue (the icon and words say it too)', () => {
    expect(contrast(vars['l-go'], vars['l-warn'])).toBeGreaterThan(1.5)
    expect(contrast(vars['l-stop'], vars['l-warn'])).toBeGreaterThan(1.5)
  })

  it('gives every tone the verdict uses a rule', () => {
    for (const tone of ['granted', 'warning', 'denied', 'trouble']) expect(css).toContain(`[data-loyalty] [data-tone="${tone}"]`)
  })
})
