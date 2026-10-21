/**
 * What the server answers, as HexaTech Loyalty reads it (spec 2026-10-21 §6.4). Instants are ISO 8601 strings shown in
 * the venue's zone; days (`today`) are the venue's own `YYYY-MM-DD`.
 */
export type DateKey = string

export interface Can {
  award: boolean
  redeem: boolean
  reverse: boolean
  manage_program: boolean
  manage_rewards: boolean
  /** Release 2: tier, deactivate, delete, duplicates, import, export (a manager's). */
  manage_members: boolean
  /** Insights: a manager or `can_view_analytics`. */
  view_insights: boolean
  manage_campaigns: boolean
  /** Card & app: the wallet pass and the member app's look. */
  manage_app: boolean
}

/** What the plan holds; the routes behind each answer 402 `feature_locked` without it. */
export interface Features {
  campaigns: boolean
  wallet: boolean
  /** The plan's `push_notifications`: push messages to a segment (release 3 §5). */
  push: boolean
}

export interface TierRef {
  id: number
  name: string
  color: string | null
  min_points: number
  is_active: boolean
}

export interface Bootstrap {
  name: string
  organization: { id: number; name: string; industry: string }
  accent: string | null
  /** `currency`: the code members see in the portal (PortalBootstrap::currency). */
  venue: { timezone: string; timezone_named: boolean; today: DateKey; currency: string }
  features: Features
  staff: { id: number; name: string; role: string | null; can: Can }
  programme: { on: boolean; tiers: TierRef[] }
  counts: { members: number; requests_waiting: number }
}

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
}

export interface Figures {
  total: number
  active: number
  new_this_month: number
  average_points: number
  /** Active members per tier id. */
  tiers: Record<string, number>
}

export interface Paged {
  page: number
  pages: number
  total: number
}

export interface MembersPage extends Paged {
  members: MemberRow[]
  figures: Figures
}

export type MemberSort = 'recent' | 'points' | 'name' | 'activity'
export type MemberState = 'active' | 'inactive' | 'all'

export interface MemberFilters {
  q: string
  tier_id: number | null
  state: MemberState
  sort: MemberSort
  page: number
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

export interface RequestsPage extends Paged {
  requests: BenefitRequest[]
  counts: Record<RequestTab, number>
}

export interface MemberDetail {
  /**
   * The list's row with release 2's details block (§4.1, `MemberProfile` on the server): language, nationality, the
   * date of birth (`YYYY-MM-DD`), marketing consent, the instant a manager holds the tier until (or null), and whether
   * the member was deleted.
   */
  member: MemberRow & {
    qualifying_points: number
    referral_code: string | null
    language: string | null
    nationality: string | null
    date_of_birth: string | null
    marketing_consent: boolean
    tier_override_until: string | null
    is_erased: boolean
  }
  progress: Progress
  benefits: TierBenefitLine[]
  requests: BenefitRequest[]
  /** What Edit details offers: the language codes (named in the reader's language by the browser). */
  options: { languages: string[] }
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
  reversal_of_id: number | null
  can_reverse: boolean
}

export interface HistoryPage extends Paged {
  lines: LedgerLine[]
}

/** What award, redeem and reverse answer: the member's balance after it, and the line written. */
export interface PointsAfter {
  member: { id: number; points: number; lifetime_points: number; tier_id: number | null }
  line: number
}
