import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The full admin's Branding "mood" typography ([data-mood] on <html>) must never reach a workspace (spec §6.1):
 * each workspace marks <html data-shell="<name>"> (src/workspace/lib/shellMark.ts), and every mood rule excludes
 * every workspace's mark.
 */
const WORKSPACES = ['appointments', 'content', 'loyalty']

describe('mood typography', () => {
  const rules = readFileSync(new URL('../../index.css', import.meta.url), 'utf8').split('\n').filter(line => line.includes('[data-mood="') && line.trim().startsWith(':root'))

  it('has its rules where this test looks (the scan is not empty)', () => {
    expect(rules.length).toBeGreaterThanOrEqual(8)
  })

  for (const name of WORKSPACES) {
    it(`stays out of the ${name} workspace`, () => {
      expect(rules.filter(rule => !rule.includes(`[data-shell="${name}"]`))).toEqual([])
    })
  }
})
