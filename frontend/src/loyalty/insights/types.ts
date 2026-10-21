import type { MemberRow } from '../lib/types'

/**
 * What `GET insights` and `GET insights/at-risk` answer (spec 2026-10-21 release 2 §5; the definitions are the
 * server's, App\Services\Loyalty\Insights\LoyaltyInsights). Bucket keys are the venue's own: a day `YYYY-MM-DD`, a week
 * by its Monday `YYYY-MM-DD`, a month `YYYY-MM` — never instants, never passed to `new Date()`.
 */
export type Period = '30d' | '90d' | '12m'
export type BucketKind = 'day' | 'week' | 'month'

export interface Tiles {
  /** Every member, whatever their state. */
  members: number
  /** Joined in the period. */
  new_members: number
  /** Active members with activity in the last 90 days. */
  active_members: number
  issued: number
  redeemed: number
  expired: number
  /** The sum of active members' balances, now. */
  outstanding: number
  /** Redeemed ÷ issued in the period, in percent with one decimal; null when nothing was issued. */
  redemption_rate: number | null
}

export interface GrowthBucket { key: string; new: number; total: number }
export interface PointsBucket { key: string; issued: number; redeemed: number; expired: number }
export interface RedemptionsBucket { key: string; fulfilled: number; pending: number; cancelled: number }

export interface TierCount {
  id: number
  name: string
  color: string | null
  sort_order: number
  is_active: boolean
  members: number
}

export type Direction = 'up' | 'down' | 'lateral'

export interface Flow { from: number; to: number; count: number; direction: Direction }

export interface Movement { up: number; down: number; lateral: number; flows: Flow[] }

export interface Expiry {
  /** Points whose date has come but which the hourly sweep has not taken yet. */
  overdue: { points: number; members: number }
  /** This month and the five after, from tomorrow on. */
  months: { key: string; points: number }[]
}

export type EngagementGroup = 'new' | 'active' | 'at_risk' | 'dormant'

export interface Band { min: number | null; max: number | null; members: number }

export interface Insights {
  period: Period
  bucket: BucketKind
  /** The venue days the period covers, both included. */
  from: string
  to: string
  timezone: string
  tiles: Tiles
  growth: GrowthBucket[]
  points: PointsBucket[]
  redemptions: RedemptionsBucket[]
  tiers: { rows: TierCount[]; none: number }
  movement: Movement
  expiry: Expiry
  engagement: Record<EngagementGroup, number>
  balances: Band[]
}

export interface AtRiskMember extends MemberRow {
  /** Whole venue days since the last activity. */
  days_quiet: number
}

export interface AtRisk {
  days: number
  /** Every member who matches; `members` holds the first `limit` of them. */
  total: number
  limit: number
  members: AtRiskMember[]
}
