import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Lock, Sparkles, X } from 'lucide-react'
import { ALL_FEATURES, PLAN_DISPLAY_ORDER, PLAN_FEATURES } from '../lib/planFeatures'

/**
 * Listens for `feature:locked` events from the api.ts axios interceptor
 * (fired on every 402 + `code: 'feature_locked'` response) AND from the
 * Layout sidebar locked-item click handler. One render path covers both.
 *
 * Shape: locked feature pulled from event detail → friendly label and
 * blurb resolved against the shared `planFeatures.ts` taxonomy → primary
 * CTA routes to /billing in-SPA (no external SaaS URL) so the user
 * stays inside the loyalty admin and the existing Billing.tsx Checkout
 * flow handles plan-change.
 *
 * 1.5s same-feature throttle de-dupes when a page fans out parallel
 * requests that all 402. While the modal is OPEN, ALL subsequent
 * events are suppressed (any feature) — otherwise a second-locked
 * feature would swap the visible content mid-interaction.
 *
 * Accessibility: Esc closes, focus moves into the modal on open,
 * focus returns to the previously-focused element on close.
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
  // Legacy / surrounding features that may also dispatch feature:locked
  // events through this same modal (e.g. AI Insights item still gates
  // on the legacy `ai_insights` key). Curated friendly copy keeps these
  // upgrade prompts informative instead of falling through to a generic
  // "Premium Feature" placeholder.
  ai_insights: {
    title: 'AI Insights & Analytics',
    blurb: 'AI-generated weekly reports, churn predictions, upsell suggestions and sentiment analysis across your CRM data.',
  },
  analytics: {
    title: 'Analytics & AI insights',
    blurb: 'Revenue, bookings, repeat-customer charts and AI-generated weekly insight reports.',
  },
  chatbot: {
    title: 'Website chatbot (AI)',
    blurb: 'Embed an AI chatbot on your website that answers questions, qualifies leads and captures bookings 24/7.',
  },
  engagement: {
    title: 'Live chat inbox & lead tracking',
    blurb: 'Unified live-chat inbox, hot-lead detection, daily summary email and a fullscreen monitor view.',
  },
  campaigns: {
    title: 'Email campaigns',
    blurb: 'Block-builder email campaigns with variable substitution, send history and per-campaign analytics.',
  },
  reviews: {
    title: 'Reviews & feedback',
    blurb: 'Post-stay review forms, submission tracking and an aggregated feedback dashboard.',
  },
  wallet: {
    title: 'Digital wallet cards',
    blurb: 'Apple Wallet (.pkpass) + Google Wallet member loyalty cards with auto-regenerated tier and points updates.',
  },
  mobile: {
    title: 'Member mobile app + push',
    blurb: 'iOS and Android member apps with push notifications, points balance, offers and a digital loyalty card.',
  },
  api: {
    title: 'API access & integrations',
    blurb: 'Personal access tokens for the lead-intake API, webhooks and 3rd-party integrations (Zapier-style).',
  },
  sla: {
    title: 'Uptime SLA',
    blurb: '99.9% uptime SLA with priority support and proactive incident notification.',
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
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [detail, setDetail] = useState<LockedDetail | null>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)
  const upgradeBtnRef = useRef<HTMLButtonElement | null>(null)
  // Ref-backed throttle state so the open/close handlers can read it
  // without forcing a re-render and without stale-closure traps.
  const throttleRef = useRef<{ lastFeature: string; lastAt: number; openNow: boolean }>({
    lastFeature: '',
    lastAt: 0,
    openNow: false,
  })

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail as LockedDetail | undefined
      if (!d) return
      // If the modal is already open, ignore further events. A second
      // feature firing mid-interaction would otherwise swap visible
      // content with no transition, confusing the user about which
      // feature triggered the prompt.
      if (throttleRef.current.openNow) return
      const now = Date.now()
      // Same-feature throttle: a page fan-out that produces parallel
      // 402s for the same key shouldn't reopen the modal in a loop.
      if (d.feature && d.feature === throttleRef.current.lastFeature && now - throttleRef.current.lastAt < 1500) return
      throttleRef.current.lastFeature = d.feature ?? ''
      throttleRef.current.lastAt = now
      throttleRef.current.openNow = true
      // Capture trigger element so focus can return on close.
      previouslyFocusedRef.current = (document.activeElement as HTMLElement) ?? null
      setDetail(d)
      setOpen(true)
    }
    window.addEventListener('feature:locked', handler)
    return () => window.removeEventListener('feature:locked', handler)
  }, [])

  // Move focus into the modal on open + handle Esc dismissal.
  useEffect(() => {
    if (!open) return
    // Move focus to the primary action so keyboard users can Enter
    // straight to upgrade or Shift+Tab to the dismiss buttons.
    const focusTimer = window.setTimeout(() => upgradeBtnRef.current?.focus(), 0)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        handleDismiss()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(focusTimer)
      window.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open || !detail) return null

  const key = detail.feature ?? ''
  const friendly = FRIENDLY_LABELS[key]
  // Fall back to the canonical label from planFeatures.ts when we
  // don't have a curated friendly entry (future expansion).
  const surfaceLabel = ALL_FEATURES.find(f => f.key === key)?.label
  const title = friendly?.title ?? surfaceLabel ?? 'Premium Feature'
  const blurb = friendly?.blurb ?? detail.message
  // Iterate the FULL plan order from cheapest → most expensive and
  // pick the first plan that includes the feature. This handles
  // future features that may be Starter-included or Growth-included
  // instead of always assuming Enterprise.
  const includedOn = (() => {
    if (!key) return null
    for (const slug of PLAN_DISPLAY_ORDER) {
      const v = PLAN_FEATURES[slug]?.[key]
      // Truthy boolean OR non-empty string === included. The shape
      // is `string | boolean` per planFeatures.ts.
      if (v === true) return slug
      if (typeof v === 'string' && v.length > 0) return slug
    }
    return null
  })()
  // When the feature is missing from every plan map (defensive — a
  // typo or a legacy key not yet migrated), surface a neutral
  // fallback instead of mislabelling as Enterprise.
  const includedLabel = includedOn
    ? includedOn.charAt(0).toUpperCase() + includedOn.slice(1)
    : 'a higher plan'

  const handleDismiss = () => {
    setOpen(false)
    throttleRef.current.openNow = false
    // Return focus to whatever triggered the modal — the locked
    // sidebar button or the form control that produced the 402.
    window.setTimeout(() => previouslyFocusedRef.current?.focus?.(), 0)
  }

  const handleUpgrade = () => {
    setOpen(false)
    throttleRef.current.openNow = false
    // If the user is already on /billing — clicked a locked feature
    // from there or arrived via a previous Upgrade click — react-
    // router's navigate('/billing') is a no-op and the modal
    // dismissal appears to do nothing. Scroll to the plans area
    // instead so the user sees the comparison.
    if (location.pathname === '/billing') {
      window.setTimeout(() => {
        const target = document.getElementById('plan-comparison')
          ?? document.querySelector('[data-billing-plans]')
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' })
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }
      }, 0)
      return
    }
    navigate('/billing')
  }

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={handleDismiss}
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-modal-title"
      aria-describedby="upgrade-modal-blurb"
    >
      <div
        className="relative w-full max-w-md bg-dark-surface border border-dark-border rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Gold accent bar at the top */}
        <div className="h-1 bg-gradient-to-r from-primary-gold/60 via-primary-gold to-primary-gold/60" aria-hidden="true" />

        <button
          onClick={handleDismiss}
          aria-label="Close upgrade prompt"
          type="button"
          className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-t-secondary hover:text-white hover:bg-white/[0.06] transition-colors"
        >
          <X size={18} aria-hidden="true" />
        </button>

        <div className="p-5 sm:p-7 pr-10 sm:pr-12">
          {/* Header — lock icon + plan badge */}
          <div className="flex items-center gap-3 mb-5">
            <div className="w-12 h-12 rounded-xl bg-primary-gold/15 border border-primary-gold/30 flex items-center justify-center flex-shrink-0">
              <Lock size={22} className="text-primary-gold" aria-hidden="true" />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-primary-gold/15 border border-primary-gold/30 rounded-full text-[10px] font-bold uppercase tracking-[0.08em] text-primary-gold w-fit">
                <Sparkles size={10} aria-hidden="true" />
                Available on {includedLabel}
              </div>
              {detail.plan && (
                <span className="text-[11px] text-t-secondary mt-1 truncate">
                  Your plan: <span className="text-t-primary font-medium">{detail.plan}</span>
                </span>
              )}
            </div>
          </div>

          {/* Title */}
          <h2 id="upgrade-modal-title" className="text-xl font-bold text-white mb-2.5">
            {title}
          </h2>

          {/* Blurb */}
          <p id="upgrade-modal-blurb" className="text-[13.5px] text-t-secondary leading-relaxed mb-6">
            {blurb}
          </p>

          {/* CTA row — stacks on mobile so neither button gets crushed */}
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center gap-2.5">
            <button
              onClick={handleDismiss}
              type="button"
              className="px-4 py-2.5 text-t-secondary hover:text-white text-sm font-medium transition-colors sm:flex-shrink-0"
            >
              Not now
            </button>
            <button
              ref={upgradeBtnRef}
              onClick={handleUpgrade}
              type="button"
              className="flex-1 bg-primary-gold hover:bg-primary-gold/90 text-black font-bold py-2.5 rounded-lg transition-colors text-sm shadow-lg shadow-primary-gold/20"
            >
              Upgrade plan
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
