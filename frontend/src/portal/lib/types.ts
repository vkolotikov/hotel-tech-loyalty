import type { PortalAccent } from '../theme/applyPortalTheme'

export interface PortalVenue {
  name: string
  logo_url: string | null
  industry: string
  currency: string
  timezone: string
  contact: { email: string | null; phone: string | null }
  accent: PortalAccent
  display_face: string
}

export interface PortalCapabilities {
  loyalty: boolean
  services: boolean
  stays: boolean
  chat: boolean
  payments: { services: boolean; stays: boolean; publishable_key: string | null }
}

export interface PortalPolicies {
  services_cancel_hours: number
  booking_cancel_hours: number
  services_cancellation_policy: string
}

export interface Tier { id: number; name: string; color_hex?: string | null }

export interface Activity {
  id: number
  type: string
  points: number
  balance_after?: number | null
  description?: string | null
  created_at: string
  is_reversed?: boolean
}

export interface BenefitPreview {
  id: number
  name: string
  category?: string | null
  display?: string | null
  value_type?: string | null
  value_amount?: number | null
}

export interface PortalMember {
  member_number: string
  name: string
  tier: Tier | null
  current_points: number
  lifetime_points: number
  referral_code: string | null
  progress: { percentage: number; points_needed: number; next_tier: Tier | null }
  recent_activity: Activity[]
  marketing_consent: boolean
  email_notifications: boolean
  push_notifications: boolean
  member_since: string
  user: { id: number; name: string; email: string; phone: string | null; language: string | null; nationality?: string | null; avatar_url?: string | null; date_of_birth?: string | null }
  benefits: BenefitPreview[]
}

export interface PortalBootstrap {
  venue: PortalVenue
  capabilities: PortalCapabilities
  policies: PortalPolicies
  member: PortalMember | null
  counts: { unread_notifications: number; upcoming_bookings: number }
}

export type BookingKind = 'service' | 'stay'

export interface PortalBooking {
  kind: BookingKind
  id: number
  reference: string
  title: string
  subtitle: string | null
  starts_at: string | null
  ends_at: string | null
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | string
  payment_status: string | null
  total: number
  currency: string
  discount: { amount: number; label: string } | null
  can_cancel: boolean
  cancel_deadline: string | null
  notes: string | null
  party_size: number | null
  guests: number | null
  nights: number | null
}

export interface Paginated<T> { data: T[]; meta: { scope: string; page: number; per_page: number; total: number } }

export interface CardPayload { member_number: string; qr_svg?: string | null; qr_image?: string | null }

export interface Benefit {
  tier_benefit_id: number
  benefit_id: number
  name: string
  category?: string | null
  description?: string | null
  display?: string | null
  fulfillment_mode?: string | null
  requestable: boolean
  request?: { id: number; status: string; requested_at?: string } | null
  last_fulfilled_at?: string | null
}

export interface Reward {
  id: number
  name: string
  description?: string | null
  category?: string | null
  image_url?: string | null
  points_cost: number
  stock?: number | null
  per_member_limit?: number | null
  can_afford: boolean
  claimed_by_me: number
  remaining_for_me: number | null
  in_stock: boolean | null
}

export interface Redemption {
  id: number
  code: string
  status: 'pending' | 'fulfilled' | 'cancelled' | string
  points_spent: number
  created_at: string
  reward?: { id: number; name: string; category?: string | null; image_url?: string | null; points_cost: number } | null
}

export interface Offer {
  id: number
  title: string
  description?: string | null
  type?: string | null
  value?: number | string | null
  image_url?: string | null
  end_date?: string | null
  terms_conditions?: string | null
  usage_limit?: number | null
  times_used?: number | null
}

export interface Claim {
  id: number
  status: string
  claimed_at?: string | null
  used_at?: string | null
  expires_at?: string | null
  offer?: Offer | null
}

export interface LaravelPage<T> { data: T[]; current_page: number; last_page: number; total: number }
