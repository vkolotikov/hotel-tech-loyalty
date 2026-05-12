import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export interface SubscriptionData {
  active: boolean
  status: string
  plan?: { name: string; slug: string } | null
  trialEnd?: string | null
  trialStartedAt?: string | null
  trialAlreadyUsed?: boolean
  periodEnd?: string | null
  /** Set on PAST_DUE_GRACE: until this point we still let them work. */
  graceUntil?: string | null
  features: Record<string, string>
  products: string[]
  billingAvailable?: boolean
}

const ALL_FEATURES: SubscriptionData['features'] = {
  max_team_members: 'unlimited', max_guests: 'unlimited',
  max_properties: 'unlimited', max_loyalty_members: 'unlimited',
  ai_insights: 'true', ai_avatars: 'true', custom_branding: 'true',
  api_access: 'true', push_notifications: 'true', mobile_app: 'true',
  nfc_cards: 'true', priority_support: 'dedicated',
}
const ALL_PRODUCTS = ['crm', 'chat', 'loyalty', 'education', 'avatar', 'booking']

export function useSubscription() {
  const { data, isLoading } = useQuery<SubscriptionData>({
    queryKey: ['subscription-status'],
    queryFn: () => api.get('/v1/auth/subscription').then(r => r.data),
    // Tight refetch policy. Billing status is the gate that decides whether
    // the user keeps using the product, so we want the wall to flip on
    // within a minute of trial expiry — not the previous 5 min worst case.
    staleTime: 60_000,
    refetchInterval: (q) => {
      const d = q.state.data as SubscriptionData | undefined
      if (!d) return 60_000
      // Once active, no need to poll aggressively.
      if (d.status === 'ACTIVE') return 5 * 60_000
      if (d.status === 'TRIALING') {
        if (!d.trialEnd) return 60_000
        const ms = new Date(d.trialEnd).getTime() - Date.now()
        if (ms < 0) return 15_000       // expired but cache says trialing — push hard
        if (ms <= 86_400_000) return 30_000  // last 24h: every 30s
        return 60_000                   // earlier in trial: every 60s
      }
      // EXPIRED / NO_PLAN — keep polling so re-subscription auto-unlocks.
      return 30_000
    },
    refetchOnWindowFocus: true,
    retry: false,
  })

  // Client-side fail-safe: even with no API call, treat a passed trialEnd as
  // EXPIRED. Caps how long the user can see a stale "TRIALING" status from
  // the cache — the wall shows immediately on the first render after the
  // trialEnd timestamp passes, even before the next refetch lands.
  const isClientExpired = !!(
    data?.status === 'TRIALING' &&
    data?.trialEnd &&
    new Date(data.trialEnd).getTime() < Date.now()
  )

  // Only grant all features in LOCAL dev mode (no SaaS configured).
  // While loading or for any real status, use the actual plan data.
  const isLocal = data?.status === 'LOCAL'
  const features = isLocal ? ALL_FEATURES : (data?.features ?? {})
  const products = isLocal ? ALL_PRODUCTS : (data?.products ?? [])
  const rawStatus = data?.status ?? (isLoading ? 'LOADING' : 'NO_PLAN')
  const status = isClientExpired ? 'EXPIRED' : rawStatus

  const hasFeature = (key: string): boolean => {
    // While loading, assume features are available to prevent flash of locked UI
    if (isLoading) return true
    if (isLocal) return true
    const v = features[key]
    if (!v) return false
    if (v === 'true' || v === 'unlimited') return true
    if (v === 'false') return false
    const n = Number(v)
    return !isNaN(n) && n > 0
  }

  const hasProduct = (slug: string): boolean => {
    if (isLoading || isLocal) return true
    return products.includes(slug)
  }

  const billingAvailable = data?.billingAvailable ?? false

  // Derived UX hints. These let the Layout banner know what to show
  // without re-implementing the date math in three places.
  const trialDaysLeft = (() => {
    if (status !== 'TRIALING' || !data?.trialEnd) return null
    const ms = new Date(data.trialEnd).getTime() - Date.now()
    if (ms <= 0) return 0
    return Math.ceil(ms / 86_400_000)
  })()
  const inPastDueGrace = status === 'PAST_DUE_GRACE'
  const graceDaysLeft = (() => {
    if (!inPastDueGrace || !data?.graceUntil) return null
    const ms = new Date(data.graceUntil).getTime() - Date.now()
    if (ms <= 0) return 0
    return Math.ceil(ms / 86_400_000)
  })()

  return {
    data, isLoading, status, features, products,
    hasFeature, hasProduct, billingAvailable,
    trialDaysLeft, inPastDueGrace, graceDaysLeft,
  }
}
