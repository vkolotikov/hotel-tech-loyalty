import fs from 'node:fs'
import { describe, expect, it } from 'vitest'

// Plan B deferred: a mid-session fallback to another brand kept the panel (and its post) open under the new brand.
describe('the panel belongs to one brand', () => {
  it('closes when the brand changes, whoever changed it, and forgets its unsaved edits', () => {
    const source = fs.readFileSync(new URL('./PanelProvider.tsx', import.meta.url), 'utf8')
    expect(source).toContain('useBrandId()')
    expect(source).toMatch(/if \(brand !== brandShown\) \{\s*setBrandShown\(brand\)\s*if \(brandShown !== null\) setTarget\(null\)/)
    expect(source).toMatch(/if \(brandBefore\.current !== null && brandBefore\.current !== brand\) dirty\.current = false/)
  })
})
