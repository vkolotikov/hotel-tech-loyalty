import { describe, expect, it } from 'vitest'
// @ts-ignore -- tailwind.config.js is plain JS outside the app's tsconfig
import config from '../../tailwind.config.js'
import { GLASS_SCOPE } from './glassTokens'

type Block = Record<string, string>

/** Run the config's Glass plugin and collect what it adds to the base layer. */
function glassBase(): Record<string, Block | Record<string, Block>> {
  let base: Record<string, Block | Record<string, Block>> = {}
  for (const p of config.plugins) p.handler({ addBase: (b: typeof base) => { base = { ...base, ...b } } })
  return base
}

const extend = config.theme.extend

describe('Tailwind tokens in Classic', () => {
  it('fall back to exactly the values Classic used before, with Royal blue as the default brand', () => {
    expect(extend.colors.primary[500]).toBe('rgb(var(--color-primary-500, 59 130 246) / <alpha-value>)')
    expect(extend.colors.dark.surface).toBe(
      'rgb(var(--style-dark-surface, var(--color-dark-surface, 22 22 22)) / calc(var(--alpha-dark-surface, 1) * <alpha-value>))',
    )
    expect(extend.textColor.red[400]).toBe('rgb(var(--tc-red-400, 248 113 113) / <alpha-value>)')
    expect(extend.textColor.gray[500]).toBe('rgb(var(--tc-gray-500, 107 114 128) / <alpha-value>)')
    expect(extend.textColor.success).toBe('rgb(var(--tc-success, 50 215 75) / <alpha-value>)')
    expect(extend.colors.success).toBe('rgb(50 215 75 / <alpha-value>)')
    expect(extend.borderRadius.xl).toBe('var(--radius-xl, 0.75rem)')
  })

  it('keeps every clean-up token at the exact colour it replaced, whatever the palette', () => {
    const greys: Record<string, string> = { panel: '30 30 30', 'panel-dim': '26 26 26', 'panel-raised': '51 51 51', well: '17 17 17' }
    for (const [name, rgb] of Object.entries(greys)) {
      expect(extend.colors[name]).toBe(`rgb(var(--style-${name}, ${rgb}) / calc(var(--alpha-${name}, 1) * <alpha-value>))`)
    }
    expect(extend.colors['t-soft']).toBe('rgb(var(--style-text-soft, 160 160 160) / <alpha-value>)')
    const status: Record<string, string> = { success: '50 215 75', danger: '255 55 95', notice: '10 132 255' }
    for (const [name, rgb] of Object.entries(status)) {
      expect(extend.colors[name]).toBe(`rgb(${rgb} / <alpha-value>)`)
      expect(extend.textColor[name]).toBe(`rgb(var(--tc-${name}, ${rgb}) / <alpha-value>)`)
    }
  })
})

describe('the Glass variable block', () => {
  const block = glassBase()[GLASS_SCOPE] as Block

  it('is scoped to the signed-in admin and sets the Glass values', () => {
    expect(block['--style-dark-surface']).toBe('255 255 255')
    expect(block['--alpha-dark-surface']).toBe('0.07')
    expect(block['--tc-primary-400']).toBe('var(--glass-primary-400)')
    expect(block['--tc-red-400']).toBe('252 165 165')
    expect(block['--tc-indigo-500']).toBe('165 180 252')
    expect(block['--tc-gray-500']).toBe('200 208 221')
    expect(block['--radius-xl']).toBe('16px')
  })

  it('defines every style variable the tokens read (no typo leaves a token on Classic)', () => {
    const source = JSON.stringify({ colors: extend.colors, textColor: extend.textColor, placeholderColor: extend.placeholderColor })
    const read = new Set([...source.matchAll(/var\((--(?:style|tc)-[a-z0-9-]+)/g)].map(m => m[1]))
    expect(read.size).toBeGreaterThan(100)
    for (const name of read) expect(block[name], name).toBeDefined()
  })

  it('has solid stand-ins for reduced transparency and no blur', () => {
    const base = glassBase()
    const reduced = base['@media (prefers-reduced-transparency: reduce)'] as Record<string, Block>
    expect(reduced[GLASS_SCOPE]['--alpha-dark-surface']).toBe('1')
    expect(reduced[GLASS_SCOPE]['--style-dark-surface']).toBe('26 34 51')
  })
})
