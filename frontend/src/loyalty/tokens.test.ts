import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * HexaTech Loyalty's hard rules, enforced on the source (as Content's and Appointments' own sweeps):
 *  1. Only Atelier `a-*` colour classes (and the `l-*` classes theme/loyalty.css defines). An admin class
 *     (`bg-dark-surface`, `text-white`) paints the workspace in the full admin's palette; a portal class reads
 *     variables that exist only under [data-portal].
 *  2. Only Loyalty's own API: every `/v1/…` path here is `/v1/admin/loyalty/…`, which the server gates.
 *     (`loyalty-presets` is the full admin's, not ours.)
 *  3. Nothing from another workspace: the workspaces share src/workspace, never each other.
 *  4. Every rule of the stylesheet is scoped under [data-loyalty].
 */
const DIR = path.resolve(__dirname)

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir).flatMap(entry => {
    const full = path.join(dir, entry)
    if (fs.statSync(full).isDirectory()) return sourceFiles(full)
    return /\.(tsx?|css)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : []
  })
}

const ADMIN_CLASS = /(?:^|[\s'"`{(])(?:hover:|focus:|focus-visible:|active:|disabled:|group-hover:|sm:|md:|lg:|xl:)*(?:bg|text|border|ring|divide|placeholder|from|to|via|outline|fill|stroke)-(?:dark-[a-z0-9]+|primary-\d{2,3}|t-primary|t-secondary|t-muted|white|black|accent|error|warning|info|gray-\d{2,3}|emerald-\d{2,3})(?:\/\d+)?(?=[\s'"`)}])/
const PORTAL_CLASS = /(?:^|[\s'"`{(])(?:[a-z-]+:)*(?:bg|text|border|ring|divide|placeholder|outline|rounded|shadow|font)-p-[a-z]/
const CONTENT_CLASS = /(?:^|[\s'"`{(])(?:[a-z-]+:)*c-(?:card|ai|mark|edge|st-|keydate)/
const FOREIGN_API = /\/v1\/(?!admin\/loyalty(?![-\w]))/
const FROM_A_WORKSPACE = /(?:\bfrom\s+|\bimport\s*\(\s*)['"](?:\.\.\/)+(?:appointments|content)\//

describe('loyalty workspace sweep', () => {
  const files = sourceFiles(DIR)

  it('actually scans the workspace (the folder is not empty)', () => {
    expect(files.length).toBeGreaterThan(15)
  })

  for (const file of files) {
    const rel = path.relative(DIR, file)
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    const hits = (re: RegExp) => lines.map((line, i) => (re.test(line) ? `${i + 1}: ${line.trim()}` : null)).filter((x): x is string => x !== null)

    it(`${rel} uses only a-* and l-* classes, calls only Loyalty's API and imports from no other workspace`, () => {
      expect(hits(ADMIN_CLASS), `admin colour classes in ${rel}`).toEqual([])
      expect(hits(PORTAL_CLASS), `portal classes in ${rel}`).toEqual([])
      expect(hits(CONTENT_CLASS), `Content's classes in ${rel}`).toEqual([])
      expect(hits(FOREIGN_API), `${rel} references an API outside /v1/admin/loyalty`).toEqual([])
      expect(hits(FROM_A_WORKSPACE), `${rel} imports from another workspace`).toEqual([])
    })
  }

  it('the API rule refuses the full admin\'s loyalty-presets', () => {
    expect(FOREIGN_API.test("api.get('/v1/admin/loyalty-presets')")).toBe(true)
    expect(FOREIGN_API.test("const BASE = '/v1/admin/loyalty'")).toBe(false)
    expect(FOREIGN_API.test("api.get('/v1/admin/loyalty/members')")).toBe(false)
  })

  it('sets no text smaller than 12 px', () => {
    const small = files.flatMap(file => [...fs.readFileSync(file, 'utf8').matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)]
      .filter(m => Number(m[1]) < 12).map(m => `${path.relative(DIR, file)}: ${m[0]}`))
    expect(small).toEqual([])
  })

  it('lifts nothing on a bare :hover: on a touch screen the state sticks after a tap', () => {
    const bare = files.flatMap(file => fs.readFileSync(file, 'utf8').split(/[\s"'`{}]+/)
      .filter(tok => /^(?:[a-z-]+:)*hover:-?translate-[xy]/.test(tok)).map(tok => `${path.relative(DIR, file)}: ${tok}`))
    expect(bare).toEqual([])
  })

  it('every rule in the stylesheet is scoped under [data-loyalty]', () => {
    const css = fs.readFileSync(path.join(DIR, 'theme/loyalty.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const selectors = [...css.matchAll(/(^|[{}])\s*([^{}@]+)\{/g)].map(m => m[2].trim()).filter(Boolean)
    expect(selectors.length).toBeGreaterThan(5)
    for (const selector of selectors) {
      for (const part of selector.split(',')) expect(part.trim().startsWith('[data-loyalty]'), `unscoped selector: ${part.trim()}`).toBe(true)
    }
  })
})
