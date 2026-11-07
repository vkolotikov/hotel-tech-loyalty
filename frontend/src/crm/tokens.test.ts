import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { AREAS } from './lib/api'

/**
 * HexaTech CRM's hard rules, enforced on the source (as Content's and Loyalty's sweeps):
 *  1. Only Atelier `a-*` colour classes (and the `crm-*` classes theme/crm.css defines). An admin class paints the
 *     workspace in the full admin's palette; a portal class reads variables that exist only under [data-portal].
 *  2. Only the API areas lib/api.ts lists: every `/v1/…` path here is `/v1/admin/<area>`, and every call goes through
 *     crmUrl, which names `brand_id=all`.
 *  3. Nothing from the other workspaces: they share src/workspace, never each other.
 *  4. Every rule of the stylesheet is scoped under [data-crm].
 */
const DIR = path.resolve(__dirname)

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir).flatMap(entry => {
    const full = path.join(dir, entry)
    if (fs.statSync(full).isDirectory()) return sourceFiles(full)
    return /\.(tsx?|css)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : []
  })
}

const ADMIN_CLASS = /(?:^|[\s'"`{(])(?:hover:|focus:|focus-visible:|active:|disabled:|group-hover:|sm:|md:|lg:|xl:)*(?:bg|text|border|ring|divide|placeholder|from|to|via|outline|fill|stroke)-(?:dark-[a-z0-9]+|primary-\d{2,3}|t-primary|t-secondary|t-muted|white|black|accent|error|warning|info|gray-\d{2,3}|emerald-\d{2,3}|slate-\d{2,3}|blue-\d{2,3}|red-\d{2,3}|green-\d{2,3})(?:\/\d+)?(?=[\s'"`)}])/
const PORTAL_CLASS = /(?:^|[\s'"`{(])(?:[a-z-]+:)*(?:bg|text|border|ring|divide|placeholder|outline|rounded|shadow|font)-p-[a-z]/
const FOREIGN_WORKSPACE = /from\s+['"](?:\.\.\/)+(?:appointments|content|loyalty|portal)\//
const RAW_API = /['"`]\/v1\//
const API_CALL = /\b(?:get|send)(?:<[^>]*>)?\(\s*(?:'(?:post|put|patch|delete)'\s*,\s*)?[`'"]([a-z-]+)/g

describe('crm workspace sweep', () => {
  const files = sourceFiles(DIR)

  it('actually scans the workspace (the folder is not empty)', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  for (const file of files) {
    const rel = path.relative(DIR, file)
    const source = fs.readFileSync(file, 'utf8')
    const lines = source.split('\n')
    const hits = (re: RegExp) => lines.map((line, i) => (re.test(line) ? `${i + 1}: ${line.trim()}` : null)).filter((x): x is string => x !== null)

    it(`${rel} uses only a-* colours, calls only its areas and imports no other workspace`, () => {
      expect(hits(ADMIN_CLASS), `admin colour classes in ${rel}`).toEqual([])
      expect(hits(PORTAL_CLASS), `portal classes in ${rel}`).toEqual([])
      expect(hits(FOREIGN_WORKSPACE), `${rel} imports another workspace`).toEqual([])
      if (rel !== path.join('lib', 'api.ts')) expect(hits(RAW_API), `${rel} writes an API path; go through lib/api.ts`).toEqual([])
      const areas = [...source.matchAll(API_CALL)].map(m => m[1]).filter(area => !(AREAS as readonly string[]).includes(area))
      expect(areas, `${rel} calls an area HexaTech CRM does not list`).toEqual([])
    })
  }

  it('scopes every rule of its stylesheet under [data-crm]', () => {
    const css = fs.readFileSync(path.join(DIR, 'theme/crm.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
    const selectors = [...css.matchAll(/([^{}]+)\{/g)].map(m => m[1].trim()).filter(Boolean)
    expect(selectors.length).toBeGreaterThan(4)
    for (const selector of selectors) {
      for (const part of selector.split(',')) expect(part.trim(), selector).toMatch(/^\[data-crm\]/)
    }
  })

  it('sets no text smaller than 12 px', () => {
    const small = files.flatMap(file => [...fs.readFileSync(file, 'utf8').matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)]
      .filter(m => Number(m[1]) < 12).map(m => `${path.relative(DIR, file)}: ${m[0]}`))
    expect(small).toEqual([])
  })
})
