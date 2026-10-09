import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { lightFillFor } from './light'

/**
 * Inside Clean light, Tailwind's white is the ink. White that must stay
 * white uses on-fill: text on a solid coloured fill, and white surfaces
 * such as toggle knobs and QR mats.
 */
const SRC = path.resolve(__dirname, '..')
function adminFiles(dir: string): string[] {
  return fs.readdirSync(dir).flatMap(entry => {
    const full = path.join(dir, entry)
    const rel = path.relative(SRC, full).split(path.sep).join('/')
    if (fs.statSync(full).isDirectory()) return rel === 'portal' || rel === 'appointments' ? [] : adminFiles(full)
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : []
  })
}
function classChunks(source: string): string[] {
  const chunks: string[] = []
  for (const [literal] of source.matchAll(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g)) {
    if (literal[0] !== '`') { chunks.push(literal); continue }
    const parts = literal.split(/(\$\{[^}]*\})/)
    chunks.push(parts.filter((_, i) => i % 2 === 0).join(' '))
    for (const e of parts.filter((_, i) => i % 2 === 1)) chunks.push(...classChunks(e.slice(2, -1)))
  }
  return chunks
}
const rel = (f: string) => path.relative(SRC, f).split(path.sep).join('/')
const files = adminFiles(SRC)

const HUES = 'red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone'
const SOLID = new RegExp(
  `(?<![\\w:/-])(?:bg|from)-(?:(?:${HUES})-(?:500|600|700|800|900)|accent|success|danger|notice|error|warning|info)(?:\\/(?:[4-9]\\d|100))?(?![\\w/-])|(?<![\\w:/-])(?:bg|from)-black(?:\\/(?:[6-9]\\d|100))?(?![\\w/-])`,
)
/** A translucent black well (not a scrim): grey on paper in Clean light, where coloured text falls under 4.5:1. */
const BLACK_WELL = /(?<![\w:/-])bg-black\/[1-5]\d(?![\w/-])/
const COLOURED_TEXT = new RegExp(`(?<![\\w:/[-])text-(?:${HUES})-\\d{3}(?![\\w-])`)
const SCRIM = /(?<![\w:/-])(?:fixed|absolute) inset-0(?![\w-])|(?<![\w:/-])inset-0 (?:fixed|absolute)(?![\w-])/
const TEXT_WHITE_ANYWHERE = /(?<![\w:/[-])text-white(?![\w/-])/

/**
 * Elements that darken an image in place (an `absolute inset-0` layer of
 * translucent black, such as a photo's hover overlay), with everything they
 * hold up to their closing tag. Their icons stay white over the darkened
 * image in every style, so they take text-on-fill. Modal scrims are `fixed`
 * and hold a panel with its own surface: not matched.
 */
function blackOverlays(source: string): string[] {
  /** The index of the `>` that ends the opening tag at `start` (brace-aware), and whether it is `/>`. */
  const tagEnd = (start: number): { end: number; selfClosing: boolean } => {
    let depth = 0
    for (let i = start; i < source.length; i++) {
      const ch = source[i]
      if (ch === '{') depth++
      else if (ch === '}') depth--
      else if (ch === '>' && depth === 0) return { end: i, selfClosing: source[i - 1] === '/' }
    }
    return { end: source.length, selfClosing: true }
  }
  const out: string[] = []
  for (const m of source.matchAll(/<(\w+)\s+className="([^"]*)"/g)) {
    const [, tag, cls] = m
    if (!/(?<![\w:/-])absolute(?![\w-])/.test(cls) || !/(?<![\w:/-])inset-0(?![\w-])/.test(cls) || !/(?<![\w:/-])bg-black\/\d+(?![\w/-])/.test(cls)) continue
    const open = tagEnd(m.index!)
    if (open.selfClosing) { out.push(source.slice(m.index, open.end + 1)); continue }
    let depth = 1
    let end = source.length
    const nested = new RegExp(`<${tag}(?![\\w])|</${tag}>`, 'g')
    nested.lastIndex = open.end + 1
    for (let t = nested.exec(source); t; t = nested.exec(source)) {
      if (t[0].startsWith('</')) depth--
      else if (!tagEnd(t.index).selfClosing) depth++
      if (depth === 0) { end = t.index + t[0].length; break }
    }
    out.push(source.slice(m.index, end))
  }
  return out
}
const HX_FILL_CLASS = /(?<![\w:/-])(?:bg|from)-hx-([0-9a-f]{6})(?:\/(?:[4-9]\d|100))?(?![\w/-])/
const TEXT_WHITE = /(?<![\w:/[-])text-white(?![\w/-])/
const SOLID_BG_WHITE = /(?<![\w:/[-])bg-white(?![\w/-])/

/** White that means "the foreground colour" (bars, dots, dividers drawn in the text colour): it may follow the ink. */
const FOREGROUND_WHITE: { file: string; snippet: string }[] = []

/** Elements whose inline background is a translucent tint: there text-white should follow the ink (paper under the tint in light). */
const INLINE_TINT_WHITE: { file: string; snippet: string }[] = [
  { file: 'components/ContentPlanner/CalendarView.tsx', snippet: 'text-left text-[11px] text-white hover:brightness-125' },
  { file: 'components/ContentPlanner/CalendarView.tsx', snippet: 'rounded px-2 py-0.5 text-[11px] font-medium text-white' },
  { file: 'components/ContentPlanner/PostsView.tsx', snippet: 'rounded px-2 py-1 text-xs font-medium text-white' },
  { file: 'pages/Analytics.tsx', snippet: 'min-w-[44px] px-2 py-1 rounded text-xs font-semibold text-white' },
  { file: 'pages/Settings.tsx', snippet: "btnPrimary + ' text-white border border-emerald-500/30" },
]

/**
 * Every JSX opening tag whose style={{…}} sets background or backgroundColor.
 * Brace-aware: arrow functions in other props (onClick={() => …}) contain
 * '>' and would cut a plain regex short.
 */
function tagsWithInlineBackground(s: string): string[] {
  const tags: string[] = []
  for (const m of s.matchAll(/style=\{\{/g)) {
    const start = s.lastIndexOf('<', m.index)
    let depth = 0
    let i = start
    for (; i < s.length; i++) {
      const ch = s[i]
      if (ch === '{') depth++
      else if (ch === '}') depth--
      else if (ch === '>' && depth === 0) break
    }
    const tag = s.slice(start, i + 1)
    if (/style=\{\{[^]*?\bbackground(?:Color)?\s*:/.test(tag)) tags.push(tag)
  }
  return tags
}

const colouredHxFill = (chunk: string) => {
  const m = chunk.match(HX_FILL_CLASS)
  return !!m && lightFillFor(m[1]).toLowerCase() === `#${m[1]}`
}

describe('whites that stay white', () => {
  it('uses text-on-fill, not text-white, on every solid coloured fill', () => {
    const offenders = files.flatMap(f =>
      classChunks(fs.readFileSync(f, 'utf8'))
        .filter(c => (SOLID.test(c) || colouredHxFill(c)) && TEXT_WHITE.test(c))
        .map(c => `${rel(f)}: ${c.slice(0, 120)}`),
    )
    expect(offenders).toEqual([])
  })

  it('uses text-on-fill on elements painted with an inline background', () => {
    const offenders = files.flatMap(f =>
      tagsWithInlineBackground(fs.readFileSync(f, 'utf8'))
        .filter(tag => TEXT_WHITE.test(tag))
        .filter(tag => !INLINE_TINT_WHITE.some(a => rel(f) === a.file && tag.includes(a.snippet)))
        .map(tag => `${rel(f)}: ${tag.slice(0, 140)}`),
    )
    expect(offenders).toEqual([])
  })

  it('puts coloured text in wells of bg-hx-000000 (paper in Clean light), not a translucent bg-black', () => {
    const offenders = files.flatMap(f =>
      classChunks(fs.readFileSync(f, 'utf8'))
        .filter(c => BLACK_WELL.test(c) && COLOURED_TEXT.test(c) && !SCRIM.test(c))
        .map(c => `${rel(f)}: ${c.slice(0, 120)}`),
    )
    expect(offenders).toEqual([])
  })

  it('uses text-on-fill inside overlays that darken an image (absolute inset-0 bg-black/…)', () => {
    const offenders = files.flatMap(f =>
      blackOverlays(fs.readFileSync(f, 'utf8'))
        .filter(el => TEXT_WHITE_ANYWHERE.test(el))
        .map(el => `${rel(f)}: ${el.replace(/\s+/g, ' ').slice(0, 140)}`),
    )
    expect(offenders).toEqual([])
  })

  it('finds an image overlay and what it holds', () => {
    const src = `<div className="relative group"><img src={x} />
      <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100">
        <div className="p-1"><Camera size={20} className="text-white" /></div>
      </div></div>`
    expect(blackOverlays(src)).toHaveLength(1)
    expect(TEXT_WHITE_ANYWHERE.test(blackOverlays(src)[0])).toBe(true)
    expect(TEXT_WHITE_ANYWHERE.test(blackOverlays(src.replace('text-white', 'text-on-fill'))[0])).toBe(false)
    // A modal scrim (fixed) is not an image overlay: the panel inside paints its own surface.
    expect(blackOverlays(`<div className="fixed inset-0 bg-black/60"><div className="bg-dark-surface text-white" /></div>`)).toEqual([])
  })

  it('detects solid black fills and gradient stops, and coloured text in black wells', () => {
    expect(SOLID.test("'from-black to-transparent'")).toBe(true)
    expect(SOLID.test("'from-black/80'")).toBe(true)
    expect(SOLID.test("'bg-black/70'")).toBe(true)
    expect(SOLID.test("'bg-black/40'")).toBe(false)
    const well = "'rounded bg-black/40 text-emerald-300 font-mono'"
    expect(BLACK_WELL.test(well) && COLOURED_TEXT.test(well) && !SCRIM.test(well)).toBe(true)
    expect(BLACK_WELL.test("'rounded bg-hx-000000/40 text-emerald-300'")).toBe(false)
    expect(SCRIM.test("'fixed inset-0 bg-black/50 text-emerald-300'")).toBe(true)
  })

  it('has no solid bg-white except foreground whites on the allowlist', () => {
    const offenders = files.flatMap(f =>
      classChunks(fs.readFileSync(f, 'utf8'))
        .filter(c => SOLID_BG_WHITE.test(c))
        .filter(c => !FOREGROUND_WHITE.some(a => rel(f) === a.file && c.includes(a.snippet)))
        .map(c => `${rel(f)}: ${c.slice(0, 120)}`),
    )
    expect(offenders).toEqual([])
  })
})
