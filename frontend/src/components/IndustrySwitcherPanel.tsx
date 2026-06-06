/**
 * Settings → Industry switcher panel.
 *
 * Industry Platform Plan Phase 10.
 *
 * In-app surface for switching the org's industry. Parallel to the
 * Phase 4 cross-domain `IndustryMismatchBanner` which fires when an
 * admin signs in from a sub-brand domain that doesn't match their
 * org's stored industry. This panel is the explicit, always-available
 * way to change industry — no host detection, no banner suppression
 * rules.
 *
 * Both surfaces hit the SAME endpoint (`POST /v1/auth/apply-industry`)
 * with the SAME data-safety contract: a 409 response on populated orgs
 * lists every change the switch will make, requires explicit
 * acknowledge before commit. Empty orgs (fresh signups) skip the
 * acknowledge gate and apply immediately. After commit, the SPA hard-
 * reloads so the new sidebar + vocabulary + KPIs take effect.
 *
 * UX layout:
 *   1. Current industry chip (read-only) — "You're on: HotelTechAI"
 *   2. Card grid for all 8 canonical industries (4 GTM + 4 settings-
 *      only). Each card shows brand name + one-line description +
 *      "Current" badge when active.
 *   3. Picking a NEW industry opens the same confirmation modal flow
 *      as the Phase 4 banner — pre-fetches the changes[] list, then
 *      asks the admin to acknowledge.
 *
 * Suppression rule: re-clicking the current industry is a no-op.
 */
import { useEffect, useMemo, useState } from 'react'
import { Building2, Sparkles, Stethoscope, Utensils, Scale, Home, GraduationCap, Dumbbell, Check, Loader2, AlertTriangle } from 'lucide-react'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import { industryCopyFor } from '../lib/industryCopy'
import type { IndustryId } from '../lib/industryHosts'

interface ApplyResponse {
  message?: string
  industry?: string
  from?: string
  changed?: boolean
  requires_acknowledge?: boolean
  changes?: string[]
  loyalty_summary?: Record<string, unknown> | null
  error?: string
}

// Canonical 8 industries — 4 GTM + 4 settings-only. Order matches
// the marketing site's industry picker so admins recognise the
// layout from the umbrella signup flow.
const INDUSTRIES: { id: IndustryId; icon: typeof Building2; description: string; gtm: boolean }[] = [
  { id: 'hotel',       icon: Building2,     description: 'Hotels, resorts, hospitality operators', gtm: true },
  { id: 'beauty',      icon: Sparkles,      description: 'Beauty salons, spas, wellness studios', gtm: true },
  { id: 'medical',     icon: Stethoscope,   description: 'Clinics, medical practices, healthcare', gtm: true },
  { id: 'restaurant',  icon: Utensils,      description: 'Restaurants, venues, hospitality', gtm: true },
  { id: 'legal',       icon: Scale,         description: 'Law firms, consultations', gtm: false },
  { id: 'real_estate', icon: Home,          description: 'Real-estate agencies, viewings', gtm: false },
  { id: 'education',   icon: GraduationCap, description: 'Schools, tutors, training providers', gtm: false },
  { id: 'fitness',     icon: Dumbbell,      description: 'Fitness studios, gyms, classes', gtm: false },
]

export function IndustrySwitcherPanel() {
  const user = useAuthStore(s => s.user)
  const currentIndustry = (user?.industry as IndustryId | undefined) ?? 'hotel'
  const isExplicit = user?.industry_explicit === true

  const [targetIndustry, setTargetIndustry] = useState<IndustryId | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [changes, setChanges] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Escape closes the modal (mirrors Phase 4 banner).
  useEffect(() => {
    if (!modalOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) setModalOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [modalOpen, submitting])

  const currentCopy = useMemo(() => industryCopyFor(currentIndustry), [currentIndustry])
  const targetCopy = useMemo(() => targetIndustry ? industryCopyFor(targetIndustry) : null, [targetIndustry])

  const onPick = async (id: IndustryId) => {
    if (id === currentIndustry) return
    setTargetIndustry(id)
    setModalOpen(true)
    setError(null)
    setChanges(null)
    setSubmitting(true)
    // Pre-fetch the changes list via apply-industry with acknowledge=false.
    // Empty-org happy path → 200 with changed=true → reload.
    // Populated-org → 409 with requires_acknowledge + changes[].
    // Cross-tab race (already on this industry) → 200 changed=false → reload.
    try {
      const { data } = await api.post<ApplyResponse>('/v1/auth/apply-industry', {
        industry: id,
        acknowledge: false,
      })
      if (data && (data.changed === true || data.changed === false)) {
        window.location.reload()
        return
      }
    } catch (e: any) {
      const body = e?.response?.data as ApplyResponse | undefined
      if (body?.requires_acknowledge && Array.isArray(body.changes)) {
        setChanges(body.changes)
      } else {
        setError(body?.error || 'Could not determine industry change preview. Try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const confirmApply = async () => {
    if (!targetIndustry) return
    setSubmitting(true)
    setError(null)
    try {
      await api.post<ApplyResponse>('/v1/auth/apply-industry', {
        industry: targetIndustry,
        acknowledge: true,
      })
      window.location.reload()
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Could not apply industry. Try again.')
      setSubmitting(false)
    }
  }

  const closeModal = () => {
    if (submitting) return
    setModalOpen(false)
    setTargetIndustry(null)
    setChanges(null)
    setError(null)
  }

  return (
    <div className="space-y-6">
      {/* Header + current state */}
      <div className="rounded-2xl bg-dark-surface border border-dark-border p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-700/10 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
            <Building2 size={20} className="text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-white">Industry</h2>
            <p className="text-sm text-gray-400 mt-0.5">
              Your workspace is configured for <span className="text-white font-semibold">{currentCopy.brand}</span>.
              {!isExplicit && (
                <span className="text-amber-400/80"> (defaulted from signup — pick the right one below to make it explicit)</span>
              )}
            </p>
            <p className="text-xs text-gray-500 mt-2">
              Switching reshapes the CRM pipeline, planner groups, loyalty preset, vocabulary, dashboard KPIs,
              AI prompts, email templates and member mobile app — atomically. Existing customer, member,
              reservation and booking data is preserved.
            </p>
          </div>
        </div>
      </div>

      {/* 8 industry cards in a 2-column grid (4 GTM first, then 4 settings-only). */}
      <div>
        <h3 className="text-[11px] uppercase tracking-wider text-gray-500 font-bold mb-2">Marketing-supported industries</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {INDUSTRIES.filter(i => i.gtm).map(it => {
            const copy = industryCopyFor(it.id)
            const isCurrent = it.id === currentIndustry
            const Icon = it.icon
            return (
              <button
                key={it.id}
                onClick={() => onPick(it.id)}
                disabled={isCurrent || submitting}
                className={
                  'group text-left p-4 rounded-xl border transition-all ' +
                  (isCurrent
                    ? 'bg-amber-500/[0.08] border-amber-500/40 cursor-default'
                    : 'bg-dark-surface border-dark-border hover:border-amber-500/40 hover:bg-amber-500/[0.04]')
                }
              >
                <div className="flex items-start gap-3">
                  <div className={
                    'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ' +
                    (isCurrent ? 'bg-amber-500/20 border border-amber-500/30' : 'bg-white/[0.04] border border-white/10 group-hover:border-amber-500/30')
                  }>
                    <Icon size={18} className={isCurrent ? 'text-amber-400' : 'text-gray-400'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-white">{copy.brand}</span>
                      {isCurrent && (
                        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          Current
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">{it.description}</div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <h3 className="text-[11px] uppercase tracking-wider text-gray-500 font-bold mb-2">Other supported industries</h3>
        <p className="text-xs text-gray-500 mb-2">
          These verticals work end-to-end but don't have a dedicated marketing sub-brand yet — your workspace
          will route through the umbrella <span className="text-gray-300">HexaTech</span> brand for emails + sign-in.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {INDUSTRIES.filter(i => !i.gtm).map(it => {
            const copy = industryCopyFor(it.id)
            const isCurrent = it.id === currentIndustry
            const Icon = it.icon
            return (
              <button
                key={it.id}
                onClick={() => onPick(it.id)}
                disabled={isCurrent || submitting}
                className={
                  'group text-left p-4 rounded-xl border transition-all ' +
                  (isCurrent
                    ? 'bg-amber-500/[0.08] border-amber-500/40 cursor-default'
                    : 'bg-dark-surface border-dark-border hover:border-amber-500/40 hover:bg-amber-500/[0.04]')
                }
              >
                <div className="flex items-start gap-3">
                  <div className={
                    'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ' +
                    (isCurrent ? 'bg-amber-500/20 border border-amber-500/30' : 'bg-white/[0.04] border border-white/10 group-hover:border-amber-500/30')
                  }>
                    <Icon size={18} className={isCurrent ? 'text-amber-400' : 'text-gray-400'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-white">{copy.brand}</span>
                      {isCurrent && (
                        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          Current
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">{it.description}</div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Confirmation modal — same data-safety acknowledge gate as the
          Phase 4 banner. Mounts on pick; closes on Escape / backdrop /
          Cancel. */}
      {modalOpen && targetIndustry && targetCopy && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={closeModal}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="industry-switcher-title"
            className="bg-dark-surface border border-dark-border rounded-2xl shadow-2xl max-w-lg w-full p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="industry-switcher-title" className="text-lg font-bold text-white mb-1">
              Switch workspace to {targetCopy.brand}?
            </h2>
            <p className="text-sm text-gray-400 mb-4">
              Your existing customer, member and reservation data is preserved. Industry-shaped settings
              (pipeline, planner, loyalty, vocabulary, KPIs) will be reshaped atomically.
            </p>

            {/* Pre-fetched changes list (populated org) or empty body (loading / empty-org path). */}
            {submitting && !changes && !error && (
              <div className="flex items-center gap-2 text-sm text-gray-400 py-6 justify-center">
                <Loader2 size={16} className="animate-spin" />
                Checking what will change…
              </div>
            )}

            {changes && changes.length > 0 && (
              <div className="rounded-xl bg-amber-500/[0.06] border border-amber-500/30 p-4 mb-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-amber-100">
                    <div className="font-semibold mb-2">What will change:</div>
                    <ul className="space-y-1 text-xs text-amber-100/85">
                      {changes.map((c, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="text-amber-400 mt-0.5">•</span>
                          <span>{c}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-xl bg-red-500/[0.06] border border-red-500/30 p-3 mb-4">
                <div className="text-sm text-red-300">{error}</div>
              </div>
            )}

            <div className="flex gap-3 justify-end mt-4">
              <button
                onClick={closeModal}
                disabled={submitting}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:text-white hover:bg-white/[0.05] disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmApply}
                disabled={submitting || !!error}
                className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-black text-sm font-semibold disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Switch to {targetCopy.brand}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
