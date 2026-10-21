import type { Paged } from '../lib/types'

/**
 * What Rewards' calls answer and take (spec 2026-10-21 §4.6; RewardController, RedemptionController, OfferController,
 * ReferralController). Instants are UTC ISO strings shown on the venue's clock; an offer's dates are plain venue days.
 */
export interface Reward {
  id: number
  name: string
  description: string | null
  terms: string | null
  /** The organisation's own word, free text. */
  category: string | null
  points_cost: number
  /** null for no stock limit. */
  stock: number | null
  per_member_limit: number | null
  discount_type: string | null
  discount_value: number | null
  applies_to: string
  expires_at: string | null
  is_active: boolean
  image_url: string | null
  /** Every redemption of it, and the fulfilled ones. */
  redeemed: number
  fulfilled: number
}

/** The lists the reward form chooses from, served by the server (LoyaltyForms). */
export interface RewardOptions {
  discount_types: string[]
  applies_to: string[]
}

export interface Catalogue {
  rewards: Reward[]
  options: RewardOptions
}

export interface RewardBody {
  name: string
  description: string | null
  terms: string | null
  category: string | null
  points_cost: number
  stock: number | null
  per_member_limit: number | null
  discount_type: string | null
  discount_value: number | null
  applies_to: string
  /** The venue's wall clock, `YYYY-MM-DDTHH:mm`, or null for none. */
  expires_at: string | null
  is_active: boolean
}

export type RedemptionState = 'pending' | 'fulfilled' | 'cancelled'
/** The list's filter, as `GET redemptions?state=` takes it. */
export type RedemptionFilter = 'pending' | 'done' | 'all'

export interface Redemption {
  id: number
  code: string
  state: string
  points: number
  reward: { id: number; name: string } | null
  member: { id: number; name: string; member_number: string | null } | null
  at: string | null
  fulfilled_at: string | null
  cancelled_at: string | null
}

export interface RedemptionsPage extends Paged {
  redemptions: Redemption[]
  counts: { pending: number }
}

export interface Offer {
  id: number
  title: string
  description: string | null
  type: string
  value: number
  code: string | null
  applies_to: string
  /** null for every tier. */
  tier_ids: number[] | null
  /** The venue's days, `YYYY-MM-DD`. */
  start_date: string | null
  end_date: string | null
  usage_limit: number | null
  times_used: number
  per_member_limit: number | null
  is_active: boolean
  is_featured: boolean
  state: string
}

export interface OfferOptions {
  types: string[]
  applies_to: string[]
}

export interface OffersList {
  offers: Offer[]
  options: OfferOptions
}

export interface OfferBody {
  title: string
  description: string
  type: string
  value: number
  code: string | null
  applies_to: string
  tier_ids: number[] | null
  start_date: string
  end_date: string
  usage_limit: number | null
  per_member_limit: number | null
  is_featured: boolean
  /** Only on a change: a new offer is made active. */
  is_active?: boolean
}

export interface Referral {
  id: number
  referrer: { id: number; name: string } | null
  referee: { id: number; name: string } | null
  state: string
  points: { referrer: number; referee: number }
  at: string | null
}

export interface ReferralsPage extends Paged {
  figures: { total: number; rewarded: number; pending: number; points_paid: number }
  referrals: Referral[]
}
