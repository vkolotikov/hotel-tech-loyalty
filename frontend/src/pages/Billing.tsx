import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  CreditCard, Check, ArrowRight,
  ExternalLink, AlertTriangle, Crown,
} from 'lucide-react'
import { api } from '../lib/api'
import { useSubscription } from '../hooks/useSubscription'

interface PlanData {
  id: string; name: string; slug: string; description: string
  monthlyAmount: number; yearlyAmount: number; currency: string; trialDays: number
}

const PLAN_BULLETS: Record<string, string[]> = {
  starter: [
    'Guest CRM — up to 500 profiles',
    'Basic loyalty program (1 tier)',
    'Email support',
    'Single property',
    'Basic analytics dashboard',
    'Manual booking management',
  ],
  growth: [
    'Guest CRM — unlimited profiles',
    'Full loyalty program (up to 5 tiers)',
    'Booking engine with online payments',
    'AI-powered chatbot for your website',
    'Multi-property support (up to 3)',
    'Advanced analytics & AI insights',
    'Priority email & chat support',
    'NFC member cards',
  ],
  enterprise: [
    'Everything in Growth, plus:',
    'Unlimited properties',
    'Custom loyalty tiers & rules',
    'Dedicated account manager',
    'API access & custom integrations',
    'White-label branding',
    'SLA guarantee (99.9% uptime)',
    'Staff training & onboarding',
  ],
}

const FALLBACK_PLANS: PlanData[] = [
  { id: 'starter', name: 'Starter', slug: 'starter', description: 'Perfect for small hotels getting started.', monthlyAmount: 2900, yearlyAmount: 29000, currency: 'eur', trialDays: 7 },
  { id: 'growth', name: 'Growth', slug: 'growth', description: 'For growing hotels that need loyalty, bookings, and AI.', monthlyAmount: 7900, yearlyAmount: 79000, currency: 'eur', trialDays: 14 },
  { id: 'enterprise', name: 'Enterprise', slug: 'enterprise', description: 'Full-featured solution for hotel groups and chains.', monthlyAmount: 19900, yearlyAmount: 199000, currency: 'eur', trialDays: 14 },
]

type BillingInterval = 'monthly' | 'yearly'

export function Billing() {
  const { data: sub, status } = useSubscription()
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly')
  const [plans, setPlans] = useState<PlanData[]>(FALLBACK_PLANS)

  // Fetch live plans
  const { data: plansData } = useQuery({
    queryKey: ['billing-plans'],
    queryFn: () => api.get('/v1/plans').then(r => r.data),
    staleTime: 10 * 60 * 1000,
    retry: false,
  })

  useEffect(() => {
    if (plansData?.plans?.length) setPlans(plansData.plans)
  }, [plansData])

  const formatPrice = (cents: number, currency: string) => {
    const symbol = currency === 'eur' ? '\u20AC' : '$'
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

  const saasUrl = 'https://saas.hotel-tech.ai/admin/subscription'

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Billing & Subscription</h1>
          <p className="text-sm text-t-secondary mt-0.5">Manage your plan, view trial status, and upgrade</p>
        </div>
      </div>

      {/* Current Plan Card */}
      <div className="rounded-xl border border-dark-border bg-dark-surface p-5">
        <h2 className="text-sm font-semibold text-t-secondary uppercase tracking-wider mb-4">Current Plan</h2>

        {isLocal ? (
          <div className="flex items-center gap-3 p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-lg">
            <AlertTriangle size={20} className="text-yellow-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-yellow-300">Local / Development Mode</p>
              <p className="text-xs text-t-secondary mt-0.5">All features are unlocked. Subscription data is not available in this environment.</p>
            </div>
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
                    {status === 'TRIALING' ? 'Trial' : status === 'ACTIVE' ? 'Active' : 'Expired'}
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
                  <p className="text-xs text-red-400">Your subscription has expired. Upgrade to restore access.</p>
                )}
              </div>
            </div>

            {/* Trial progress bar */}
            {status === 'TRIALING' && trialEnd && sub?.trialEnd && (
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
            <div className="flex gap-3 pt-1">
              {(status === 'TRIALING' || status === 'EXPIRED') && (
                <a href={saasUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors">
                  <CreditCard size={14} />
                  {status === 'TRIALING' ? 'Add Payment Method' : 'Reactivate Subscription'}
                </a>
              )}
              <a href={saasUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-dark-surface2 hover:bg-dark-surface3 text-white text-sm font-medium rounded-lg border border-dark-border transition-colors">
                <ExternalLink size={14} />
                Manage on SaaS Portal
              </a>
            </div>
          </div>
        )}
      </div>

      {/* Included Features */}
      {!isLocal && currentSlug && PLAN_BULLETS[currentSlug] && (
        <div className="rounded-xl border border-dark-border bg-dark-surface p-5">
          <h2 className="text-sm font-semibold text-t-secondary uppercase tracking-wider mb-3">What's Included</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {PLAN_BULLETS[currentSlug].map((bullet, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <Check size={14} className="text-green-400 shrink-0 mt-0.5" />
                <span className="text-gray-300">{bullet}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Plans Comparison */}
      <div className="rounded-xl border border-dark-border bg-dark-surface p-5">
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
            const isCurrent = currentSlug === plan.slug
            const isPopular = plan.slug === 'growth'
            const bullets = PLAN_BULLETS[plan.slug] || []
            const saving = getYearlySaving(plan)

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

                {bullets.length > 0 && (
                  <div className="space-y-1.5 mb-4 flex-1">
                    {bullets.map((b, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <Check size={11} className="text-green-400 shrink-0 mt-0.5" />
                        <span className="text-gray-300">{b}</span>
                      </div>
                    ))}
                  </div>
                )}

                {isCurrent ? (
                  <div className="w-full py-2 rounded-lg text-center text-xs font-medium text-green-400 bg-green-500/10 border border-green-500/20 mt-auto">
                    Your current plan
                  </div>
                ) : (
                  <a
                    href={saasUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={
                      'w-full py-2 rounded-lg text-center text-xs font-medium transition-colors mt-auto inline-flex items-center justify-center gap-1.5 ' +
                      (isPopular
                        ? 'bg-primary-600 hover:bg-primary-500 text-white'
                        : 'bg-dark-surface3 hover:bg-dark-surface2 text-white border border-dark-border')
                    }
                  >
                    {currentSlug ? 'Switch Plan' : 'Get Started'}
                    <ArrowRight size={12} />
                  </a>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
