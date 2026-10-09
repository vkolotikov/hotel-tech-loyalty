import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { applyServerLanguage } from '../i18n'
import { queryClient } from '../lib/queryClient'
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
  /**
   * HexaTech's own operators (the server's platform_admin_emails allowlist).
   * Not an organisation owner: staff role super_admin is every owner's role.
   * Sent by sign-in and GET /v1/auth/me; missing in sessions from before
   * 2026-10-09, which read as false.
   */
  is_platform_admin?: boolean
  /**
   * Workspaces the user's organisation has (every organisation has the
   * appointments workspace unless it was switched off). `landing` sends a
   * staff user to the workspace right after signing in; `has_services`
   * says whether it has an active service (the full admin shows its way in
   * either way since 2026-10-06; see appointments/lib/landing.ts). `only`
   * marks an organisation on the Appointments plan: no full admin (Part C).
   */
  workspaces?: { appointments?: { landing?: boolean; has_services?: boolean; only?: boolean } }
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
  /**
   * The same signed-in user, brought up to date with GET /v1/auth/me: the
   * organisation's workspaces can change after sign-in (a new workspace, the
   * Appointments plan), and so can its industry (Settings → Industry). Ignored
   * for another user; never touches the token.
   */
  refreshUser: (fresh: Partial<User> | null | undefined) => void
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
        // Drop ALL React Query cache when a new identity binds — staff B
        // logging in after staff A signed out must not see any of A's
        // cached members / customers / chat transcripts / AI brief
        // summaries flash on screen during the staleTime window. See
        // AUDIT-2026-06-13.md frontend high finding (cross-tenant cache
        // leakage). Skipped on no-op same-token bind so normal refetches
        // don't blow away in-flight queries.
        const prevToken = get().token
        if (prevToken !== token) {
          try { queryClient.clear() } catch { /* defensive */ }
        }
        localStorage.setItem('auth_token', token)
        set({ token, user, staff })
        applyServerLanguage(user.language ?? null)
      },
      refreshUser: (fresh) => {
        const { user } = get()
        if (!user || !fresh || fresh.id !== user.id) return
        set({
          user: {
            ...user,
            workspaces: fresh.workspaces,
            // Only when the answer carries them: an older response without
            // the fields must not wipe the industry the session signed in with.
            ...(fresh.industry !== undefined ? { industry: fresh.industry } : {}),
            ...(fresh.industry_explicit !== undefined ? { industry_explicit: fresh.industry_explicit } : {}),
            ...(fresh.is_platform_admin !== undefined ? { is_platform_admin: fresh.is_platform_admin } : {}),
          },
        })
      },
      logout: () => {
        // Same reasoning — wipe cached data on the way out so a shared
        // kiosk / front-desk PC doesn't surface the prior session's
        // tenant data to the next user. Also clear the persisted
        // zustand store so user/staff PII doesn't survive a
        // logout-then-refresh.
        try { queryClient.clear() } catch { /* defensive */ }
        localStorage.removeItem('auth_token')
        localStorage.removeItem('loyalty-auth')
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
