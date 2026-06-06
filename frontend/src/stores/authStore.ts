import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { applyServerLanguage } from '../i18n'
import type { IndustryId } from '../lib/industryHosts'

interface User {
  id: number
  name: string
  email: string
  user_type: string
  language?: string | null
  /**
   * Industry Platform Plan Phase 1 — the org's resolved industry.
   * Sent by GET /v1/auth/me. Falls back through:
   *   organizations.industry → crm_settings.industry_preset → 'hotel'
   * so existing tenants always have a usable value even before the
   * Phase 10 backfill writes the column. The SPA gates sidebar,
   * dashboard KPIs, vocabulary, AI behaviour on this.
   *
   * **Forward-compat caveat**: stale sessions from before this field was
   * surfaced (Phase 1 ship) will rehydrate from `loyalty-auth`
   * localStorage with `industry` undefined until `/v1/auth/me` is hit
   * again. Phase 4's mismatch banner must treat undefined as "not loaded
   * yet" rather than "hotel by default" — otherwise refreshing on a
   * sub-brand domain before /me returns would spuriously prompt to
   * switch. The persist `version: 1` bump below gives Phase 4 a clean
   * hook to invalidate stale state if that's not enough.
   */
  industry?: IndustryId
  /**
   * True when the org has explicitly picked an industry. Distinguishes a
   * real registration choice from a defaulted-to-hotel fallback. Used by
   * Phase 4's sub-domain mismatch banner — orgs without an explicit
   * choice should be silently configured, never prompted.
   */
  industry_explicit?: boolean
}

interface Staff {
  role: string
  hotel_name: string
  can_award_points: boolean
  can_redeem_points: boolean
  can_manage_offers: boolean
  can_view_analytics: boolean
  /**
   * Per-user sidebar group whitelist set by an admin in Settings →
   * Team. `null` = "no restriction" (user sees whatever org-level
   * Settings → Menu allows). Non-empty array = only those groups
   * visible in the sidebar. Always ignored for super_admin /
   * manager roles, who see everything.
   */
  allowed_nav_groups?: string[] | null
  /**
   * Planner backlog skill allowlist (Settings → Team). Null = staff can
   * claim any pool task; non-empty array = whitelist of task_group
   * values they can claim. Managers + super_admins always bypass the
   * gate regardless of this field. Used by the Planner's BacklogDrawer
   * to (a) filter the pool view, (b) default the quick-add task_group.
   */
  planner_skills?: string[] | null
}

interface AuthState {
  token: string | null
  user: User | null
  staff: Staff | null
  setAuth: (token: string, user: User, staff?: Staff) => void
  logout: () => void
  isAdmin: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      staff: null,
      setAuth: (token, user, staff) => {
        localStorage.setItem('auth_token', token)
        set({ token, user, staff })
        // Sync the user's saved language preference to i18n so the same
        // staff member sees the same locale on every device. No-op when
        // user.language is missing or doesn't match a supported locale.
        applyServerLanguage(user.language ?? null)
      },
      logout: () => {
        localStorage.removeItem('auth_token')
        set({ token: null, user: null, staff: null })
      },
      isAdmin: () => {
        const { staff } = get()
        return staff?.role === 'super_admin' || staff?.role === 'manager'
      },
    }),
    {
      name: 'loyalty-auth',
      // Bumped from implicit 0 → 1 in the Industry Platform Plan Phase 1
      // ship: `user.industry` + `user.industry_explicit` were added to
      // the User type. Existing sessions rehydrate without these fields
      // until the next `/v1/auth/me`. Any future breaking change to the
      // persisted shape bumps this again + uses `migrate` to translate.
      version: 1,
    }
  )
)
