import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FIT_SHARE, fitCqi } from './fitFigure'

/**
 * Widths measured in the browser (Chrome, the strip's own figure: A Display 300, tabular, tracking -0.025em),
 * in ems: the width at 30 px divided by 30.
 */
const EMS = {
  '8': 16.1 / 30,
  '13:00': 66.4 / 30,
  '£1,234.50': 122.1 / 30,
  '€12,345.50': 139.4 / 30,
  'CHF 1,234.50': 170.3 / 30,
  'UAH 125,000.00': 215.5 / 30,
  'UAH 125 000,00': 216 / 30,
  '125,000.00': 145 / 30,
}
/** A tile's inner width (px) in each layout, measured: 1440 closed and with the panel, 1280 closed and with it (two by two), 1024 closed and with it (the narrowest). */
const TILES = { '1440': 169, '1440+panel': 131, '1280': 129, '1280+panel': 228, '1024': 137, '1024+panel': 104 }

/** The clamp the strip's CSS gives a fitted figure, read from appointments.css: min, the share of the tile's width, max. */
const css = readFileSync(new URL('../theme/appointments.css', import.meta.url), 'utf8')
const rule = css.match(/\[data-appointments\] \[data-glance\] \[data-fit\]\s*\{\s*font-size: clamp\(([\d.]+)rem, calc\(var\(--a-fit, (\d+)\) \* 1cqi\), ([\d.]+)rem\);\s*overflow-wrap: anywhere;\s*\}/)
const MIN = Number(rule?.[1]) * 16
const MAX = Number(rule?.[3]) * 16
/** The size the browser gives a figure `ems` wide in a tile `inner` px wide. */
const sizeIn = (ems: number, inner: number) => Math.min(MAX, Math.max(MIN, ((fitCqi(ems) ?? Number(rule?.[2])) * inner) / 100))

describe('fitCqi', () => {
  it('is the figure\'s size, in cqi, at which its text takes 98 % of its tile', () => {
    expect(FIT_SHARE).toBe(98)
    expect(fitCqi(4)).toBeCloseTo(24.5)
    expect(fitCqi(2)).toBeCloseTo(49)
  })

  it('is null when there is nothing to measure (no text, not laid out yet)', () => {
    expect(fitCqi(0)).toBeNull()
    expect(fitCqi(-1)).toBeNull()
    expect(fitCqi(Number.NaN)).toBeNull()
    expect(fitCqi(Number.POSITIVE_INFINITY)).toBeNull()
  })
})

describe('the strip\'s fitted figures (appointments.css with fitCqi)', () => {
  it('are clamped between 18 px (1.125rem) and the design\'s 30 px (1.875rem)', () => {
    expect(rule).not.toBeNull()
    expect(MIN).toBe(18)
    expect(MAX).toBe(30)
  })

  it('never run out of their tile: each fits on its line, or it is at 18 px and wraps at its space (never for a figure without one)', () => {
    for (const [text, ems] of Object.entries(EMS)) {
      for (const [layout, inner] of Object.entries(TILES)) {
        const size = sizeIn(ems, inner)
        if (ems * size > inner) {
          expect(size, `${text} at ${layout}`).toBe(MIN)
          expect(text, `${text} at ${layout} has no space to wrap at`).toMatch(/^[A-Z]{3} /)
          expect(EMS['125,000.00'] * MIN, `${text}: its amount alone fits at ${layout}`).toBeLessThanOrEqual(inner)
        }
      }
    }
  })

  it('keep the design\'s 30 px wherever the figure fits at 30 px: the count and the time always, "£1,234.50" from 1280', () => {
    for (const [layout, inner] of Object.entries(TILES)) {
      expect(sizeIn(EMS['8'], inner), layout).toBe(30)
      expect(sizeIn(EMS['13:00'], inner), layout).toBe(30)
      if (EMS['£1,234.50'] * 30 <= inner * 0.98) expect(sizeIn(EMS['£1,234.50'], inner), layout).toBe(30)
    }
    expect(sizeIn(EMS['£1,234.50'], TILES['1280'])).toBe(30)
    expect(sizeIn(EMS['£1,234.50'], TILES['1440+panel'])).toBe(30)
  })

  it('shrink a long amount only as far as its tile needs: "CHF 1,234.50" on one line at every width, "€12,345.50" too', () => {
    for (const [layout, inner] of Object.entries(TILES)) {
      for (const text of ['CHF 1,234.50', '€12,345.50'] as const) {
        const size = sizeIn(EMS[text], inner)
        expect(EMS[text] * size, `${text} at ${layout}`).toBeLessThanOrEqual(inner)
        expect(size, `${text} at ${layout}`).toBeGreaterThanOrEqual(MIN)
      }
    }
    expect(sizeIn(EMS['CHF 1,234.50'], TILES['1280'])).toBeCloseTo(22.3, 0)
    expect(sizeIn(EMS['€12,345.50'], TILES['1280'])).toBeCloseTo(27.2, 0)
  })
})

describe('Figure, fitted', () => {
  // Effects do not run in a static render: the measuring is read from the source.
  const source = readFileSync(new URL('./Typography.tsx', import.meta.url), 'utf8')

  it('measures its text in ems before paint and on every change of text, and again when the display face arrives', () => {
    expect(source).toMatch(/useLayoutEffect\(\(\) => \{/)
    expect(source).toMatch(/el\.style\.setProperty\('--a-fit', /)
    expect(source).toMatch(/fitCqi\(emsOf\(el\)\)/)
    expect(source).toMatch(/fonts\?\.addEventListener\('loadingdone', measure\)/)
    expect(source).toMatch(/\}, \[fit, text\]\)/)
  })
})
