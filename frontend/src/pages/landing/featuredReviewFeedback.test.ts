import { describe, expect, it } from 'vitest'
import { featuredReviewToast } from './featuredReviewFeedback'

/**
 * Round 2 (M3). The Reviews screen used to toast an unconditional green
 * "Added to your landing page" for an action that, for a brand-new tenant,
 * provably did nothing: the public renderer needs the `reviews` section row
 * `enabled` AND the section to have content, and featuring supplies only
 * the second. Reproduced end to end — `PageContent reviews count = 1`, band
 * absent.
 *
 * The backend now switches the row on as part of the write and says what
 * happened. These tests pin the one rule that matters: a green success is
 * only ever for the case where the review really did reach the page.
 */
describe('featuredReviewToast', () => {
  it('does not claim success when the band is still switched off', () => {
    // The defect, in one line. Before the fix this said "added".
    expect(featuredReviewToast({ featured: true, hasPage: true, reviewsEnabled: false }))
      .toBe('section_off')
  })

  it('does not claim a landing page the tenant does not have', () => {
    expect(featuredReviewToast({ featured: true, hasPage: false, reviewsEnabled: false }))
      .toBe('no_page')
  })

  it('claims success only when the review really is on the page', () => {
    expect(featuredReviewToast({ featured: true, hasPage: true, reviewsEnabled: true }))
      .toBe('added')
  })

  it('reports removal whatever state the page is in — the review is off it either way', () => {
    for (const hasPage of [true, false]) {
      for (const reviewsEnabled of [true, false]) {
        expect(featuredReviewToast({ featured: false, hasPage, reviewsEnabled })).toBe('removed')
      }
    }
  })

  /**
   * The invariant stated once, over the whole input space, so a later
   * "simplification" back to an unconditional success cannot pass.
   */
  it('never answers "added" unless the band is on', () => {
    for (const featured of [true, false]) {
      for (const hasPage of [true, false]) {
        for (const reviewsEnabled of [true, false]) {
          const answer = featuredReviewToast({ featured, hasPage, reviewsEnabled })
          if (answer === 'added') {
            expect(featured && reviewsEnabled).toBe(true)
          }
        }
      }
    }
  })
})
