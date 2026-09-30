import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * The workspace's three hard rules, enforced on the source:
 *
 *  1. Only `a-*` colour tokens. An admin class (`bg-dark-surface`,
 *     `text-white`, `text-primary-400`) paints this light workspace in the
 *     full admin's dark palette; a portal class (`bg-p-surface`) reads
 *     variables that only exist under [data-portal].
 *  2. Only the workspace's own API. Every `/v1/…` path in this folder is
 *     `/v1/admin/appointments/…`, which the server gates with the
 *     organisation's flag. A call to any other admin endpoint would work
 *     for an appointments-only customer today and must not be built on.
 *  3. Every rule in the stylesheet is scoped under [data-appointments], so
 *     nothing here can restyle the full admin.
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
const FOREIGN_API = /\/v1\/(?!admin\/appointments\b)/

describe('appointments workspace sweep', () => {
  const files = sourceFiles(DIR)

  it('actually scans the workspace (the folder is not empty)', () => {
    expect(files.length).toBeGreaterThan(10)
  })

  for (const file of files) {
    const rel = path.relative(DIR, file)
    const lines = fs.readFileSync(file, 'utf8').split('\n')
    const hits = (re: RegExp) => lines.map((line, i) => (re.test(line) ? `${i + 1}: ${line.trim()}` : null)).filter((x): x is string => x !== null)

    it(`${rel} uses only a-* colour classes`, () => {
      expect(hits(ADMIN_CLASS), `admin colour classes in ${rel}`).toEqual([])
      expect(hits(PORTAL_CLASS), `portal classes in ${rel}`).toEqual([])
    })

    it(`${rel} calls only the workspace API`, () => {
      expect(hits(FOREIGN_API), `${rel} references an API outside /v1/admin/appointments`).toEqual([])
    })
  }

  it('sets no text smaller than 12 px', () => {
    const small = files.flatMap(file => {
      const rel = path.relative(DIR, file)
      return [...fs.readFileSync(file, 'utf8').matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)].filter(m => Number(m[1]) < 12).map(m => `${rel}: ${m[0]}`)
    })
    expect(small).toEqual([])
  })

  it('every rule in the stylesheet is scoped under [data-appointments]', () => {
    const css = fs.readFileSync(path.join(DIR, 'theme/appointments.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const selectors = [...css.matchAll(/(^|\})\s*([^{}@]+)\{/g)].map(m => m[2].trim()).filter(Boolean)
    expect(selectors.length).toBeGreaterThan(3)
    for (const selector of selectors) {
      for (const part of selector.split(',')) {
        expect(part.trim().startsWith('[data-appointments]'), `unscoped selector: ${part.trim()}`).toBe(true)
      }
    }
  })
})
