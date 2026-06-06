/**
 * Sub-domain ↔ org-industry mismatch banner.
 *
 * Industry Platform Plan Phase 4.
 *
 * Use case: an admin from a hotel-configured org clicks through a
 * marketing link to `beauty-tech.uk` and signs in there. We could
 * silently apply the beauty preset (destructive — reshapes the whole
 * pipeline, planner, vocabulary) but they didn't ask for that. We
 * could ignore the mismatch (then why did they land on beauty-tech.uk
 * at all?). The middle path: show an in-app banner offering a one-tap
 * switch, with a confirmation modal listing exactly what will change.
 *
 * **Suppression rules**:
 *   - Hide when the user has NEVER explicitly picked an industry
 *     (`industry_explicit=false` on `/v1/auth/me`). For these orgs the
 *     industry was defaulted from a silent backfill or the SaaS JWT;
 *     prompting them to "switch" doesn't make sense because they
 *     haven't actually chosen anything yet. Phase 10's Settings
 *     switcher is the right surface for those orgs.
 *   - Hide on the umbrella host (`app.hexa-tech.uk`) — it's
 *     industry-agnostic by design (decision #8).
 *   - Hide for the session after the user clicks Dismiss — stored in
 *     `sessionStorage` so it returns next session if the mismatch
 *     persists.
 *
 * **Apply flow**: the confirmation modal calls
 * `POST /v1/auth/apply-industry` with `acknowledge=true`. Phase 2's
 * data-safety contract is the load-bearing safety — the endpoint
 * already checks for existing data and returns 409 with a structured
 * `changes` array if the org has any (which we then surface verbatim
 * to the admin). On 200 OK, the SPA reloads so the new sidebar +
 * vocabulary + KPIs take effect immediately.
 */
import { useEffect, useMemo, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { AlertTriangle, X, Check, Loader2 } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import { detectIndustryFromWindow, type IndustryId } from '../lib/industryHosts'
import { industryCopyFor } from '../lib/industryCopy'

const DISMISS_KEY = 'industry-mismatch-dismissed-v1'
// Sentinel for missing values in the dismissal key. Must NOT collide
// with any real IndustryId (today none of the 8 ids are '_none_'; keep
// the underscore-padding to future-proof against any test id).
const NONE_SENTINEL = '_none_'

function isDismissedThisSession(orgIndustry: string | undefined, hostIndustry: string | null): boolean {
  try {
    const raw = sessionStorage.getItem(DISMISS_KEY)
    if (!raw) return false
    // Dismissal is per-(org, host) so a user who dismissed the
    // hotel→beauty banner and then navigates to medtech.ai still
    // sees a fresh hotel→medical banner.
    return raw === `${orgIndustry ?? NONE_SENTINEL}|${hostIndustry ?? NONE_SENTINEL}`
  } catch {
    return false
  }
}

function markDismissed(orgIndustry: string | undefined, hostIndustry: string | null): void {
  try {
    sessionStorage.setItem(DISMISS_KEY, `${orgIndustry ?? NONE_SENTINEL}|${hostIndustry ?? NONE_SENTINEL}`)
  } catch { /* private mode — silently skip */ }
}

interface ApplyResponse {
  message?: string
  industry?: string
  from?: string
  changed?: boolean
  requires_acknowledge?: boolean
  changes?: string[]
  error?: string
}

export function IndustryMismatchBanner() {
  const user = useAuthStore(s => s.user)
  const location = useLocation()
  const [searchParams] = useSearchParams()

  // Strict hostname detection: returns null on umbrella + unmapped
  // staging hosts so we don't prompt to "switch to null mode" there.
  const hostIndustry = useMemo<IndustryId | null>(() => detectIndustryFromWindow(true), [])

  // Phase 10 ships a Settings → Industry switcher tab. When the admin
  // is already on that tab they're actively trying to fix the
  // mismatch — showing the banner on top would race the in-tab CTA
  // and create two competing entry points for the same action.
  const onSettingsIndustryTab =
    location.pathname === '/settings' && searchParams.get('tab') === 'industry'

  // Track the actual mismatch state — only render when there's a
  // real, persistent mismatch the user hasn't dismissed.
  const orgIndustry = user?.industry
  const orgIndustryExplicit = user?.industry_explicit === true
  const isMismatch = !!hostIndustry && !!orgIndustry && hostIndustry !== orgIndustry
  const shouldShow =
    isMismatch &&
    orgIndustryExplicit && // never prompt orgs that haven't picked an industry yet
    !onSettingsIndustryTab && // don't compete with the in-tab switcher
    !isDismissedThisSession(orgIndustry, hostIndustry)

  const [modalOpen, setModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // `changes` is populated from the 409 response if the apply-industry
  // endpoint detects existing data and requires explicit acknowledge.
  // We show this list verbatim in the confirmation modal — the
  // backend is the source of truth for "what will change."
  const [changes, setChanges] = useState<string[] | null>(null)
  const [dismissed, setDismissed] = useState(false)

  // Reset transient state when the mismatch flips off (e.g. after a
  // successful apply that triggered a page reload anyway, but defence
  // in depth in case caller mounts/unmounts).
  useEffect(() => {
    if (!isMismatch) {
      setModalOpen(false)
      setError(null)
      setChanges(null)
    }
  }, [isMismatch])

  if (!shouldShow || dismissed) return null

  const hostCopy = industryCopyFor(hostIndustry)
  const orgCopy = industryCopyFor(orgIndustry as IndustryId)

  const openConfirm = async () => {
    setModalOpen(true)
    setError(null)
    // Pre-fetch the `changes` list by calling apply-industry WITHOUT
    // `acknowledge=true`. The endpoint returns 409 with the structured
    // change list when the org has existing data — exactly what we
    // want to show the admin before they commit. For empty orgs it
    // returns 200 immediately, which we treat as "no changes preview
    // needed" and proceed directly on confirm.
    setSubmitting(true)
    try {
      const { data } = await api.post<ApplyResponse>('/v1/auth/apply-industry', {
        industry: hostIndustry,
        acknowledge: false,
      })
      // Two 2xx branches:
      //   - changed: true  → empty-org apply succeeded; reload.
      //   - changed: false → no-op (already on this industry).
      //     Cross-tab race: tab A committed + reloaded the apply
      //     while tab B was still showing stale mismatch state.
      //     Reload tab B too so its /v1/auth/me returns the now-
      //     matching industry and the banner unmounts cleanly
      //     instead of sitting in a dead modal state.
      if (data && (data.changed === true || data.changed === false)) {
        window.location.reload()
        return
      }
    } catch (e: any) {
      // 409 with `requires_acknowledge` is the expected populated-org
      // response — capture the change list to render in the modal.
      const body = e?.response?.data as ApplyResponse | undefined
      if (body?.requires_acknowledge && Array.isArray(body.changes)) {
        setChanges(body.changes)
      } else {
        setError(body?.error || 'Could not determine industry change preview. Try again or skip.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  // Escape key + click-outside both close the modal. Click-outside is
  // already wired via the backdrop's onClick. Escape needs an explicit
  // listener — without it keyboard-only users can't dismiss the modal.
  useEffect(() => {
    if (!modalOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) setModalOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [modalOpen, submitting])

  const confirmApply = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await api.post<ApplyResponse>('/v1/auth/apply-industry', {
        industry: hostIndustry,
        acknowledge: true,
      })
      // Hard reload — `/v1/auth/me` returns fresh industry, the
      // industryGating + vocabulary stores pick it up on bootstrap.
      // Soft state updates would leave caches (theme, KPIs, sidebar
      // hide list) stale until the user navigates.
      window.location.reload()
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Could not apply industry. Try again.')
      setSubmitting(false)
    }
  }

  const dismiss = () => {
    markDismissed(orgIndustry, hostIndustry)
    setDismissed(true)
  }

  return (
    <>
      {/* Top banner — orange so it reads as an offer (not a critical
          error). Sits above the main content; Layout already gives the
          main area its own padding so this banner stretches edge-to-
          edge under the topbar. */}
      <div className="bg-amber-500/[0.08] border-b border-amber-500/30 text-amber-100 px-4 lg:px-6 py-2.5 flex items-center gap-3 text-sm">
        <AlertTriangle size={16} className="text-amber-400 flex-shrink-0" />
        <span className="flex-1 min-w-0">
          You're on <strong className="text-white">{hostCopy.brand}</strong> but your workspace is
          configured as <strong className="text-white">{orgCopy.brand}</strong>.
          <button
            type="button"
            onClick={openConfirm}
            className="ml-2 underline underline-offset-2 hover:text-white transition-colors"
          >
            Switch to {hostCopy.brand} mode?
          </button>
        </span>
        <button
          type="button"
          onClick={dismiss}
          className="text-amber-300 hover:text-white transition-colors p-1 -m-1 rounded"
          aria-label="Dismiss for this session"
          title="Dismiss for this session (will return next time)"
        >
          <X size={15} />
        </button>
      </div>

      {/* Confirmation modal — only renders once openConfirm has resolved. */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => !submitting && setModalOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="industry-mismatch-title"
            className="bg-dark-surface border border-dark-border rounded-2xl shadow-2xl max-w-lg w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="industry-mismatch-title" className="text-lg font-bold text-white mb-1">
              Switch workspace to {hostCopy.brand}?
            </h2>
            <p className="text-sm text-gray-400 mb-4">
              The platform will reconfigure your workspace for {hostCopy.brand}. Your existing
              customer, member, and reservation data is preserved.
            </p>

            {submitting && !changes && !error && (
              <div className="flex items-center gap-2 text-sm text-gray-400 py-6 justify-center">
                <Loader2 size={16} className="animate-spin" /> Checking workspace…
              </div>
            )}

            {changes && changes.length > 0 && (
              <div className="bg-dark-bg/50 border border-dark-border rounded-lg p-3 mb-4 space-y-1.5">
                <p className="text-[11px] uppercase tracking-wider font-bold text-gray-500 mb-2">
                  What will change
                </p>
                {changes.map((c, i) => (
                  <div key={i} className="flex items-start gap-2 text-[13px] text-gray-300">
                    <span className="text-amber-400 mt-0.5">•</span>
                    <span>{c}</span>
                  </div>
                ))}
              </div>
            )}

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-300 rounded-lg px-3 py-2 mb-4 text-sm">
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => !submitting && setModalOpen(false)}
                disabled={submitting}
                className="px-3 py-2 text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmApply}
                disabled={submitting}
                className="px-4 py-2 text-sm font-bold rounded-lg bg-amber-500 hover:bg-amber-400 text-black transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {submitting ? 'Switching…' : `Switch to ${hostCopy.brand}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
