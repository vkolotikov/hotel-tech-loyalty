import { describe, expect, it } from 'vitest'
import { brandToken, showWizard } from './wizardGate'

describe('brandToken', () => {
  it('gives a real brand id its own token', () => {
    expect(brandToken(3)).toBe(3)
  })

  it('gives the org-wide (null) selection a distinct token', () => {
    expect(brandToken(null)).toBe('org')
  })
})

describe('showWizard', () => {
  it('never shows the wizard once the server reports the page completed, latch or not', () => {
    expect(showWizard(true, undefined, 1)).toBe(false)
    expect(showWizard(true, 1, 1)).toBe(false)
  })

  it('shows the wizard for a fresh brand with no page and no latch ever set', () => {
    expect(showWizard(false, undefined, 1)).toBe(true)
  })

  it('suppresses the wizard for the SAME brand that just finished it', () => {
    expect(showWizard(false, 1, 1)).toBe(false)
  })

  /**
   * The bug this whole fix round exists for, reproduced directly: brand A
   * finishes the wizard, the tenant switches to page-less brand B, and B
   * must still show the wizard rather than silently inheriting A's latch.
   */
  it('does NOT suppress the wizard for a different brand than the one that finished', () => {
    expect(showWizard(false, 1, 2)).toBe(true)
  })

  it('suppresses the wizard for the org-wide selection once IT has finished', () => {
    expect(showWizard(false, 'org', null)).toBe(false)
  })

  /**
   * The sentinel-collision class of bug: `doneForBrand`'s "nothing has
   * finished" state (`undefined`) must never be reachable by finishing the
   * org-wide selection (which records `'org'`, not `null`/`undefined`), and
   * a real numeric brand id — including the unusual-but-legal `0` — must
   * never collide with the org-wide token either.
   */
  it('does not let "never finished" and "finished for org-wide" collide', () => {
    expect(showWizard(false, undefined, null)).toBe(true)
    expect(showWizard(false, 'org', null)).toBe(false)
  })

  it('does not let brand id 0 collide with the org-wide token', () => {
    expect(showWizard(false, 0, null)).toBe(true)
    expect(showWizard(false, 'org', 0)).toBe(true)
  })
})
