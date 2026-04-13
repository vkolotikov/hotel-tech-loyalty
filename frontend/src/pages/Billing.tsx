import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CreditCard, Check, ArrowRight, X,
  AlertTriangle, Crown, Loader2, Zap, ExternalLink,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { api } from '../lib/api'
import { useSubscription } from '../hooks/useSubscription'

interface PlanData {
  id: string; name: string; slug: string; description: string
  monthlyAmount: number; yearlyAmount: number; currency: string; trialDays: number
}

// All possible features across all plans — each plan marks which are included
const ALL_FEATURES = [
  { key: 'crm', label: 'Guest CRM' },
  { key: 'loyalty', label: 'Loyalty program' },
  { key: 'booking', label: 'Booking engine' },
  { key: 'chatbot', label: 'AI chatbot for website' },
  { key: 'properties', label: 'Multi-property support' },
  { key: 'analytics', label: 'Advanced analytics & AI insights' },
  { key: 'nfc', label: 'NFC member cards' },
  { key: 'api', label: 'API access & integrations' },
  { key: 'branding', label: 'White-label branding' },
  { key: 'support', label: 'Priority support' },
  { key: 'sla', label: 'SLA guarantee (99.9%)' },
  { key: 'onboarding', label: 'Dedicated onboarding' },
] as const

const PLAN_FEATURES: Record<string, Record<string, string | boolean>> = {
  starter: {
    crm: 'Up to 500 profiles',
    loyalty: 'Basic (1 tier)',
    booking: false,
    chatbot: false,
    properties: 'Single property',
    analytics: false,
    nfc: false,
    api: false,
    branding: false,
    support: 'Email support',
    sla: false,
    onboarding: false,
  },
  growth: {
    crm: 'Unlimited profiles',
    loyalty: 'Up to 5 tiers',
    booking: 'With online payments',
    chatbot: true,
    properties: 'Up to 3 properties',
    analytics: true,
    nfc: true,
    api: false,
    branding: false,
    support: 'Email & chat',
    sla: false,
    onboarding: false,
  },
  enterprise: {
    crm: 'Unlimited profiles',
    loyalty: 'Custom tiers & rules',
    booking: 'With online payments',
    chatbot: true,
    properties: 'Unlimited',
    analytics: true,
    nfc: true,
    api: true,
    branding: true,
    support: 'Dedicated manager',
    sla: true,
    onboarding: true,
  },
}

const FALLBACK_PLANS: PlanData[] = [
  { id: 'starter', name: 'Starter', slug: 'starter', description: 'Perfect for small hotels getting started.', monthlyAmount: 2900, yearlyAmount: 29000, currency: 'eur', trialDays: 7 },
  { id: 'growth', name: 'Growth', slug: 'growth', description: 'For growing hotels that need loyalty, bookings, and AI.', monthlyAmount: 7900, yearlyAmount: 79000, currency: 'eur', trialDays: 14 },
  { id: 'enterprise', name: 'Enterprise', slug: 'enterprise', description: 'Full-featured solution for hotel groups and chains.', monthlyAmount: 19900, yearlyAmount: 199000, currency: 'eur', trialDays: 14 },
]

type BillingInterval = 'monthly' | 'yearly'

export function Billing() {
  const { data: sub, status } = useSubscription()
  const isSuperAdmin = !!(sub as any)?.isSuperAdmin
  const queryClient = useQueryClient()
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly')
  const [plans, setPlans] = useState<PlanData[]>(FALLBACK_PLANS)
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null)
  const [activateLoading, setActivateLoading] = useState(false)
  const [portalLoading, setPortalLoading] = useState(false)

  // Fetch live plans from SaaS
  const { data: plansData } = useQuery({
    queryKey: ['billing-plans'],
    queryFn: () => api.get('/v1/plans').then(r => r.data),
    staleTime: 10 * 60 * 1000,
    retry: false,
  })

  useEffect(() => {
    if (plansData?.plans?.length) setPlans(plansData.plans)
  }, [plansData])

  // Check URL for checkout result
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('success') === '1') {
      toast.success('Payment successful! Your subscription is now active.')
      queryClient.invalidateQueries({ queryKey: ['subscription-status'] })
      window.history.replaceState({}, '', window.location.pathname)
    } else if (params.get('canceled') === '1') {
      toast('Checkout was canceled. No charges were made.')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [queryClient])

  // Switch plan / start trial — backend auto-registers on SaaS if needed
  const handleCheckout = async (planSlug: string) => {
    setCheckoutLoading(planSlug)
    try {
      const { data } = await api.post('/v1/auth/billing/checkout', {
        plan_slug: planSlug,
        interval: billingInterval === 'yearly' ? 'YEARLY' : 'MONTHLY',
      })

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl
        return
      }

      if (data.success) {
        toast.success('Plan updated!')
        queryClient.invalidateQueries({ queryKey: ['subscription-status'] })
      }
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Checkout failed. Please try again.'
      // If SaaS connection failed, fall back to local trial
      if (err.response?.status === 422 || err.response?.status === 503) {
        try {
          const { data } = await api.post('/v1/auth/billing/start-trial', { plan_slug: planSlug })
          toast.success(data.message || 'Free trial started!')
          queryClient.invalidateQueries({ queryKey: ['subscription-status'] })
          return
        } catch { /* ignore fallback error */ }
      }
      toast.error(msg)
    } finally {
      setCheckoutLoading(null)
    }
  }

  // Activate subscription — convert trial to paid via Stripe (backend auto-registers on SaaS)
  const handleActivate = async (planSlug?: string) => {
    setActivateLoading(true)
    try {
      const { data } = await api.post('/v1/auth/billing/activate', {
        interval: billingInterval === 'yearly' ? 'YEARLY' : 'MONTHLY',
        plan_slug: planSlug || sub?.plan?.slug || undefined,
      })

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl
        return
      }

      if (data.success) {
        toast.success('Subscription activated!')
        queryClient.invalidateQueries({ queryKey: ['subscription-status'] })
      }
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Activation failed. Please try again.'
      toast.error(msg)
    } finally {
      setActivateLoading(false)
    }
  }

  const handlePortal = async () => {
    setPortalLoading(true)
    try {
      const { data } = await api.post('/v1/auth/billing/portal')
      if (data.portalUrl) {
        window.location.href = data.portalUrl
        return
      }
      toast.error('Billing portal is not available')
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Could not open billing portal')
    } finally {
      setPortalLoading(false)
    }
  }

  const formatPrice = (cents: number, currency: string) => {
    const symbol = currency === 'eur' ? '\u20AC' : currency === 'gbp' ? '\u00A3' : '$'
    return symbol + (cents / 100).toLocaleString()
  }

  const getPlanPrice = (plan: PlanData) => {
    if (billingInterval === 'yearly') return formatPrice(Math.round(plan.yearlyAmount / 12), plan.currency)
    return formatPrice(plan.monthlyAmount, plan.currency)
  }

  const getYearlySaving = (plan: PlanData) => {
    const monthly = plan.monthlyAmount * 12
    if (plan.yearlyAmount >= monthly) return 0
    return Math.round(((monthly - plan.yearlyAmount) / monthly) * 100)
  }

  const trialEnd = sub?.trialEnd ? new Date(sub.trialEnd) : null
  const periodEnd = sub?.periodEnd ? new Date(sub.periodEnd) : null
  const daysLeft = trialEnd ? Math.max(0, Math.ceil((trialEnd.getTime() - Date.now()) / 86400000)) : null
  const currentSlug = sub?.plan?.slug ?? null
  const isLocal = status === 'LOCAL'
  const isNoPlan = status === 'NO_PLAN' || status === 'EXPIRED'
  const isLoadingSub = status === 'LOADING'

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Billing & Subscription</h1>
          <p className="text-sm text-t-secondary mt-0.5">Manage your plan, view trial status, and upgrade</p>
        </div>
      </div>

      {/* Trial countdown banner */}
      {status === 'TRIALING' && daysLeft !== null && (
        <div className={
          'rounded-xl border p-5 flex items-center gap-4 ' +
          (daysLeft <= 2 ? 'border-orange-500/30 bg-orange-500/5' : 'border-primary-500/20 bg-primary-500/5')
        }>
          <div className={
            'w-14 h-14 rounded-xl flex flex-col items-center justify-center shrink-0 ' +
            (daysLeft <= 2 ? 'bg-orange-500/15' : 'bg-primary-500/15')
          }>
            <span className={'text-xl font-bold leading-none ' + (daysLeft <= 2 ? 'text-orange-400' : 'text-primary-400')}>{daysLeft}</span>
            <span className={'text-[9px] uppercase font-semibold tracking-wider ' + (daysLeft <= 2 ? 'text-orange-400/70' : 'text-primary-400/70')}>
              {daysLeft === 1 ? 'day' : 'days'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className={'text-sm font-semibold ' + (daysLeft <= 2 ? 'text-orange-300' : 'text-primary-300')}>
              {daysLeft === 0 ? 'Your trial expires today' : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left in your free trial`}
            </p>
            <p className="text-xs text-t-secondary mt-0.5">
              {sub?.plan?.name && <>On the <strong className="text-white">{sub.plan.name}</strong> plan &middot; </>}
              {trialEnd && <>Expires {trialEnd.toLocaleDateString()}</>}
            </p>
          </div>
          <button
            onClick={() => handleActivate()}
            disabled={activateLoading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 shrink-0"
          >
            {activateLoading ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />}
            Subscribe Now
          </button>
        </div>
      )}

      {/* Current Plan Card */}
      <div className="rounded-xl border border-dark-border bg-dark-surface p-5">
        <h2 className="text-sm font-semibold text-t-secondary uppercase tracking-wider mb-4">Current Plan</h2>

        {isLoadingSub ? (
          <div className="flex items-center justify-center gap-3 p-6">
            <Loader2 size={20} className="animate-spin text-primary-400" />
            <span className="text-sm text-t-secondary">Loading subscription info...</span>
          </div>
        ) : isSuperAdmin ? (
          <div className="flex items-center gap-3 p-4 bg-green-500/5 border border-green-500/20 rounded-lg">
            <Crown size={20} className="text-green-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-green-300">Super Admin — Full Access</p>
              <p className="text-xs text-t-secondary mt-0.5">All features are unlocked. No subscription required for the admin account.</p>
            </div>
          </div>
        ) : isLocal ? (
          <div className="flex items-center gap-3 p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
            <AlertTriangle size={20} className="text-yellow-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-yellow-300">Local / Development Mode</p>
              <p className="text-xs text-t-secondary mt-0.5">All features are unlocked. Subscription data is not available in this environment.</p>
            </div>
          </div>
        ) : isNoPlan ? (
          <div className={`flex items-center gap-4 p-5 rounded-lg border ${
            status === 'EXPIRED'
              ? 'bg-orange-500/5 border-orange-500/20'
              : 'bg-primary-500/5 border-primary-500/20'
          }`}>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
              status === 'EXPIRED' ? 'bg-orange-500/15' : 'bg-primary-500/15'
            }`}>
              {status === 'EXPIRED'
                ? <AlertTriangle size={22} className="text-orange-400" />
                : <Crown size={22} className="text-primary-400" />}
            </div>
            <div className="flex-1">
              <p className={`text-sm font-semibold ${status === 'EXPIRED' ? 'text-orange-300' : 'text-primary-300'}`}>
                {status === 'EXPIRED' ? 'Your Trial Has Expired' : 'Get Started with a Free Trial'}
              </p>
              <p className="text-xs text-t-secondary mt-0.5">
                {status === 'EXPIRED'
                  ? 'Your free trial has ended. Choose a plan below to continue using the platform.'
                  : 'Choose a plan below to start your free trial. No credit card required — explore all features risk-free.'}
              </p>
            </div>
            <Zap size={18} className={`shrink-0 animate-pulse ${status === 'EXPIRED' ? 'text-orange-400' : 'text-primary-400'}`} />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Plan name + status badge */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary-500/10 flex items-center justify-center">
                <Crown size={20} className="text-primary-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-white">{sub?.plan?.name ?? 'No Plan'}</span>
                  <span className={
                    'text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ' +
                    (status === 'TRIALING' ? 'bg-primary-500/20 text-primary-300' :
                     status === 'ACTIVE' ? 'bg-green-500/20 text-green-300' :
                     'bg-red-500/20 text-red-300')
                  }>
                    {status === 'TRIALING' ? 'Free Trial' : status === 'ACTIVE' ? 'Active' : 'Expired'}
                  </span>
                </div>
                {status === 'TRIALING' && daysLeft !== null && (
                  <p className="text-xs text-t-secondary">
                    {daysLeft} day{daysLeft === 1 ? '' : 's'} remaining
                    {trialEnd && <> &middot; ends {trialEnd.toLocaleDateString()}</>}
                  </p>
                )}
                {status === 'ACTIVE' && periodEnd && (
                  <p className="text-xs text-t-secondary">Renews {periodEnd.toLocaleDateString()}</p>
                )}
                {status === 'EXPIRED' && (
                  <p className="text-xs text-red-400">Your subscription has expired. Subscribe to restore access.</p>
                )}
              </div>
            </div>

            {/* Trial progress bar */}
            {status === 'TRIALING' && trialEnd && (
              <div>
                <div className="flex justify-between text-[10px] text-t-secondary mb-1">
                  <span>Trial started</span>
                  <span>{trialEnd.toLocaleDateString()}</span>
                </div>
                <div className="h-1.5 bg-dark-surface3 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-500 rounded-full transition-all"
                    style={{ width: `${Math.max(5, Math.min(100, daysLeft !== null ? 100 - (daysLeft / 14) * 100 : 0))}%` }}
                  />
                </div>
              </div>
            )}

            {/* Quick actions */}
            <div className="flex flex-col gap-3 pt-1">
              <div className="flex gap-3">
                {(status === 'TRIALING' || status === 'EXPIRED') && (
                  <button
                    onClick={() => handleActivate()}
                    disabled={activateLoading}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                  >
                    {activateLoading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                    {status === 'TRIALING' ? 'Subscribe — Add Payment Method' : 'Reactivate Subscription'}
                  </button>
                )}
                {status === 'ACTIVE' && (
                  <button
                    onClick={handlePortal}
                    disabled={portalLoading}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-dark-surface2 hover:bg-dark-surface3 text-white text-sm font-medium rounded-lg border border-dark-border transition-colors disabled:opacity-50"
                  >
                    {portalLoading ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
                    Manage Billing
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Included Features */}
      {!isLocal && currentSlug && PLAN_FEATURES[currentSlug] && (
        <div className="rounded-xl border border-dark-border bg-dark-surface p-5">
          <h2 className="text-sm font-semibold text-t-secondary uppercase tracking-wider mb-3">What's Included</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ALL_FEATURES.map((f) => {
              const val = PLAN_FEATURES[currentSlug]?.[f.key]
              const included = val !== false
              const detail = typeof val === 'string' ? val : null
              if (!included) return null
              return (
                <div key={f.key} className="flex items-start gap-2 text-sm">
                  <Check size={14} className="text-green-400 shrink-0 mt-0.5" />
                  <span className="text-gray-300">{f.label}{detail ? ` — ${detail}` : ''}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Plans Comparison — hide for super admin */}
      {!isSuperAdmin && <div className="rounded-xl border border-dark-border bg-dark-surface p-5">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold text-t-secondary uppercase tracking-wider">
            {currentSlug ? 'Compare Plans' : 'Available Plans'}
          </h2>
          <div className="flex items-center gap-2">
            <span className={'text-xs font-medium ' + (billingInterval === 'monthly' ? 'text-white' : 'text-t-secondary')}>Monthly</span>
            <button
              onClick={() => setBillingInterval(b => b === 'monthly' ? 'yearly' : 'monthly')}
              className={'relative w-10 h-5 rounded-full transition-colors ' + (billingInterval === 'yearly' ? 'bg-primary-600' : 'bg-dark-surface3')}
            >
              <div className={'absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ' + (billingInterval === 'yearly' ? 'translate-x-5' : 'translate-x-0.5')} />
            </button>
            <span className={'text-xs font-medium ' + (billingInterval === 'yearly' ? 'text-white' : 'text-t-secondary')}>
              Yearly <span className="text-green-400 text-[10px]">Save ~17%</span>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map((plan) => {
            const isCurrent = currentSlug === plan.slug && !isNoPlan
            const isPopular = plan.slug === 'growth'
            const features = PLAN_FEATURES[plan.slug] || {}
            const saving = getYearlySaving(plan)
            const isLoading = checkoutLoading === plan.slug

            return (
              <div key={plan.id} className={
                'rounded-xl border p-5 relative flex flex-col ' +
                (isCurrent ? 'border-green-500/50 bg-green-500/[0.03] ring-1 ring-green-500/20' :
                 isPopular ? 'border-primary-500/50 bg-primary-500/[0.03]' :
                 'border-dark-border bg-dark-surface2')
              }>
                {isCurrent && (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-green-500 text-black text-[9px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                    Current Plan
                  </div>
                )}
                {!isCurrent && isPopular && (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-primary-500 text-black text-[9px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                    Most Popular
                  </div>
                )}

                <h3 className="text-white font-bold text-base">{plan.name}</h3>
                <div className="mt-2 mb-0.5">
                  <span className="text-2xl font-bold text-white">{getPlanPrice(plan)}</span>
                  <span className="text-t-secondary text-xs">/mo{billingInterval === 'yearly' ? ' (billed yearly)' : ''}</span>
                </div>
                {billingInterval === 'yearly' && saving > 0 && (
                  <p className="text-green-400 text-[11px] font-medium mb-1">Save {saving}% vs monthly</p>
                )}
                <p className="text-t-secondary text-xs mb-4">{plan.description}</p>

                <div className="space-y-1.5 mb-4 flex-1">
                  {ALL_FEATURES.map((f) => {
                    const val = features[f.key]
                    const included = val !== false
                    const detail = typeof val === 'string' ? val : null
                    return (
                      <div key={f.key} className={'flex items-start gap-2 text-xs ' + (!included ? 'opacity-40' : '')}>
                        {included
                          ? <Check size={11} className="text-green-400 shrink-0 mt-0.5" />
                          : <X size={11} className="text-gray-500 shrink-0 mt-0.5" />}
                        <span className={included ? 'text-gray-300' : 'text-gray-500 line-through'}>
                          {f.label}{detail ? ` — ${detail}` : ''}
                        </span>
                      </div>
                    )
                  })}
                </div>

                <div className="text-[11px] text-t-secondary mb-3 text-center">{plan.trialDays}-day free trial included</div>

                {isCurrent ? (
                  status === 'TRIALING' ? (
                    <button
                      onClick={() => handleActivate(plan.slug)}
                      disabled={activateLoading}
                      className="w-full py-2 rounded-lg text-center text-xs font-medium bg-primary-600 hover:bg-primary-500 text-white transition-colors mt-auto inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      {activateLoading ? <Loader2 size={12} className="animate-spin" /> : <Zap size={12} />}
                      Subscribe Now
                    </button>
                  ) : (
                    <div className="w-full py-2 rounded-lg text-center text-xs font-medium text-green-400 bg-green-500/10 border border-green-500/20 mt-auto">
                      Your current plan
                    </div>
                  )
                ) : (
                  <button
                    onClick={() => handleCheckout(plan.slug)}
                    disabled={!!checkoutLoading}
                    className={
                      'w-full py-2 rounded-lg text-center text-xs font-medium transition-colors mt-auto inline-flex items-center justify-center gap-1.5 disabled:opacity-50 ' +
                      (isPopular
                        ? 'bg-primary-600 hover:bg-primary-500 text-white'
                        : 'bg-dark-surface3 hover:bg-dark-surface2 text-white border border-dark-border')
                    }
                  >
                    {isLoading ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <>
                        {currentSlug && !isNoPlan ? 'Switch Plan' : 'Start Free Trial'}
                        <ArrowRight size={12} />
                      </>
                    )}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>}
    </div>
  )
}
