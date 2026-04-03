import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

export interface SubscriptionData {
  active: boolean
  status: string
  plan?: { name: string; slug: string } | null
  trialEnd?: string | null
  periodEnd?: string | null
  features: Record<string, string>
  products: string[]
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
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  const features = data?.features ?? ALL_FEATURES
  const products = data?.products ?? ALL_PRODUCTS
  const status = data?.status ?? 'LOCAL'

  const hasFeature = (key: string): boolean => {
    const v = features[key]
    if (!v) return false
    if (v === 'true' || v === 'unlimited') return true
    if (v === 'false') return false
    // numeric limit — treat as enabled if > 0
    const n = Number(v)
    return !isNaN(n) && n > 0
  }

  const hasProduct = (slug: string): boolean => products.includes(slug)

  return { data, isLoading, status, features, products, hasFeature, hasProduct }
}
