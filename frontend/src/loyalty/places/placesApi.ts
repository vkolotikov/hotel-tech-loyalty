import type { QueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { loyaltyUrl, watched } from '../lib/api'

/**
 * Places and their entries (release 8, spec 2026-10-25 §1), as `PlaceController` answers them. A place lets in every
 * member (`all`) or only the tiers it lists (`tiers`, in the ladder's order); `today` counts the venue day's scans there.
 */

export type Admits = 'all' | 'tiers'

/** A tier as a place names it (`PlaceEntries::tier`): its colour is the tier's own, for its chip. */
export interface PlaceTier {
  id: number
  name: string
  color: string | null
}

export interface Place {
  id: number
  name: string
  description: string | null
  admits: Admits
  tiers: PlaceTier[]
  is_active: boolean
  sort_order: number
  today: { granted: number; denied: number }
}

export interface PlacesList {
  places: Place[]
  /** The organisation's tiers in use, in the ladder's order: what "Only these tiers" offers. */
  tiers: PlaceTier[]
  /** A manager: adds, changes and removes places. */
  can_change: boolean
}

export interface PlaceBody {
  name: string
  description: string | null
  admits: Admits
  tier_ids: number[]
  is_active: boolean
  idempotency_key: string
}

/** One scan at a place: when (the venue's wall clock), who (null: a code that named nobody), let in or not, and why. */
export interface Entry {
  id: number
  at: string
  member: { id: number; name: string; member_number: string | null } | null
  granted: boolean
  /** The verdict's reason (`welcome`, `member_off`, …), or — without a member — the code's refusal (`not_found`, …). */
  reason: string
  by: string | null
}

export interface EntriesPage {
  entries: Entry[]
  page: number
  pages: number
  counts: { granted: number; denied: number }
}

export const placesApi = {
  list: (): Promise<PlacesList> => watched(api.get(loyaltyUrl('places'))),
  create: (body: PlaceBody): Promise<{ place: Place }> => watched(api.post(loyaltyUrl('places'), body)),
  update: (id: number, body: PlaceBody): Promise<{ place: Place }> => watched(api.put(loyaltyUrl(`places/${id}`), body)),
  /** A place with entries, or one an event names, is switched off instead of deleted: the answer says which. */
  remove: (id: number): Promise<{ outcome: 'deleted' | 'switched_off'; place: Place | null }> => watched(api.delete(loyaltyUrl(`places/${id}`))),
  entries: (id: number, day: string, page: number): Promise<EntriesPage> =>
    watched(api.get(loyaltyUrl(`places/${id}/entries`), { params: { day, ...(page > 1 ? { page } : {}) } })),
}

/** The places list: Program's Places section and every tier card's "Can enter" read this one query. */
export const PLACES_KEY = ['loyalty', 'places'] as const

export const entriesKey = (placeId: number, day: string, page: number) => ['loyalty', 'places', placeId, 'entries', day, page] as const

/** What a saved change makes stale: the list (and with it every tier's places), and the entries under it. */
export function afterPlaceChange(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: PLACES_KEY })
}
