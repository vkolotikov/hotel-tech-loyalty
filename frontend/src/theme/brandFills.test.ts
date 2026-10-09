import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrast, hexToRgb } from './colour'

/**
 * Text on coloured fills, and colour classes that do not exist.
 *
 * Brand fills (bg-primary-400…700) take their text from text-on-primary:
 * white while white reads at 3:1 on the brand colour, dark ink below that
 * (onColor in glass.ts). A plain text-white there is unreadable for a gold or
 * emerald brand, a plain text-black for a navy one. The green buttons and toggles (#74c895 → #5ab4b2) are too
 * light for white at all. Tailwind generates nothing for a colour it does not
 * know, so gold-* and primary-gold classes leave an element without its fill.
 */
const SRC = path.resolve(__dirname, '..')
const SOLID_BRAND_FILL = /(?<![\w:/-])(?:bg|from)-primary-(?:400|500|600|700)(?:\/(?:8\d|9\d|100))?(?![\w/-])/
const PLAIN_TEXT = /(?<![\w:/[-])text-(?:white|black|dark-bg)(?![\w/-])/
const UNDEFINED_COLOUR = /(?<![\w-])(?:bg|text|border|ring|from|via|to|shadow)-(?:gold-\d{2,3}|primary-gold)(?![\w-])/g
// The green start colour, plain or behind a --color-primary* variable that is never set.
const GREEN_STYLE = /\{[^{}]*linear-gradient\(135deg, (?:#74c895|var\(--color-primary, #74c895\)|rgb\(var\(--color-primary-rgb, 116,200,149\)\))[^{}]*\}/g
const GREEN_INK = '#03050A'

function sourceFiles(dir: string, skip: string[]): string[] {
  return fs.readdirSync(dir).flatMap(entry => {
    const full = path.join(dir, entry)
    const rel = path.relative(SRC, full).split(path.sep).join('/')
    if (fs.statSync(full).isDirectory()) return skip.includes(rel) ? [] : sourceFiles(full, skip)
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : []
  })
}

/** Class text that lands on one element: each quoted string, and a template literal's static text. */
function classChunks(source: string): string[] {
  const chunks: string[] = []
  for (const [literal] of source.matchAll(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g)) {
    if (literal[0] !== '`') {
      chunks.push(literal)
      continue
    }
    const parts = literal.split(/(\$\{[^}]*\})/)
    chunks.push(parts.filter((_, i) => i % 2 === 0).join(' '))
    for (const expression of parts.filter((_, i) => i % 2 === 1)) chunks.push(...classChunks(expression.slice(2, -1)))
  }
  return chunks
}

const rel = (file: string) => path.relative(SRC, file).split(path.sep).join('/')
const adminFiles = sourceFiles(SRC, ['portal', 'appointments'])

describe('text on coloured fills', () => {
  it('scans the admin source', () => {
    expect(adminFiles.length).toBeGreaterThan(150)
  })

  it('gives every solid brand fill text-on-primary, never text-white, text-black or text-dark-bg', () => {
    const offenders = adminFiles.flatMap(file =>
      classChunks(fs.readFileSync(file, 'utf8'))
        .filter(chunk => SOLID_BRAND_FILL.test(chunk) && PLAIN_TEXT.test(chunk))
        .map(chunk => `${rel(file)}: ${chunk.slice(0, 120)}`),
    )
    expect(offenders).toEqual([])
  })

  it('puts dark text on every green gradient button and toggle', () => {
    const styles = adminFiles.flatMap(file =>
      [...fs.readFileSync(file, 'utf8').matchAll(GREEN_STYLE)].map(([style]) => ({ file: rel(file), style })),
    )
    expect(styles.length).toBeGreaterThanOrEqual(13)
    expect(styles.filter(({ style }) => !style.includes(`color: '${GREEN_INK}'`))).toEqual([])
    for (const stop of ['#74c895', '#5ab4b2']) {
      expect(contrast(hexToRgb(GREEN_INK), hexToRgb(stop)), stop).toBeGreaterThanOrEqual(4.5)
    }
  })
})

describe('colour names Tailwind knows', () => {
  it('uses no gold-* or primary-gold classes anywhere', () => {
    const offenders = sourceFiles(SRC, []).flatMap(file =>
      (fs.readFileSync(file, 'utf8').match(UNDEFINED_COLOUR) ?? []).map(cls => `${rel(file)}: ${cls}`),
    )
    expect(offenders).toEqual([])
  })
})
