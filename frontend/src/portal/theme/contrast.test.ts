import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The portal's status tones are drawn as text in the tone over a 10 % tint of the same tone
 * (`Notice`, `Chip`: `bg-p-success/10 text-p-success`), on the page paper or on a card surface.
 * Task 21 measured the light success pair — the "You're booked" banner, "coupon applied" and the
 * "Confirmed" chip — at 4.31:1 on the paper. This pins every tone pair at ≥ 4.5:1 in both modes.
 */
const css = readFileSync(new URL('./portal.css', import.meta.url), 'utf8')

function block(selector: string): Record<string, number[]> {
  const start = css.indexOf(selector + ' {')
  const body = css.slice(start, css.indexOf('}', start))
  const vars: Record<string, number[]> = {}
  for (const m of body.matchAll(/--p-([a-z0-9-]+):\s*(\d+) (\d+) (\d+);/g)) vars[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])]
  return vars
}

const lum = (c: number[]) => {
  const f = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
}
const ratio = (a: number[], b: number[]) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
const tint = (tone: number[], under: number[]) => tone.map((v, i) => v * 0.1 + under[i] * 0.9)

// Dark mode is written twice: once for the OS preference (`@media (prefers-color-scheme: dark)`, unless the root
// forces light) and once for a root that forces dark. Every check below runs on all three blocks.
const MODES = [
  ['light', block('[data-portal]')],
  ['dark (forced)', block('[data-portal][data-portal-theme="dark"]')],
  ['dark (OS preference)', block('[data-portal]:not([data-portal-theme="light"])')],
] as const

describe('portal dark blocks', () => {
  it('the OS-preference dark block and the forced dark block carry the same colours', () => {
    const os = block('[data-portal]:not([data-portal-theme="light"])')
    expect(Object.keys(os).length).toBeGreaterThan(0)
    expect(os).toEqual(block('[data-portal][data-portal-theme="dark"]'))
  })
})

describe('portal sheet scrim', () => {
  // Task 21 browser pass: the sheet's backdrop was `bg-p-text/40`, and in dark mode --p-text is near-white,
  // so opening the booking sheet washed the dark page GREY (the active tab behind it read as a white bar)
  // instead of dimming it. A scrim must darken the page in both modes.
  for (const [mode, vars] of MODES) {
    it(`${mode}: --p-scrim is at least as dark as the page`, () => {
      expect(vars.scrim).toBeDefined()
      expect(lum(vars.scrim)).toBeLessThanOrEqual(lum(vars.bg))
    })
  }
})

describe('portal tone contrast', () => {
  for (const [mode, vars] of MODES) {
    for (const tone of ['success', 'warning', 'danger']) {
      for (const under of ['bg', 'surface']) {
        it(`${mode}: ${tone} text on its 10% tint over --p-${under} is at least 4.5:1`, () => {
          expect(vars[tone]).toBeDefined()
          expect(ratio(vars[tone], tint(vars[tone], vars[under]))).toBeGreaterThanOrEqual(4.5)
        })
      }
    }
  }
})
