/**
 * Pure URL/expiry logic for `LandingPreview.tsx` — split out for the same
 * reason as every other pure module in this folder (`wizardGate.ts`,
 * `editorSections.ts`, `landingDraft.ts`): this repo's vitest is
 * pure-function-only (no jsdom, no React Testing Library — see
 * `vitest.config.ts`'s own docblock), so the `<iframe>` itself cannot be
 * exercised by an automated test at all. What CAN be tested is the
 * decision this component makes about the signed preview URL's lifetime.
 *
 * Named apart from `LandingPreview.tsx` (rather than the more obvious
 * `landingPreview.ts`) because this repo's checkout sits on a
 * case-insensitive filesystem: `tsc -b` refuses two files whose paths
 * differ only by case (TS1261/TS1149), so `LandingPreview.tsx` and a
 * same-named-but-cased `.ts` module cannot coexist here even though a
 * case-sensitive filesystem would allow it.
 *
 * `POST /v1/admin/landing-pages/preview-url`
 * (`LandingPageController::previewUrl()`) mints a `temporarySignedRoute`
 * valid for exactly 2 hours from the moment of the call. The response body
 * is `{url}` only — no expiry timestamp — so the client has to track "when
 * did I mint this" itself (TanStack Query's `dataUpdatedAt` does that for
 * free) if it wants to do anything about staleness before the tenant hits
 * a blocked/expired preview.
 *
 * Decision made here, per the brief's "a tenant may leave the editor open
 * longer than 2 hours — decide what happens and make it not-confusing":
 * refetch a fresh URL proactively, comfortably before the 2-hour signature
 * actually expires, rather than waiting for a dead link and then
 * explaining it. A tenant who leaves the editor tab OPEN AND FOREGROUNDED
 * through the refetch boundary gets a new, valid URL with no visible
 * interruption.
 *
 * A BACKGROUNDED tab does NOT get that for free. `frontend/src/lib/
 * queryClient.ts` sets `refetchOnWindowFocus: false` globally, and this
 * query (`LandingPreview.tsx`) does not override it — unlike
 * `useSubscription.ts`, which explicitly sets `refetchOnWindowFocus: true`
 * on its own query precisely because the app-wide default is false.
 * `refetchIntervalInBackground` also defaults to false, so the proactive
 * `refetchInterval` timer itself does not tick while the tab is hidden.
 * Net effect for a tab backgrounded past the 2-hour mark: no automatic
 * refresh fires on refocus. `isPreviewUrlExpired` is what actually carries
 * that case — the fallback for a proactive refetch that failed OR simply
 * never ran while hidden — and it is what tells the component to show an
 * honest "this preview link has expired, reload" state, with a manual
 * "Reload preview" click, instead of leaving an iframe silently pointed
 * at a signature the server will now reject.
 */

/** Matches `LandingPageController::previewUrl()`'s `now()->addHours(2)`. */
export const PREVIEW_URL_TTL_MS = 2 * 60 * 60 * 1000

/**
 * How long before the true expiry to refetch. Wide enough that an
 * in-flight refetch, a slow network, or a backgrounded tab's coalesced
 * timer firing a little late still lands well inside the signature's
 * validity window.
 */
export const PREVIEW_REFRESH_MARGIN_MS = 15 * 60 * 1000

/**
 * The interval to pass to TanStack Query's `refetchInterval` so a
 * long-open editor session mints a new signed URL before the old one's
 * signature actually expires. Takes the TTL/margin as parameters (rather
 * than the component reading the module constants directly into the
 * interval prop) purely so the boundary math itself, not just today's
 * constants, is what the test pins. Clamped to zero so a misconfigured
 * margin (>= the TTL) can never produce a negative interval.
 */
export function previewRefetchIntervalMs(
  ttlMs: number = PREVIEW_URL_TTL_MS,
  marginMs: number = PREVIEW_REFRESH_MARGIN_MS,
): number {
  return Math.max(ttlMs - marginMs, 0)
}

/**
 * True once a URL minted at `mintedAt` has actually passed its signed
 * expiry as of `now`. This is the state the proactive refetch above
 * exists to avoid, but a failing refetch (offline, an expired admin
 * session, ...) means it can still happen. Used only to decide whether to
 * show the "this preview link has expired — reload" fallback rather than
 * trust an iframe whose `src` the server will now answer with a signature
 * error.
 */
export function isPreviewUrlExpired(mintedAt: number, now: number, ttlMs: number = PREVIEW_URL_TTL_MS): boolean {
  return now - mintedAt >= ttlMs
}
