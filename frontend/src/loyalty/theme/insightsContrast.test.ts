import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contrast } from '../../workspace/theme/accent'

/**
 * Insights' chart colours (spec 2026-10-21 release 2 §5; theme/insights.css): three series, each a mark of at least
 * 3:1 on the card surface, told apart from each other for full colour vision and under the two common red-green
 * deficiencies, in light and in dark; and every rule of the file under [data-loyalty], as loyalty.css's are.
 */
const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '')
const css = strip(readFileSync(new URL('./insights.css', import.meta.url), 'utf8'))
const loyalty = strip(readFileSync(new URL('./loyalty.css', import.meta.url), 'utf8'))

function block(source: string, selector: string): Record<string, number[]> {
  const start = source.indexOf(`${selector} {`)
  if (start < 0) return {}
  const body = source.slice(start, source.indexOf('}', start))
  const vars: Record<string, number[]> = {}
  for (const m of body.matchAll(/--((?:a|l)-[a-z0-9-]+):\s*(\d+) (\d+) (\d+);/g)) vars[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])]
  return vars
}
const tokens = (theme: 'light' | 'dark') => theme === 'light'
  ? { ...block(loyalty, '[data-loyalty]'), ...block(css, '[data-loyalty]') }
  : { ...block(loyalty, '[data-loyalty]'), ...block(loyalty, '[data-loyalty][data-theme="dark"]'), ...block(css, '[data-loyalty]'), ...block(css, '[data-loyalty][data-theme="dark"]') }
const hex = (c: number[]) => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('')

// sRGB → linear → OKLab (×100), and the Machado, Oliveira & Fernandes (2009) simulations at full severity.
const linear = (c: number[]) => c.map(v => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 })
const MACHADO: Record<'protan' | 'deutan', number[][]> = {
  protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
}
function oklab([r, g, b]: number[]): number[] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}
const clamp = (v: number) => Math.min(1, Math.max(0, v))
const simulate = (rgb: number[], kind: 'protan' | 'deutan') => MACHADO[kind].map(row => clamp(row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2]))
const distance = (a: number[], b: number[]) => Math.hypot(...a.map((v, i) => v - b[i])) * 100

const SERIES = ['l-chart-1', 'l-chart-2', 'l-chart-3']

for (const theme of ['light', 'dark'] as const) {
  describe(`chart colours — ${theme}`, () => {
    const t = tokens(theme)

    it('defines the three series', () => {
      for (const name of SERIES) expect(t[name], name).toHaveLength(3)
    })

    it('draws each series at 3:1 or better on the card surface', () => {
      for (const name of SERIES) expect(contrast(hex(t[name]), hex(t['a-surface'])), name).toBeGreaterThanOrEqual(3)
    })

    it('tells every pair apart, for full colour vision and under protanopia and deuteranopia', () => {
      for (let i = 0; i < SERIES.length; i++) {
        for (let j = i + 1; j < SERIES.length; j++) {
          const a = linear(t[SERIES[i]])
          const b = linear(t[SERIES[j]])
          expect(distance(oklab(a), oklab(b)), `${SERIES[i]} / ${SERIES[j]}`).toBeGreaterThanOrEqual(15)
          for (const kind of ['protan', 'deutan'] as const) {
            expect(distance(oklab(simulate(a, kind)), oklab(simulate(b, kind))), `${SERIES[i]} / ${SERIES[j]} ${kind}`).toBeGreaterThanOrEqual(8)
          }
        }
      }
    })
  })
}

describe('insights.css', () => {
  it('scopes every rule under [data-loyalty]', () => {
    const selectors = [...css.matchAll(/(^|[{}])\s*([^{}@]+)\{/g)].map(m => m[2].trim()).filter(Boolean)
    expect(selectors.length).toBeGreaterThan(5)
    for (const selector of selectors) {
      for (const part of selector.split(',')) expect(part.trim().startsWith('[data-loyalty]'), `unscoped selector: ${part.trim()}`).toBe(true)
    }
  })
})
