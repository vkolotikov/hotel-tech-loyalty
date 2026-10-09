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
  `(?<![\\w:/-])(?:bg|from)-(?:(?:${HUES})-(?:500|600|700|800|900)|accent|success|danger|notice|error|warning|info)(?:\\/(?:[4-9]\\d|100))?(?![\\w/-])|(?<![\\w:/-])bg-black(?:\\/(?:[6-9]\\d|100))?(?![\\w/-])`,
)
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
