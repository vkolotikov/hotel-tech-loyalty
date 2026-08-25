/**
 * What the Reviews screen is allowed to say after a "Feature" click.
 *
 * Featuring a review used to toast an unconditional green "Added to your
 * landing page", and for a brand-new tenant that was provably false. The
 * public renderer needs the `reviews` section row `enabled` AND the section
 * to have content; featuring satisfies only the second. The wizard writes
 * that row `enabled: false` for any data-backed section with zero rows
 * (`sections.ts`'s `isOfferable`), and this very endpoint is the first
 * writer of `is_featured` anywhere in the app — so at wizard time there is
 * never anything featured yet and the row is ALWAYS created off. Reproduced
 * end to end: `PageContent reviews count = 1`, reviews band absent.
 *
 * `ReviewController::setSubmissionFeatured` now switches that row on as part
 * of the write, and returns `landing: { has_page, reviews_enabled }` saying
 * what actually happened. This function turns that answer into which of four
 * things the screen may claim — kept pure and out of the component because
 * `vitest.config.ts` is `environment: 'node'`, so a decision that lives
 * inside JSX cannot be tested at all.
 *
 * The rule the whole file exists to enforce: a green success toast is only
 * for the case where the review really is now on the page.
 *
 *  - 'removed'     unfeatured. Honest whatever the page's state: the review
 *                  is off it either way.
 *  - 'added'       featured AND the band is on. The only green success.
 *  - 'section_off' featured, the tenant has a page, but its reviews band is
 *                  still off — the one state the backend could not fix,
 *                  which today means an org whose plan no longer buys the
 *                  builder. Point at the editor toggle rather than claim
 *                  success.
 *  - 'no_page'     featured, and there is no landing page to appear on.
 *                  Saying "added to your landing page" to a tenant who has
 *                  no landing page is the same lie in a different shape.
 */
export type FeaturedReviewToast = 'removed' | 'added' | 'section_off' | 'no_page'

export function featuredReviewToast(args: {
  featured: boolean
  /** `landing.has_page` — the org has at least one landing page. */
  hasPage: boolean
  /** `landing.reviews_enabled` — at least one of those pages has its reviews band switched on. */
  reviewsEnabled: boolean
}): FeaturedReviewToast {
  if (!args.featured) return 'removed'
  if (args.reviewsEnabled) return 'added'
  return args.hasPage ? 'section_off' : 'no_page'
}
