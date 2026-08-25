/**
 * Pure decision logic for `LandingPages.tsx`'s wizard-vs-editor gate, split
 * into its own module for the same reason as `landingDraft.ts`/`sections.ts`
 * next to it: this repo's vitest config is pure-function-only (no jsdom, no
 * React Testing Library — see `vitest.config.ts`'s own docblock), and a
 * `.tsx` file that exports both a component and plain functions breaks Vite
 * Fast Refresh (`react-refresh/only-export-components`).
 *
 * Fix round 1 on Task 7: the host's `wizardDone` latch was a flat boolean,
 * so finishing the wizard for one brand permanently forced the editor for
 * every OTHER brand too — `App.tsx:314` mounts `<LandingPages />` with no
 * key, and `BrandSwitcher.switchTo()` only calls `setCurrentBrand(id)` +
 * `invalidateQueries()` (no navigation, no unmount), so nothing ever reset
 * it. Reproduced: brand A finishes the wizard -> switch to page-less brand
 * B -> B gets the editor instead of the wizard, with no way back except a
 * hard reload. `showWizard()` below scopes the latch to the brand that
 * actually finished, so switching to any other brand re-decides purely off
 * `completed`, as if the latch had never been set.
 */

/**
 * `currentBrandId` (nullable) collapsed to a stable, comparable token.
 * `null` ("All brands") gets the string `'org'` rather than reusing `null`
 * itself — `doneForBrand`'s own "nothing has finished yet" state is
 * `undefined`, not `null`, precisely so a finish while on the org-wide
 * selection cannot collide with "never finished anything" if a future edit
 * ever tries to fold the two sentinels together.
 */
export type BrandToken = number | 'org'

export function brandToken(brandId: number | null): BrandToken {
  return brandId === null ? 'org' : brandId
}

/**
 * True when the host should render the wizard rather than the editor.
 *
 * A completed page always wins regardless of the latch — `completed` is the
 * server's own answer and the latch exists only to bridge the refetch
 * window right after `apply()` succeeds, not to override the server once it
 * has actually caught up. Otherwise, `doneForBrand` suppresses the wizard
 * ONLY for the brand token it was recorded for; any other token (including
 * a brand that has never been done) falls through to "yes, show it."
 */
export function showWizard(completed: boolean, doneForBrand: BrandToken | undefined, currentBrandId: number | null): boolean {
  if (completed) return false
  return doneForBrand !== brandToken(currentBrandId)
}
