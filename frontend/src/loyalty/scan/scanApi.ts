import type { QueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { loyaltyUrl, watched } from '../lib/api'
import type { MemberRow } from '../lib/types'
import type { StampAnswer } from '../visits/visitsApi'
import type { ScanContext } from './scanContext'

/**
 * What the scan screen reads and sends (release 8, spec 2026-10-25 §§1, 2, 4): the places and today's events it can
 * scan for, the scan itself with the place or event chosen, and "Today here" — a place's entries or an event's people.
 * Places are part A's (`PlaceController`), events part E's (`EventController`); the shapes below are theirs.
 */

/** A place as `GET places` lists it (`Access\AccessPlaces`). */
export interface PlaceRow {
  id: number
  name: string
  /** `all`: every member; `tiers`: only the tiers ticked. */
  admits: 'all' | 'tiers'
  tiers?: unknown
  is_active: boolean
}

export interface PlacesAnswer {
  places: PlaceRow[]
  /** Whether this person may add and change places (a manager): "Set up places" is offered when there are none. */
  can_change: boolean
}

/** An event as `GET events?when=today` lists it; its times are the venue's wall clock (`YYYY-MM-DDTHH:mm`). */
export interface EventRow {
  id: number
  title: string
  starts_at: string
  ends_at: string
  place: { id: number; name: string } | null
  location: string | null
  status: 'draft' | 'published' | 'cancelled'
  /** Whether members sign up first; without it everyone is stored as a walk-in, and the screen says neither. */
  sign_up?: boolean
}

export interface EventsAnswer {
  events: EventRow[]
}

export interface TierBadge {
  id: number
  name: string
  color: string | null
}

/** `AccessVerdict` as the scan answers it at a place or an event, with where it was decided and the entry written. */
export interface Verdict {
  granted: boolean
  /** `welcome`, `member_erased`, `member_off`, `expired`, `place_off`, `tier_not_allowed`, `event_not_open`, `event_full`, `not_signed_up`. */
  reason: string
  /** The membership's end date (`Y-m-d`), or null: no end. */
  valid_until: string | null
  /** Days left when the end is 14 days away or nearer, else null. */
  expires_in_days: number | null
  tier: TierBadge | null
  /** The tiers let in, when the tier was the reason. */
  allowed_tiers: string[]
  place?: { id: number; name: string }
  event?: { id: number; title: string }
  entry_id?: number
}

export interface BenefitBadge {
  name: string
  value: string | null
  category: string | null
  /** Release 9: the typed value (MemberBenefits), so a benefit given no wording still says "15% off". */
  value_type?: string | null
  value_amount?: number | null
}

/**
 * The scan's answer. At the desk only `member`; at a place or an event also the verdict and the tier's benefits; at an
 * event also the check-in (`checked_in`, `already_in` — the first check-in's time, `HH:mm` —, `signed_up`, `points`,
 * `stamp`).
 */
export interface ScanAnswer {
  member: MemberRow
  verdict?: Verdict
  benefits?: BenefitBadge[]
  checked_in?: boolean
  already_in?: string | null
  /** Release 9: the same with its day (`YYYY-MM-DDTHH:mm`, the venue's wall clock), for an event of several days. */
  already_in_at?: string | null
  signed_up?: boolean
  points?: number
  /** The stamp an event's visit gave (StampCards), or null when the stamp card is off. */
  stamp?: StampAnswer | null
}

export interface ScanBody {
  code: string
  idempotency_key: string
  place_id?: number
  event_id?: number
}

/** One scan at a place (`GET places/{id}/entries`): when, who (null: a code that named nobody), let in or not, why. */
export interface EntryRow {
  id: number
  at: string
  member: { id: number; name: string; member_number: string | null } | null
  granted: boolean
  reason: string
  by?: unknown
}

export interface EntriesAnswer {
  entries: EntryRow[]
  counts: { granted: number; denied: number }
}

/** One person at an event (`GET events/{id}/people`). */
export interface EventPerson {
  member: { id: number; name: string; member_number: string | null; tier?: TierBadge | null }
  signed_up_at: string | null
  checked_in_at: string | null
  walk_in: boolean
}

export interface PeopleAnswer {
  counts: { signed_up: number; checked_in: number; walk_ins: number; room_left: number | null }
  people: EventPerson[]
  /** Release 9: the latest check-ins, newest first by their real time (EventRows::latestCheckIns). */
  latest?: EventPerson[]
  event?: { sign_up: boolean }
}

export const scanApi = {
  places: (): Promise<PlacesAnswer> => watched(api.get(loyaltyUrl('places'))),
  eventsToday: (): Promise<EventsAnswer> => watched(api.get(loyaltyUrl('events?when=today'))),
  scan: (body: ScanBody): Promise<ScanAnswer> => watched(api.post(loyaltyUrl('scan'), body)),
  entries: (placeId: number): Promise<EntriesAnswer> => watched(api.get(loyaltyUrl(`places/${placeId}/entries`))),
  people: (eventId: number): Promise<PeopleAnswer> => watched(api.get(loyaltyUrl(`events/${eventId}/people`))),
}

// Keys of their own under the places' and events' prefixes: part A's and part E's pages invalidate those prefixes, and
// these answers are never confused with theirs.
export const placesKey = ['loyalty', 'places', 'scan'] as const
export const eventsTodayKey = ['loyalty', 'events', 'today'] as const
export const entriesKey = (placeId: number) => ['loyalty', 'places', placeId, 'scan-entries'] as const
export const peopleKey = (eventId: number) => ['loyalty', 'event', eventId, 'scan-people'] as const

/** What the body names besides the code: the place or the event; nothing at the desk. */
export function contextBody(context: ScanContext): Pick<ScanBody, 'place_id' | 'event_id'> {
  if (context.kind === 'place') return { place_id: context.id }
  if (context.kind === 'event') return { event_id: context.id }
  return {}
}

/**
 * What a scan makes stale: "Today here" and the place's counts (an entry is written at a place, a check-in at an
 * event), the event's numbers, and the member a check-in gave points to.
 */
export function afterScan(client: QueryClient, context: ScanContext, memberId: number | null): void {
  if (context.kind === 'place') void client.invalidateQueries({ queryKey: ['loyalty', 'places'] })
  if (context.kind === 'event') {
    void client.invalidateQueries({ queryKey: ['loyalty', 'event', context.id] })
    void client.invalidateQueries({ queryKey: ['loyalty', 'events'] })
    // A check-in writes points, a history line and a stamp: the member's page reads all three again.
    if (memberId !== null) {
      for (const queryKey of [['loyalty', 'member', memberId], ['loyalty', 'history', memberId], ['loyalty', 'stamps', memberId], ['loyalty', 'members']]) {
        void client.invalidateQueries({ queryKey })
      }
    }
  }
}

/** A place or an event that is no longer there (`gone`): its list is read again, and the screen's choice falls back. */
export function afterGone(client: QueryClient, gone: 'place' | 'event'): void {
  void client.invalidateQueries({ queryKey: gone === 'place' ? ['loyalty', 'places'] : ['loyalty', 'events'] })
}
