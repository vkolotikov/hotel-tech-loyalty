import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * The portal's two hard rules, enforced on the source rather than remembered:
 *
 *  1. Only `p-*` colour tokens. An admin class (`bg-dark-surface`,
 *     `text-white`, `text-primary-400`) inside the portal paints a member's
 *     screen in the staff console's dark palette the moment the admin theme
 *     changes, and reads as a second design language the moment it doesn't.
 *  2. No admin endpoint. `/v1/admin/*` answers 403 to a member and, for a
 *     lapsed tenant, fires the subscription wall on a screen that has no
 *     subscription to sell.
 */
const PORTAL_DIR = path.resolve(__dirname)

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir).flatMap(entry => {
    const full = path.join(dir, entry)
    if (fs.statSync(full).isDirectory()) return sourceFiles(full)
    return /\.(tsx?|css)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : []
  })
}

const FORBIDDEN_CLASS = /(?:^|[\s'"`{(])(?:hover:|focus:|focus-visible:|active:|disabled:|sm:|md:|lg:)*(?:bg|text|border|ring|divide|placeholder|from|to|via|outline|fill|stroke)-(?:dark-[a-z0-9]+|primary-\d{2,3}|t-primary|t-secondary|t-muted|white|black|accent|error|warning|info)(?:\/\d+)?(?=[\s'"`)}])/

describe('portal token sweep', () => {
  const files = sourceFiles(PORTAL_DIR)

  it('actually scans the portal (the folder is not empty)', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  for (const file of files) {
    const rel = path.relative(PORTAL_DIR, file)
    const source = fs.readFileSync(file, 'utf8')

    it(`${rel} uses only p-* colour classes`, () => {
      const lines = source.split('\n')
      const hits = lines
        .map((line, i) => (FORBIDDEN_CLASS.test(line) ? `${i + 1}: ${line.trim()}` : null))
        .filter((x): x is string => x !== null)
      expect(hits, `admin colour classes in ${rel}:\n${hits.join('\n')}`).toEqual([])
    })

    it(`${rel} never calls an admin endpoint`, () => {
      expect(source.includes('/v1/admin/'), `${rel} references /v1/admin/`).toBe(false)
    })
  }
})
