import { useQueryClient } from '@tanstack/react-query'
import { useBrandStore } from '../stores/brandStore'

/**
 * SWITCH THE ACTIVE BRAND — the SPA's one way of doing it.
 *
 * Lifted verbatim out of `BrandSwitcher.tsx`'s own `switchTo`, which had
 * been the only place in the app that knew the two-step recipe: set the
 * store (synchronously, because `api.ts`'s request interceptor reads it on
 * every call to append `?brand_id=`), then invalidate EVERYTHING so every
 * mounted page refetches under the new brand.
 *
 * The blunt `invalidateQueries()` is deliberate and inherited, not a
 * shortcut introduced here — see the note it carries at its call site
 * below: it is correct without auditing every page for which of its queries
 * depend on brand context, and a per-page allowlist is a list that goes
 * stale the first time somebody adds a screen.
 *
 * IT LIVES HERE BECAUSE THERE ARE NOW TWO CALL SITES. The landing builder
 * makes the brand an explicit first step — a tenant editing one brand's page
 * has to be able to see which brand that is and move to another — and a
 * second hand-written copy of "set the store, then invalidate" is exactly
 * how two screens end up switching brand differently, one of them leaving
 * stale data on screen. `BrandSwitcher` calls this too, so there is one
 * implementation with two entrances rather than two implementations.
 *
 * A switch to the brand already selected is a no-op: re-invalidating every
 * query in the app because somebody re-picked what was already picked is a
 * full refetch of the screen for nothing.
 */
export function useBrandSwitch(): (brandId: number | null) => void {
  const { currentBrandId, setCurrentBrand } = useBrandStore()
  const qc = useQueryClient()

  return (brandId: number | null) => {
    if (brandId === currentBrandId) return

    setCurrentBrand(brandId)
    // Heavy hammer: invalidate everything so all pages refetch with the
    // new brand context. Cheaper than maintaining a per-page allowlist.
    qc.invalidateQueries()
  }
}
