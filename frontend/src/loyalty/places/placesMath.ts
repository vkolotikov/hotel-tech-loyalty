import { addDays } from '../../workspace/lib/wallClock'
import type { ApiFailure } from '../lib/api'
import { serverProblems, type Problems } from '../lib/forms'
import type { Admits, Entry, Place, PlaceBody, PlaceTier } from './placesApi'
import { REASON_WORDS, REFUSAL_WORDS } from './words'

/**
 * Places' decisions (release 8, spec 2026-10-25 §1), kept out of the components so they can be tested by value: the
 * dialog's form and what it refuses before sending, the "who may enter" line, today's counts, the places a tier can
 * enter, and an entry in words. The server checks everything again (AccessPlaces).
 */

/** The server's bounds (AccessPlaces::MAX_NAME, MAX_DESCRIPTION). */
export const MAX_NAME = 80
export const MAX_DESCRIPTION = 300

export interface PlaceForm {
  name: string
  admits: Admits
  /** The tiers ticked; kept while "Every member" is chosen, so switching back loses nothing before saving. */
  tier_ids: number[]
  description: string
  is_active: boolean
}

/** A new place lets every member in and is switched on: the entrance most venues add first. */
export function placeFormOf(place: Place | null): PlaceForm {
  if (!place) return { name: '', admits: 'all', tier_ids: [], description: '', is_active: true }
  return {
    name: place.name,
    admits: place.admits,
    tier_ids: place.tiers.map(t => t.id),
    description: place.description ?? '',
    is_active: place.is_active,
  }
}

const folded = (text: string): string => text.trim().toLocaleLowerCase()

/**
 * What the form refuses before sending: a name (1–80 characters, and not another place's, whatever its case), a tier
 * at least when only chosen tiers may enter, a description of 300 characters at most. `places` are the places listed;
 * `editing` the one being changed (its own name is free).
 */
export function placeProblems(form: PlaceForm, places: readonly Place[], editing: number | null): Problems {
  const out: Problems = {}
  const name = form.name.trim()
  if (name === '') out.name = 'name'
  else if (name.length > MAX_NAME) out.name = 'name_long'
  else if (places.some(p => p.id !== editing && folded(p.name) === folded(name))) out.name = 'name_taken'
  if (form.admits === 'tiers' && form.tier_ids.length === 0) out.tier_ids = 'tiers'
  if (form.description.trim().length > MAX_DESCRIPTION) out.description = 'description'
  return out
}

/** The body the server takes: "Every member" sends no tiers (the place keeps none). */
export function placeBody(form: PlaceForm, key: string): PlaceBody {
  const description = form.description.trim()
  return {
    name: form.name.trim(),
    description: description === '' ? null : description,
    admits: form.admits,
    tier_ids: form.admits === 'tiers' ? [...form.tier_ids].sort((a, b) => a - b) : [],
    is_active: form.is_active,
    idempotency_key: key,
  }
}

/** The server's fields, as the dialog's problems (`tier_ids.0` is `tier_ids`). */
export const PLACE_FIELDS: Record<string, string> = {
  name: 'name', admits: 'admits', tier_ids: 'tiers', description: 'description',
}

/** The server's answer as the dialog's problems: its field errors, and a name another place has. */
export function serverPlaceProblems(failure: ApiFailure | null): Problems {
  if (!failure) return {}
  const out = serverProblems(failure.fields, PLACE_FIELDS)
  if (failure.code === 'name_taken') out.name = 'name_taken'
  return out
}

/** Who may enter: every member, or the tiers listed (in the ladder's order, as the server sends them). */
export type WhoMayEnter = { kind: 'every' } | { kind: 'tiers'; tiers: PlaceTier[] }

export function whoMayEnter(place: Pick<Place, 'admits' | 'tiers'>): WhoMayEnter {
  return place.admits === 'tiers' ? { kind: 'tiers', tiers: place.tiers } : { kind: 'every' }
}

/** A line's key, its English and its values, for `t(...)`. */
export type Words = [string, string, Record<string, string | number>?]

/** Today's scans at a place: "Today: 12 in · 1 refused", or "No entries today". */
export function todayWords(today: Place['today']): Words {
  if (today.granted === 0 && today.denied === 0) return ['loyalty.places.today_none', 'No entries today']
  return ['loyalty.places.today', 'Today: {{granted}} in · {{denied}} refused', { granted: today.granted, denied: today.denied }]
}

/** A day's counts in the entries dialog: "12 in · 1 refused", or "Nobody scanned in here on this day". */
export function countsWords(counts: { granted: number; denied: number }): Words {
  if (counts.granted === 0 && counts.denied === 0) return ['loyalty.places.entries.none', 'Nobody scanned in here on this day.']
  return ['loyalty.places.entries.counts', '{{granted}} in · {{denied}} refused', { granted: counts.granted, denied: counts.denied }]
}

/**
 * The places a tier can enter, from the places list (one source): the places switched on that let every member in or
 * list this tier. Null when the venue has no place switched on (the tier card then says nothing).
 */
export type TierPlaces = { kind: 'every' } | { kind: 'some'; names: string[] } | { kind: 'nowhere' }

export function tierPlaces(places: readonly Place[] | undefined, tierId: number): TierPlaces | null {
  const on = (places ?? []).filter(p => p.is_active)
  if (on.length === 0) return null
  const open = on.filter(p => p.admits === 'all' || p.tiers.some(t => t.id === tierId))
  if (open.length === 0) return { kind: 'nowhere' }
  if (open.length === on.length) return { kind: 'every' }
  return { kind: 'some', names: open.map(p => p.name) }
}

/** A tier card's line. */
export function tierPlacesWords(line: TierPlaces): Words {
  if (line.kind === 'every') return ['loyalty.places.tier.every', 'Can enter: every place']
  if (line.kind === 'nowhere') return ['loyalty.places.tier.nowhere', 'Can enter: no place yet']
  return ['loyalty.places.tier.some', 'Can enter: {{places}}', { places: line.names.join(', ') }]
}

/**
 * An entry's reason in words: a member let in or not, by the verdict's reason; without a member, why the code named
 * nobody. A code without a word reads as its family's `unknown`.
 */
export function entryWords(entry: Pick<Entry, 'member' | 'granted' | 'reason'>): Words {
  if (entry.granted) return ['loyalty.places.reason.welcome', REASON_WORDS.welcome]
  if (entry.member === null) {
    const code = entry.reason in REFUSAL_WORDS ? entry.reason : 'unknown'
    return [`loyalty.places.refusal.${code}`, REFUSAL_WORDS[code]]
  }
  const code = entry.reason in REASON_WORDS && entry.reason !== 'welcome' ? entry.reason : 'unknown'
  return [`loyalty.places.reason.${code}`, REASON_WORDS[code]]
}

/** An entry's time on the venue's clock, from its wall-clock `YYYY-MM-DDTHH:mm` (never through `new Date()`). */
export const entryTime = (at: string): string => at.slice(11, 16)

/** The day before or after, never after the venue's today (entries are what happened). */
export function shiftDay(day: string, by: number, today: string): string {
  const next = addDays(day, by)
  return next > today ? today : next
}

/** A day the date field gave, or today for an empty or impossible one. */
export function pickedDay(value: string, today: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return today
  return value > today ? today : value
}

/** What the section says after a removal: deleted, or switched off because it has a history. */
export function removedWords(outcome: 'deleted' | 'switched_off', name: string): Words {
  return outcome === 'switched_off'
    ? ['loyalty.places.removed_off', '{{name}} has a history, so it was switched off instead. Its entries stay.', { name }]
    : ['loyalty.places.removed', '{{name}} was removed.', { name }]
}
