import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock, Sparkles, X } from 'lucide-react'
import { ALL_FEATURES, PLAN_FEATURES } from '../lib/planFeatures'

/**
 * Listens for `feature:locked` events from the api.ts axios interceptor
 * (fired on every 402 + `code: 'feature_locked'` response) and renders a
 * conversion-friendly upgrade modal in place of a transient error toast.
 *
 * Shape: locked feature pulled from event detail → friendly label and
 * blurb resolved against the shared `planFeatures.ts` taxonomy → primary
 * CTA routes to /billing in-SPA (no external SaaS URL) so the user
 * stays inside the loyalty admin and the existing Billing.tsx Checkout
 * flow handles plan-change.
 *
 * Two trigger paths converge here:
 *   1. Server-side 402 from a feature-gated route (Planner/Brands/Admin
 *      AI). The interceptor dispatches with `{feature, plan, upgradeUrl,
 *      message}`.
 *   2. Client-side dispatch from `Layout.tsx` when a user clicks a
 *      visibly-locked sidebar item (greyed, lock icon). Same event shape
 *      so the modal doesn't care about origin.
 *
 * 1.5s same-feature throttle de-dupes when a page fans out parallel
 * requests that all 402. Without it the modal would re-open repeatedly.
 */

const FRIENDLY_LABELS: Record<string, { title: string; blurb: string }> = {
  time_management: {
    title: 'Time Management Platform',
    blurb: 'Drag-drop staff scheduling, backlog + recurring tasks, auto-plan, team kanban, and full Planner toolkit.',
  },
  admin_ai: {
    title: 'Staff AI Copilot',
    blurb: 'Anthropic Claude with 35+ CRM tools — answers, navigates and acts on your behalf inside the admin console.',
  },
  brands: {
    title: 'Multi-Brand Portfolios',
    blurb: 'Run multiple brands inside one organization, each with its own chatbot, knowledge base, booking engine and theme.',
  },
}

interface LockedDetail {
  feature: string | null
  plan: string | null
  upgradeUrl: string | null
  message: string
}

export default function UpgradeFeatureModal() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState<LockedDetail | null>(null)

  useEffect(() => {
    let lastFeature = ''
    let lastAt = 0
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail as LockedDetail | undefined
      if (!d) return
      const now = Date.now()
      // Same-feature throttle. Different features (rare but possible
      // during a page fan-out) get their own modal opens.
      if (d.feature && d.feature === lastFeature && now - lastAt < 1500) return
      lastFeature = d.feature ?? ''
      lastAt = now
      setDetail(d)
      setOpen(true)
    }
    window.addEventListener('feature:locked', handler)
    return () => window.removeEventListener('feature:locked', handler)
  }, [])

  if (!open || !detail) return null

  const key = detail.feature ?? ''
  const friendly = FRIENDLY_LABELS[key]
  // Fall back to the canonical label from planFeatures.ts if we don't
  // have a curated friendly entry (e.g. ai_insights, custom_branding —
  // future expansion).
  const surfaceLabel = ALL_FEATURES.find(f => f.key === key)?.label
  const title = friendly?.title ?? surfaceLabel ?? 'Premium Feature'
  const blurb = friendly?.blurb ?? detail.message
  // Available on which plan? Find the cheapest plan that includes it.
  // PLAN_FEATURES values are `string | boolean`; truthy ones (any
  // non-empty string OR boolean true) count as included.
  const includedOn = (() => {
    if (!key) return null
    for (const slug of ['growth', 'enterprise'] as const) {
      const v = PLAN_FEATURES[slug]?.[key]
      if (v && v !== '' && v !== 'false') return slug
    }
    return null
  })()
  const includedLabel = includedOn ? includedOn.charAt(0).toUpperCase() + includedOn.slice(1) : 'Enterprise'

  const handleUpgrade = () => {
    setOpen(false)
    // Prefer in-SPA navigation to the admin's own Billing page. The
    // server-supplied `upgrade_url` points at the SaaS dashboard which
    // makes the user leave the loyalty admin — bad conversion path.
    // Billing.tsx already handles the SaaS Stripe Checkout return-trip
    // via /v1/auth/billing/refresh on `?success=1`.
    navigate('/billing')
  }

  const handleDismiss = () => setOpen(false)

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={handleDismiss}
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-modal-title"
    >
      <div
        className="relative w-full max-w-md bg-dark-surface border border-dark-border rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Gold accent bar at the top */}
        <div className="h-1 bg-gradient-to-r from-primary-gold/60 via-primary-gold to-primary-gold/60" />

        <button
          onClick={handleDismiss}
          aria-label="Close"
          className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-t-secondary hover:text-white hover:bg-white/[0.06] transition-colors"
        >
          <X size={18} />
        </button>

        <div className="p-7">
          {/* Header — lock icon + plan badge */}
          <div className="flex items-center gap-3 mb-5">
            <div className="w-12 h-12 rounded-xl bg-primary-gold/15 border border-primary-gold/30 flex items-center justify-center">
              <Lock size={22} className="text-primary-gold" />
            </div>
            <div className="flex flex-col">
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-primary-gold/15 border border-primary-gold/30 rounded-full text-[10px] font-bold uppercase tracking-[0.08em] text-primary-gold w-fit">
                <Sparkles size={10} />
                Available on {includedLabel}
              </div>
              <span className="text-[11px] text-t-secondary mt-1">
                Your plan: <span className="text-t-primary font-medium">{detail.plan ?? 'Current'}</span>
              </span>
            </div>
          </div>

          {/* Title */}
          <h2 id="upgrade-modal-title" className="text-xl font-bold text-white mb-2.5">
            {title}
          </h2>

          {/* Blurb */}
          <p className="text-[13.5px] text-t-secondary leading-relaxed mb-6">
            {blurb}
          </p>

          {/* CTA row */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleUpgrade}
              className="flex-1 bg-primary-gold hover:bg-primary-gold/90 text-black font-bold py-2.5 rounded-lg transition-colors text-sm shadow-lg shadow-primary-gold/20"
            >
              Upgrade plan
            </button>
            <button
              onClick={handleDismiss}
              className="px-4 py-2.5 text-t-secondary hover:text-white text-sm font-medium transition-colors"
            >
              Not now
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
