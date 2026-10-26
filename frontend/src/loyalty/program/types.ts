import type { BrandOptions } from '../rewards/types'

/**
 * What `GET /v1/admin/loyalty/program` answers and what its writes take (spec 2026-10-21 §4.5, ProgramController).
 * Boost instants are UTC ISO strings; a wall clock the workspace sends (`YYYY-MM-DDTHH:mm`) is the venue's.
 */
export interface TierBenefit {
  id: number
  benefit_id: number
  name: string
  category: string | null
  value: string | null
  value_type: string
  value_amount: number | null
  applies_to: string
}

export interface Tier {
  id: number
  name: string
  description: string | null
  color: string | null
  min_points: number
  min_nights: number | null
  min_stays: number | null
  min_spend: number | null
  /** Release 8: the visits that reach it when the programme moves members by visits (`tier_progress_by`); absent before. */
  min_visits?: number | null
  earn_rate: number
  is_active: boolean
  sort_order: number
  /** Active members in the tier. */
  members: number
  benefits: TierBenefit[]
}

export interface Benefit {
  id: number
  name: string
  code: string | null
  description: string | null
  category: string | null
  fulfillment_mode: string | null
  is_active: boolean
  sort_order: number
}

export type BoostState = 'live' | 'upcoming' | 'ended' | 'off'

export interface Boost {
  id: number
  /** The brand it runs on (release 4); a change keeps it unless it names another (release 6). */
  brand_id?: number | null
  name: string
  description: string | null
  multiplier: number
  starts_at: string | null
  ends_at: string | null
  /** 0 = Sunday … 6 = Saturday (Carbon's dayOfWeek); null for every day. */
  days_of_week: number[] | null
  /** null for every tier. */
  tier_ids: number[] | null
  is_active: boolean
  state: string
  /**
   * Release 4 (R4-6): its times were last saved before every save read them as the venue's wall clock, at a venue
   * not on UTC — the full admin stored such a time as if it were UTC. Saving the boost clears it.
   */
  check_time?: boolean
}

/** The lists a form may choose from, served by the server (LoyaltyForms), never kept here. */
export interface ProgramOptions {
  categories: string[]
  fulfillment_modes: string[]
  value_types: string[]
  applies_to: string[]
  /** Release 4: the brands a new boost may be put on. */
  brands?: BrandOptions
}

export interface Program {
  tiers: Tier[]
  benefits: Benefit[]
  boosts: Boost[]
  options: ProgramOptions
  /** Release 10: what the ladder and the catalogue leave out (TierAdvice); a server before it sends none. */
  advice?: ProgramAdvice[]
}

/** One of Program's checks: its code, warn or tip, its figures and the tiers or benefits it names. */
export interface ProgramAdvice {
  code: string
  level: 'warn' | 'tip'
  params: Record<string, number>
  tiers: { id: number; name: string }[]
  benefits: { id: number; name: string }[]
}

export interface TierBody {
  name: string
  color: string | null
  min_points: number
  /** Release 8: the floors on the other measures, sent when the form carries them (null: not reached on that measure). */
  min_visits?: number | null
  min_spend?: number | null
  earn_rate: number
  description: string | null
  is_active: boolean
}

export interface BenefitBody {
  name?: string
  code?: string
  category?: string
  fulfillment_mode?: string
  description?: string | null
  is_active?: boolean
}

export interface TierBenefitBody {
  benefit_id: number
  value: string | null
  value_type: string
  value_amount: number | null
  applies_to: string
}

export interface BoostBody {
  name: string
  description: string | null
  multiplier: number
  /** The venue's wall clock, `YYYY-MM-DDTHH:mm`. */
  starts_at: string
  ends_at: string
  days_of_week: number[] | null
  tier_ids: number[] | null
  is_active: boolean
  /** Release 4: the brand a new boost goes on, sent only when there is a choice; release 6: on a change, another moves it. */
  brand?: number | 'every'
}
