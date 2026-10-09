import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Screens converted for Clean light (Tasks 8-14 add their files).
 *
 * Rule: the whole file is scanned, not just style blocks. Comments are
 * stripped first (block comments, and `//` comments that start a line or
 * follow whitespace; a `//` inside a URL is kept), then every hx(…) and
 * hxWhite(…) call is removed. Whatever colour literal remains is reported:
 * `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()`/`rgba()`/`hsl()`/`hsla()`
 * with numeric arguments, and `colorScheme: 'dark'`.
 *
 * DATA_COLOURS[file] is a multiset: each listed value allows exactly one
 * occurrence in that file (list a value twice to allow two). Data colours
 * are series palettes, brand swatches, status dots and inline black
 * shadows that read on paper as they are.
 *
 * Known limit: a `//` preceded by whitespace inside a string literal is
 * treated as a comment. Inside JSX text, a colour literal written in prose
 * is reported like any other, which is the intended strictness.
 */
export const CONVERTED_FILES: string[] = []
export const DATA_COLOURS: Record<string, string[]> = {}

const SRC = path.resolve(__dirname, '..')

const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g
const FUNC = /\b(?:rgb|hsl)a?\(\s*\d[^)]*\)/g
const SCHEME = /colorScheme:\s*['"]dark['"]/g

function stripComments(source: string): string {
  return source
    .replace(/\/\*[^]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1')
}

/** Colour literals left in `source` after hx()/hxWhite() calls are removed, lowercased, with the multiset `allowed` consumed first. */
export function unconvertedColours(source: string, allowed: string[] = []): string[] {
  const code = stripComments(source)
    .replace(/&#\d+;/g, '')
    .replace(/&#x[0-9a-fA-F]+;/g, '')
    .replace(/\bhx(?:White)?\([^)]*\)/g, '')
  const found = [
    ...[...code.matchAll(HEX)].map(m => m[0]),
    ...[...code.matchAll(FUNC)].map(m => m[0]),
    ...[...code.matchAll(SCHEME)].map(() => "colorScheme: 'dark'"),
  ].map(v => v.toLowerCase())
  const budget = allowed.map(v => v.toLowerCase())
  return found.filter(v => {
    const i = budget.indexOf(v)
    if (i === -1) return true
    budget.splice(i, 1)
    return false
  })
}

function literalsIn(file: string): string[] {
  const s = fs.readFileSync(path.join(SRC, file), 'utf8')
  return unconvertedColours(s, DATA_COLOURS[file] ?? [])
}

describe('Clean light sweep', () => {
  it.each(CONVERTED_FILES.length ? CONVERTED_FILES : ['(none yet)'])('%s has no unconverted inline colour', file => {
    if (file === '(none yet)') return
    expect(literalsIn(file)).toEqual([])
  })
})

describe('Clean light sweep detection', () => {
  it('catches a hex inside a border shorthand', () => {
    expect(unconvertedColours(`style={{ border: '1px solid #333' }}`)).toEqual(['#333'])
  })

  it('catches a typed multi-line style constant', () => {
    const src = `const card: React.CSSProperties = {\n  background: '#1a1a1a',\n  color: 'x',\n}`
    expect(unconvertedColours(src)).toEqual(['#1a1a1a'])
  })

  it('catches both stops of a gradient', () => {
    expect(unconvertedColours(`background: 'linear-gradient(#111, #222)'`)).toEqual(['#111', '#222'])
  })

  it('catches rgba and hsl calls', () => {
    expect(unconvertedColours(`boxShadow: '0 0 0 rgba(0,0,0,0.4)'`)).toEqual(['rgba(0,0,0,0.4)'])
    expect(unconvertedColours(`color: 'hsl(0 0% 10%)'`)).toEqual(['hsl(0 0% 10%)'])
  })

  it("catches colorScheme: 'dark'", () => {
    expect(unconvertedColours(`style={{ colorScheme: 'dark' }}`)).toEqual(["colorscheme: 'dark'"])
  })

  it('ignores hx() and hxWhite() calls', () => {
    expect(unconvertedColours(`a: hx('f', '#2c2c2c', 0.5), b: hxWhite(0.06)`)).toEqual([])
  })

  it('ignores a hex inside a block comment', () => {
    expect(unconvertedColours(`/* old colour #abcdef */\nconst x = 1`)).toEqual([])
  })

  it('keeps a // inside a URL but drops a trailing line comment', () => {
    expect(unconvertedColours(`href: 'https://example.com/#abc'`)).toEqual(['#abc'])
    expect(unconvertedColours(`const a = 1 // was #123456`)).toEqual([])
  })

  it('ignores numeric HTML entities in JSX text', () => {
    expect(unconvertedColours(`<p>Don&#8217;t stop &#123; &#x27;quoted&#x27;</p>`)).toEqual([])
  })

  it('still catches a real colour next to an HTML entity', () => {
    expect(unconvertedColours(`<p>Don&#8217;t</p><i style={{ color: '#333' }} />`)).toEqual(['#333'])
  })

  it('treats the allow-list as a multiset: one allowed occurrence per listed value', () => {
    const src = `a: '#25d366', b: '#25d366'`
    expect(unconvertedColours(src, ['#25d366'])).toEqual(['#25d366'])
    expect(unconvertedColours(src, ['#25d366', '#25d366'])).toEqual([])
  })
})
