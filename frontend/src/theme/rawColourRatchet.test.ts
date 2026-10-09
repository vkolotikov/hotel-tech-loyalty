import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A ratchet on hard-coded colours in the admin (portal/ and appointments/
 * have their own token sets and sweep tests). Hard-coded colours ignore the
 * admin style: on Glass they show as solid blocks or unreadable text. The
 * counts may only go down. When you remove some, lower the baseline in the
 * same commit; never raise it.
 */
const BASELINE = {
  rawHexClasses: 0,
  legacySurfaceColours: 0,
}

const SRC = path.resolve(__dirname, '..')
const RAW_HEX_CLASS = /\b[a-z][a-z-]*-\[#[0-9a-fA-F]{3,8}\]/g
// The old dark-green theme's inline colours: rgba(R, G, B, a) with R 10-39,
// G 10-59, B 10-49 and a fractional alpha.
const LEGACY_SURFACE = /rgba?\(\s*(?:1\d|2\d|3\d),\s*(?:1\d|2\d|3\d|4\d|5\d),\s*(?:1\d|2\d|3\d|4\d)\s*,\s*0?\.\d+\)/g

function adminSourceFiles(dir: string): string[] {
  return fs.readdirSync(dir).flatMap(entry => {
    const full = path.join(dir, entry)
    const rel = path.relative(SRC, full).split(path.sep).join('/')
    if (fs.statSync(full).isDirectory()) return rel === 'portal' || rel === 'appointments' ? [] : adminSourceFiles(full)
    return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : []
  })
}

function count(pattern: RegExp): { total: number; byFile: string[] } {
  let total = 0
  const byFile: string[] = []
  for (const file of adminSourceFiles(SRC)) {
    const n = (fs.readFileSync(file, 'utf8').match(pattern) ?? []).length
    if (n > 0) byFile.push(`${n} ${path.relative(SRC, file)}`)
    total += n
  }
  return { total, byFile }
}

describe('hard-coded colours in the admin', () => {
  it('scans the admin source', () => {
    expect(adminSourceFiles(SRC).length).toBeGreaterThan(150)
  })

  it(`has no more than ${BASELINE.rawHexClasses} raw hex colour classes ([#…])`, () => {
    const { total, byFile } = count(RAW_HEX_CLASS)
    expect(total, `use a token instead of a raw hex class. Per file:\n${byFile.join('\n')}`).toBeLessThanOrEqual(BASELINE.rawHexClasses)
  })

  it('uses no more old dark-green inline colours (use var(--legacy-…) or a token)', () => {
    const { total, byFile } = count(LEGACY_SURFACE)
    expect(total, byFile.join('\n')).toBeLessThanOrEqual(BASELINE.legacySurfaceColours)
  })
})
