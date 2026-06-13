import { api, APP_BASE } from './api'
import { useAuthStore } from '../stores/authStore'

/**
 * Single logout path — supersedes the four separate sites that each
 * implemented this differently:
 *
 *   1. Layout.handleLogout (the sidebar's "Log out" button)
 *   2. Layout SubscriptionWall "Or sign out" button
 *   3. api.ts 401 interceptor
 *   4. (Login.tsx still owns its own pre-login token reset; intentional —
 *      that path is about clearing a stale token before *attempting* a
 *      fresh login, not a user-initiated sign-out.)
 *
 * Order matters:
 *  - DELETE /v1/auth/logout first so the server-side Sanctum PAT is
 *    revoked. Wrapped in try/catch so a network blip doesn't trap the
 *    user — the local clear happens regardless.
 *  - useAuthStore.logout() second — this clears React Query cache
 *    (queryClient.clear()), localStorage.auth_token, and the persisted
 *    loyalty-auth zustand bundle (user/staff PII).
 *  - window.location.href LAST so the navigation away happens after the
 *    cache + storage are wiped.
 *
 * See AUDIT-2026-06-13-ADDENDUM.md frontend finding for the cross-tenant
 * cache leakage + persisted-PII reasoning.
 */
export async function logoutAndRedirect(redirectPath: string = '/login'): Promise<void> {
  try {
    await api.delete('/v1/auth/logout')
  } catch {
    /* network/server failure: revoke locally regardless so the user is
       not stuck inside the admin on a broken session. */
  }
  try {
    useAuthStore.getState().logout()
  } catch {
    /* defensive — store-clear failure should never block the redirect */
  }
  window.location.href = `${APP_BASE}${redirectPath}`
}
