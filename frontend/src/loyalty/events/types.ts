/**
 * Events as the server answers them (release 8, spec 2026-10-25 §4; App\Services\Loyalty\Events\EventRows). Times are
 * the venue's wall clock, 'YYYY-MM-DDTHH:mm' — never passed to `new Date()`; a check-in's time is 'HH:mm' on the
 * venue's clock; a sign-up's times are instants (ISO 8601).
 */
import type { Wall } from '../../workspace/lib/wallClock'

export type EventStatus = 'draft' | 'published' | 'cancelled'
/** Where an event is in its life (EventClock::phase): a published one is upcoming, on now or ended. */
export type EventPhase = 'draft' | 'upcoming' | 'on_now' | 'ended' | 'cancelled'

export interface EventCounts {
  signed_up: number
  checked_in: number
  walk_ins: number
  /** The capacity less sign-ups and walk-ins; null without a capacity. */
  room_left: number | null
}

export interface EventTier {
  id: number
  name: string
  color: string | null
}

export interface LoyaltyEventRow {
  id: number
  title: string
  description: string | null
  starts_at: Wall
  ends_at: Wall
  place: { id: number; name: string } | null
  location: string | null
  admits: 'all' | 'tiers'
  tiers: EventTier[]
  points: number
  counts_as_visit: boolean
  sign_up: boolean
  walk_ins: boolean
  capacity: number | null
  status: EventStatus
  phase: EventPhase
  counts: EventCounts
}

export interface PlaceOption {
  id: number
  name: string
  is_active: boolean
}

export interface EventOptions {
  places: PlaceOption[]
}

export type EventsTab = 'upcoming' | 'past' | 'drafts'

/** `GET events?when=…` */
export interface EventsList {
  events: LoyaltyEventRow[]
  page: number
  pages: number
  total: number
  totals: { upcoming: number; past: number; drafts: number }
  can_change: boolean
  options: EventOptions
}

/** `GET events/{id}` */
export interface EventOne {
  event: LoyaltyEventRow
  can_change: boolean
  options: EventOptions
}

export interface EventPerson {
  member: { id: number; name: string; member_number: string | null; tier: EventTier | null }
  signed_up_at: string | null
  cancelled_at: string | null
  /** 'HH:mm' on the venue's clock. */
  checked_in_at: string | null
  walk_in: boolean
  source: 'portal' | 'staff' | null
}

/** `GET events/{id}/people` */
export interface EventPeople {
  event: LoyaltyEventRow
  counts: EventCounts
  people: EventPerson[]
  page: number
  pages: number
  total: number
}

/** AccessVerdict::toArray() (part A's decider). */
export interface Verdict {
  granted: boolean
  reason: string
  valid_until: string | null
  expires_in_days: number | null
  tier: EventTier | null
  allowed_tiers: string[]
}

/** `POST events/{id}/check-in` (EventCheckIn::checkIn). */
export interface CheckInAnswer {
  verdict: Verdict
  checked_in: boolean
  /** 'HH:mm' of the first check-in when the member was in already. */
  already_in: string | null
  signed_up: boolean
  points: number
  attendance_id: number | null
  scan_event_id: number
}

/** What the event dialog sends (EventEditor's fields). */
export interface EventBody {
  title: string
  description: string | null
  starts_at: Wall
  ends_at: Wall
  place_id: number | null
  location: string | null
  admits: 'all' | 'tiers'
  tier_ids: number[]
  points: number
  counts_as_visit: boolean
  sign_up: boolean
  walk_ins: boolean
  capacity: number | null
}
