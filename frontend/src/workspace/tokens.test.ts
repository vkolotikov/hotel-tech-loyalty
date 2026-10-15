import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * The shared workspace core (spec 2026-10-14 §6.1) is drawn inside every
 * workspace, so its source keeps the strictest rules of them all:
 *
 *  1. Only `a-*` colour classes (appointments/tokens.test.ts says why).
 *  2. No API: the core draws and remembers; each workspace calls its own
 *     server through its own client.
 *  3. Nothing from a workspace: the core never imports from appointments/ or
 *     content/. A workspace builds on the core, never the other way round.
 *  4. Every rule in workspace.css is scoped under [data-workspace], so
 *     nothing here can restyle the full admin.
 *  5. No text under 12 px, and no hover lift on a device without hover.
 */
const DIR = path.resolve(__dirname)

/** What the shared core holds. Each task of release 1 adds its files here first. */
const CORE = [
  'theme/workspace.css',
  'theme/accent.ts',
  'lib/wallClock.ts',
  'lib/useMedia.ts',
  'lib/handBack.ts',
  'lib/firstLetter.ts',
  'lib/look.ts',
  'lib/shellMark.ts',
  'lib/shortcuts.ts',
  'ui/Button.tsx',
  'ui/Field.tsx',
  'ui/Notice.tsx',
  'ui/Skeleton.tsx',
  'ui/Typography.tsx',
  'ui/fitFigure.ts',
  'ui/ThemeSwitch.tsx',
  'i18n/index.ts',
  'ui/ShortcutsSheet.tsx',
  'find/findCore.ts',
  'find/FindFrame.tsx',
  'WorkspaceShell.tsx',
]

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir).flatMap(entry => {
    const full = path.join(dir, entry)
    if (fs.statSync(full).isDirectory()) return sourceFiles(full)
    return /\.(tsx?|css)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : []
  })
}

const ADMIN_CLASS = /(?:^|[\s'"`{(])(?:hover:|focus:|focus-visible:|active:|disabled:|group-hover:|sm:|md:|lg:|xl:)*(?:bg|text|border|ring|divide|placeholder|from|to|via|outline|fill|stroke)-(?:dark-[a-z0-9]+|primary-\d{2,3}|t-primary|t-secondary|t-muted|white|black|accent|error|warning|info|gray-\d{2,3}|emerald-\d{2,3})(?:\/\d+)?(?=[\s'"`)}])/
const PORTAL_CLASS = /(?:^|[\s'"`{(])(?:[a-z-]+:)*(?:bg|text|border|ring|divide|placeholder|outline|rounded|shadow|font)-p-[a-z]/
const ANY_API = /\/v1\//
const FROM_A_WORKSPACE = /(?:\bfrom\s+|\bimport\s*\(\s*)['"](?:\.\.\/)+(?:appointments|content)\//

/** Every rule's selector list: after the start, a `}` — or a `{` (the first rule inside @media/@container). */
const SELECTORS = /(^|[{}])\s*([^{}@]+)\{/g

describe('shared workspace core sweep', () => {
  const files = sourceFiles(DIR)
  const rels = files.map(f => path.relative(DIR, f).split(path.sep).join('/'))

  it('holds the shared core', () => {
    expect(rels).toEqual(expect.arrayContaining(CORE))
  })

  for (const file of files) {
    const rel = path.relative(DIR, file).split(path.sep).join('/')
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    const hits = (re: RegExp) => lines.map((line, i) => (re.test(line) ? `${i + 1}: ${line.trim()}` : null)).filter((x): x is string => x !== null)

    it(`${rel} uses only a-* colour classes`, () => {
      expect(hits(ADMIN_CLASS), `admin colour classes in ${rel}`).toEqual([])
      expect(hits(PORTAL_CLASS), `portal classes in ${rel}`).toEqual([])
    })

    it(`${rel} calls no API and imports nothing from a workspace`, () => {
      expect(hits(ANY_API), `${rel} references an API`).toEqual([])
      expect(hits(FROM_A_WORKSPACE), `${rel} imports from a workspace folder`).toEqual([])
    })
  }

  it('sets no text smaller than 12 px', () => {
    const small = files.flatMap(file => {
      const rel = path.relative(DIR, file)
      return [...fs.readFileSync(file, 'utf8').matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].filter(m => Number(m[1]) < 12).map(m => `${rel}: ${m[0]}`)
    })
    expect(small).toEqual([])
  })

  it('lifts nothing on a bare :hover: on a touch screen the state sticks after a tap', () => {
    const bare = files.flatMap(file => {
      const rel = path.relative(DIR, file)
      return fs.readFileSync(file, 'utf8').split(/[\s"'`{}]+/).filter(tok => /^(?:[a-z-]+:)*hover:-?translate-[xy]/.test(tok)).map(tok => `${rel}: ${tok}`)
    })
    expect(bare).toEqual([])
  })

  it('finds the first rule inside an @media or @container block too', () => {
    const css = '@media (max-width: 600px) { .first { color: red } .second { color: blue } }'
    expect([...css.matchAll(SELECTORS)].map(m => m[2].trim())).toEqual(['.first', '.second'])
  })

  it('every rule in the stylesheet is scoped under [data-workspace]', () => {
    const css = fs.readFileSync(path.join(DIR, 'theme/workspace.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const selectors = [...css.matchAll(SELECTORS)].map(m => m[2].trim()).filter(Boolean)
    expect(selectors.length).toBeGreaterThan(3)
    for (const selector of selectors) {
      for (const part of selector.split(',')) {
        expect(part.trim().startsWith('[data-workspace]'), `unscoped selector: ${part.trim()}`).toBe(true)
      }
    }
  })
})
