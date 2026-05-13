import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Brand currently selected in the admin SPA. See apps/loyalty/MULTI_BRAND_PLAN.md
 * for the full architecture.
 *
 *   currentBrandId === null  → "All brands" mode (org-level view, no brand filter)
 *   currentBrandId === N     → specific brand selected; brand-scoped pages filter,
 *                               org-scoped pages can show a "Filtered to X" chip
 *
 * Persisted to localStorage so a refresh keeps the same context. The
 * api.ts request interceptor reads this on every call and appends
 * `?brand_id=N` (or `?brand_id=all`) so the backend BrandMiddleware can
 * bind the right brand without each component remembering to pass it.
 */

export interface BrandSummary {
  id: number
  name: string
  slug: string
  description: string | null
  logo_url: string | null
  primary_color: string | null
  widget_token: string
  is_default: boolean
  sort_order: number
  created_at: string
}

interface BrandState {
  /** All brands fetched for the current org. Refreshed via fetchBrands(). */
  brands: BrandSummary[]
  /** Selected brand id. null means "All brands" / portfolio-wide. */
  currentBrandId: number | null
  /** Set true while the brands list is being loaded. */
  loading: boolean
  /** Replace the brands list (called after API fetch). */
  setBrands: (brands: BrandSummary[]) => void
  /** Switch active brand. null = "All brands". */
  setCurrentBrand: (brandId: number | null) => void
  /** Convenience: how many brands does the org have? Drives switcher visibility. */
  brandCount: () => number
  /** The currently-selected BrandSummary, or null when "All brands". */
  currentBrand: () => BrandSummary | null
}

export const useBrandStore = create<BrandState>()(
  persist(
    (set, get) => ({
      brands: [],
      currentBrandId: null,
      loading: false,
      setBrands: (brands) => {
        const { currentBrandId } = get()

        // Single-brand org: auto-select the only brand instead of staying
        // on "All brands". Otherwise newly-created records (popup rules,
        // KB items, chatbot config, etc.) get brand_id=NULL because the
        // BelongsToBrand trait only auto-fills when current_brand_id is
        // bound to a truthy value. When a 2nd brand is later added and
        // the admin filters by brand, those NULL rows vanish — that's
        // exactly the "popup rules disappear after creating brand 2" bug.
        if (brands.length === 1) {
          set({ brands, currentBrandId: brands[0].id })
          return
        }

        // If the persisted brand is no longer in the list (renamed org,
        // brand was deleted, switched accounts), fall back to "All brands"
        // rather than sending a stale id to the backend.
        if (currentBrandId && !brands.some(b => b.id === currentBrandId)) {
          set({ brands, currentBrandId: null })
        } else {
          set({ brands })
        }
      },
      setCurrentBrand: (brandId) => set({ currentBrandId: brandId }),
      brandCount: () => get().brands.length,
      currentBrand: () => {
        const { currentBrandId, brands } = get()
        if (currentBrandId === null) return null
        return brands.find(b => b.id === currentBrandId) ?? null
      },
    }),
    {
      name: 'loyalty-brand',
      // Only persist what we need; brands list is fetched on app load.
      partialize: (state) => ({ currentBrandId: state.currentBrandId }),
    },
  ),
)
