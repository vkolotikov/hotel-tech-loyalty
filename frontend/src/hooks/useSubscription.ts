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
    // Stale for 5 min in the steady-state, but refetch every 60s once the
    // trial has ≤2 days left so the SubscriptionWall flips on within a minute
    // of the actual trial expiry instead of up to 5 min later.
    staleTime: 5 * 60 * 1000,
    refetchInterval: (q) => {
      const d = q.state.data as SubscriptionData | undefined
      if (!d?.trialEnd || d.status !== 'TRIALING') return false
      const ms = new Date(d.trialEnd).getTime() - Date.now()
      const days = ms / 86400000
      if (days < 0) return 30_000        // expired but cache says trialing — push hard
      if (days <= 2) return 60_000       // last 48h
      return false                       // normal
    },
    retry: false,
  })

  // Only grant all features in LOCAL dev mode (no SaaS configured).
  // While loading or for any real status, use the actual plan data.
  const isLocal = data?.status === 'LOCAL'
  const features = isLocal ? ALL_FEATURES : (data?.features ?? {})
  const products = isLocal ? ALL_PRODUCTS : (data?.products ?? [])
  const status = data?.status ?? (isLoading ? 'LOADING' : 'NO_PLAN')

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

  return { data, isLoading, status, features, products, hasFeature, hasProduct, billingAvailable }
}
