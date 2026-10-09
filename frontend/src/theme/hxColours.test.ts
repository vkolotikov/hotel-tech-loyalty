import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { HX_FILL, HX_TEXT } from './hxColours'

const SRC = path.resolve(__dirname, '..')
function adminFiles(dir: string): string[] {
  return fs.readdirSync(dir).flatMap(entry => {
    const full = path.join(dir, entry)
    const rel = path.relative(SRC, full).split(path.sep).join('/')
    if (fs.statSync(full).isDirectory()) return rel === 'portal' || rel === 'appointments' ? [] : adminFiles(full)
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : []
  })
}
const source = adminFiles(SRC).map(f => fs.readFileSync(f, 'utf8')).join('\n')
// <variants:>prop-hx-<hex>; text and placeholder read the text registry, every other prop the fill registry.
const HX_CLASS = /(?<![\w-])(?:[\w-]+:)*([a-z]+(?:-[a-z]+)*)-hx-([0-9a-f]{6})(?![\w-])/g
const INLINE = /\bhx\(\s*'([tf])',\s*'#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})'/g
const six = (h: string) => (h.length === 3 ? h.split('').map(c => c + c).join('') : h).toLowerCase()

function used(kind: 't' | 'f'): string[] {
  const out = new Set<string>()
  for (const m of source.matchAll(HX_CLASS)) {
    const isText = m[1] === 'text' || m[1] === 'placeholder'
    if ((kind === 't') === isText) out.add(m[2])
  }
  for (const m of source.matchAll(INLINE)) if (m[1] === kind) out.add(six(m[2]))
  return [...out].sort()
}

describe('hard-coded colour registry', () => {
  it('has every hx text colour the source uses, and nothing it does not', () => {
    expect(used('t')).toEqual([...HX_TEXT].sort())
  })

  it('has every hx fill colour the source uses, and nothing it does not', () => {
    expect(used('f')).toEqual([...HX_FILL].sort())
  })

  it('keeps the registries as 6-digit lowercase hex without #', () => {
    for (const hex of [...HX_TEXT, ...HX_FILL]) expect(hex).toMatch(/^[0-9a-f]{6}$/)
  })
})
