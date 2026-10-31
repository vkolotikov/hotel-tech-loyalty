/**
 * What the server answers, as the app reads it. These mirror the web workspace's own types
 * (`frontend/src/loyalty/lib/types.ts`, `scan/scanApi.ts`, `visits/visitsApi.ts`, `rewards/types.ts`, `overview/types.ts`)
 * for the calls the app makes under `/v1/admin/loyalty/`; when the server's answer changes, both change.
 * Instants are ISO 8601 strings; days (`today`, `valid_until`) are the venue's own `YYYY-MM-DD`.
 */

export interface Can {
  award: boolean
  redeem: boolean
  reverse: boolean
  manage_program: boolean
  manage_rewards: boolean
  manage_members: boolean
  view_insights: boolean
  manage_campaigns: boolean
  manage_app: boolean
}

export interface TierRef {
  id: number
  name: string
  color: string | null
  min_points: number
  is_active: boolean
}

export interface Ways {
  stamps: boolean
  stamps_per_card: number
  checkin: boolean
  checkin_points: number
  desk_earn: boolean
  cashback: boolean
  cashback_percent: number
  setup_done: boolean
}

export interface Bootstrap {
  name: string
  organization: { id: number; name: string; industry: string }
  accent: string | null
  venue: { timezone: string; timezone_named: boolean; today: string; currency: string }
  features: { campaigns: boolean; wallet: boolean; push: boolean }
  staff: { id: number; name: string; role: string | null; can: Can }
  programme: { on: boolean; tiers: TierRef[]; ways?: Ways; progress_by?: 'points' | 'visits' | 'spend' }
  counts: { members: number; requests_waiting: number }
}

export type MembershipState = 'active' | 'expiring' | 'expired' | 'off'

export interface MemberRow {
  id: number
  name: string
  email: string | null
  phone: string | null
  member_number: string | null
  tier_id: number | null
  points: number
  lifetime_points: number
  is_active: boolean
  joined_at: string | null
  last_activity_at: string | null
  credit_balance?: number
  valid_until?: string | null
  membership_state?: MembershipState
}

export interface MembersPage {
  page: number
  pages: number
  total: number
  members: MemberRow[]
}

export interface Progress {
  qualifying: number
  next_tier: { id: number; name: string; min_points: number } | null
  needed: number
  percent: number
}

export interface TierBenefitLine {
  id: number
  name: string
  category: string | null
  value: string | null
  value_type?: string | null
  value_amount?: number | null
  description: string | null
}

export type RequestState = 'pending' | 'eligible' | 'approved' | 'fulfilled' | 'declined' | 'cancelled'
export type RequestTab = 'waiting' | 'approved' | 'done'

export interface BenefitRequest {
  id: number
  state: RequestState
  member: { id: number; name: string; member_number: string | null } | null
  benefit: { id: number; name: string; category: string | null } | null
  asked_at: string | null
  fulfilled_at: string | null
  decline_reason: string | null
}

export interface RequestsPage {
  page: number
  pages: number
  total: number
  requests: BenefitRequest[]
  counts: Record<RequestTab, number>
}

export interface MemberDetail {
  member: MemberRow & {
    qualifying_points: number
    referral_code: string | null
    tier_override_until: string | null
    is_erased: boolean
  }
  progress: Progress
  benefits: TierBenefitLine[]
  requests: BenefitRequest[]
}

export interface LedgerLine {
  id: number
  type: string
  points: number
  balance_after: number | null
  description: string
  by: string | null
  at: string | null
  is_reversed: boolean
}

export interface HistoryPage {
  page: number
  pages: number
  total: number
  lines: LedgerLine[]
}

export interface PointsAfter {
  member: { id: number; points: number; lifetime_points: number; tier_id: number | null }
  line: number
}

export interface PlaceRow {
  id: number
  name: string
  admits: 'all' | 'tiers'
  is_active: boolean
}

export interface EventRow {
  id: number
  title: string
  starts_at: string
  ends_at: string
  place: { id: number; name: string } | null
  location: string | null
  status: 'draft' | 'published' | 'cancelled'
}

export interface TierBadge {
  id: number
  name: string
  color: string | null
}

export interface Verdict {
  granted: boolean
  reason: string
  valid_until: string | null
  expires_in_days: number | null
  tier: TierBadge | null
  allowed_tiers: string[]
  place?: { id: number; name: string }
  event?: { id: number; title: string }
}

export interface BenefitBadge {
  name: string
  value: string | null
  category: string | null
  value_type?: string | null
  value_amount?: number | null
}

export interface StampCardRow {
  id: number
  number: number
  stamps_count: number
  stamps_needed: number
  completed_at: string | null
}

export type StampAnswer =
  | { added: true; card: StampCardRow; completed: { card_id: number; number: number; reward: unknown } | null }
  | { added: false; reason: string; card: StampCardRow | null }

export interface ScanAnswer {
  member: MemberRow
  verdict?: Verdict
  benefits?: BenefitBadge[]
  checked_in?: boolean
  already_in?: string | null
  signed_up?: boolean
  points?: number
  stamp?: StampAnswer | null
}

export interface DeskAnswer {
  already_today: boolean
  points: { checkin: number; purchase: number; balance: number }
  stamp: StampAnswer | null
  credit: { line_id: number; amount: number | string; balance: number | string; currency: string } | null
  member: MemberRow
}

export interface NfcCardRow {
  id: number
  uid: string
  is_active: boolean
  linked_at?: string | null
}

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

export interface RedemptionsPage {
  page: number
  pages: number
  total: number
  redemptions: Redemption[]
  counts: { pending: number }
}

export interface Envelope<T> {
  as_of: string
  data: T
}

export type MetricKey = 'members' | 'rewards_used' | 'points_available' | 'offers_used' | 'active_offers' | 'checkins' | 'benefits_fulfilled' | 'active_benefits'
export interface Metric { key: MetricKey; value: number | null; kind: 'current' | 'period' }
export interface Metrics { joined: number; items: Metric[] }

export interface ActivityItem {
  source: 'points' | 'reward' | 'visit' | 'member' | 'tier' | 'benefit' | 'offer'
  id: number
  at: string
  member: string | null
  amount: number | null
  kind: string
  label: string | null
}
export interface Activity { items: ActivityItem[] }

/** What sign-in answers (`POST /v1/auth/login`): a token, the user, and for staff their staff row. */
export interface SignInAnswer {
  token: string
  user: { id: number; name: string; email: string; user_type?: string }
}
