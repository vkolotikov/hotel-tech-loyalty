import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Every text-on-background pair the workspace draws, at 4.5:1 or better.
 * Status tones are drawn as text in the tone over a 12 % tint of the same
 * tone (cards, StatusMark, Notice), on the canvas, a white surface or the
 * outside-hours surface.
 */
const css = readFileSync(new URL('./appointments.css', import.meta.url), 'utf8')
const start = css.indexOf('[data-appointments] {')
const body = css.slice(start, css.indexOf('}', start))
const vars: Record<string, number[]> = {}
for (const m of body.matchAll(/--a-([a-z0-9-]+):\s*(\d+) (\d+) (\d+);/g)) vars[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])]

const lum = (c: number[]) => {
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
}
const ratio = (a: number[], b: number[]) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
const tint = (tone: number[], under: number[], k = 0.12) => tone.map((v, i) => v * k + under[i] * (1 - k))

describe('appointments tokens', () => {
  it('defines every token the Tailwind aliases read', () => {
    for (const name of ['canvas', 'surface', 'surface-2', 'text', 'text-2', 'border', 'side', 'side-2', 'side-text', 'side-text-2', 'accent', 'accent-ink', 'accent-deep', 'danger', 'st-pending', 'st-confirmed', 'st-progress', 'st-completed', 'st-cancelled', 'st-noshow']) {
      expect(vars[name], `--a-${name} is missing`).toBeDefined()
    }
  })

  const pairs: [string, string][] = [
    ['text', 'canvas'], ['text', 'surface'], ['text', 'surface-2'],
    ['text-2', 'canvas'], ['text-2', 'surface'], ['text-2', 'surface-2'],
    ['side-text', 'side'], ['side-text', 'side-2'], ['side-text-2', 'side'], ['side-text-2', 'side-2'],
    ['accent-ink', 'accent'], ['accent-ink', 'accent-deep'], ['accent-ink', 'danger'],
    ['accent-deep', 'canvas'], ['accent-deep', 'surface'], ['accent-deep', 'surface-2'],
  ]
  for (const [fg, bg] of pairs) {
    it(`--a-${fg} on --a-${bg} is at least 4.5:1`, () => {
      expect(ratio(vars[fg], vars[bg])).toBeGreaterThanOrEqual(4.5)
    })
  }

  for (const tone of ['st-pending', 'st-confirmed', 'st-progress', 'st-completed', 'st-cancelled', 'st-noshow', 'danger']) {
    for (const under of ['canvas', 'surface', 'surface-2']) {
      it(`--a-${tone} text on its 12% tint over --a-${under} is at least 4.5:1`, () => {
        expect(ratio(vars[tone], tint(vars[tone], vars[under]))).toBeGreaterThanOrEqual(4.5)
      })
    }
  }

  it('the focus ring (accent) stands out from a surface, and the rail\'s ring (side text) from the rail', () => {
    expect(ratio(vars.accent, vars.surface)).toBeGreaterThanOrEqual(3)
    expect(ratio(vars['side-text'], vars.side)).toBeGreaterThanOrEqual(3)
  })

  // A card draws the client (text) and the service (text-2) over its tone's tint on a white column.
  for (const tone of ['st-pending', 'st-confirmed', 'st-progress', 'st-completed', 'st-cancelled', 'st-noshow']) {
    for (const fg of ['text', 'text-2']) {
      it(`--a-${fg} on the 12% tint of --a-${tone} is at least 4.5:1`, () => {
        expect(ratio(vars[fg], tint(vars[tone], vars.surface))).toBeGreaterThanOrEqual(4.5)
      })
    }
  }

  it('a narrow card drops the status word from view without removing it from the page', () => {
    const block = css.slice(css.indexOf('@container'))
    expect(css).toContain('container-type: inline-size')
    expect(block).toMatch(/@container \(max-width: \d+px\)\s*\{\s*\[data-appointments\] \[data-density\] \[data-status-word\]/)
    expect(block).not.toMatch(/display:\s*none/) // hidden from sight only: the word stays in the card's name
  })

  it('the rail\'s pale ring is drawn on the rail only — the panel and the month are white and keep the accent', () => {
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(rules).toContain('[data-appointments] [data-rail] :focus-visible')
    expect(rules).not.toMatch(/\baside\s+:focus-visible/)
    expect(ratio(vars['side-text'], vars.surface)).toBeLessThan(3) // why it must never reach a white surface
  })
})
