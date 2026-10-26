import { addDays, hhmm, minutesOf, timeOf, venueNow } from '../../workspace/lib/wallClock'
import type { EventRow, PlaceRow } from './scanApi'

/**
 * What the scan screen is scanning for (release 8, spec 2026-10-25 §2): the desk (find a member and act), a place
 * (who may enter), or an event (check-in). Remembered on this device under `loyalty:scan-context`, so a tablet at the
 * spa opens on the spa; a remembered place or event that is gone, switched off or over falls back to the desk. Pure
 * except `loadContext`/`saveContext`, which reach the storage and never throw.
 */
export type ScanContext = { kind: 'desk' } | { kind: 'place'; id: number } | { kind: 'event'; id: number }

export const CONTEXT_KEY = 'loyalty:scan-context'

export const DESK: ScanContext = { kind: 'desk' }

const isId = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0

/** The stored text as a context; anything else (nothing, broken JSON, an unknown kind, a bad id) is the desk. */
export function parseContext(raw: string | null | undefined): ScanContext {
  if (!raw) return DESK
  try {
    const v = JSON.parse(raw) as { kind?: unknown; id?: unknown } | null
    if (v && (v.kind === 'place' || v.kind === 'event') && isId(v.id)) return { kind: v.kind, id: v.id }
  } catch {
    // Not JSON: the desk.
  }
  return DESK
}

export function serialiseContext(context: ScanContext): string {
  return JSON.stringify(context.kind === 'desk' ? { kind: 'desk' } : { kind: context.kind, id: context.id })
}

type Reader = Pick<Storage, 'getItem'>
type Writer = Pick<Storage, 'setItem'>

function deviceStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

/** The context this device remembers; the desk where storage is missing or blocked (a private window, a preview). */
export function loadContext(storage: Reader | null = deviceStorage()): ScanContext {
  try {
    return parseContext(storage?.getItem(CONTEXT_KEY) ?? null)
  } catch {
    return DESK
  }
}

export function saveContext(context: ScanContext, storage: Writer | null = deviceStorage()): void {
  try {
    storage?.setItem(CONTEXT_KEY, serialiseContext(context))
  } catch {
    // Blocked storage: the choice lasts as long as the page.
  }
}

/**
 * A context named in the address (`?place=3`, `?event=5`, `?desk`): an event's Start check-in and door mode's own
 * address; null when the address names none.
 */
export function contextFromSearch(search: string): ScanContext | null {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  const id = (name: string) => {
    const raw = params.get(name)
    if (raw === null || !/^\d{1,10}$/.test(raw)) return null
    const n = Number(raw)
    return n > 0 ? n : null
  }
  const event = id('event')
  if (event !== null) return { kind: 'event', id: event }
  const place = id('place')
  if (place !== null) return { kind: 'place', id: place }
  return params.has('desk') ? DESK : null
}

/** The address part that names a context: `?place=3`, `?event=5`, nothing for the desk. */
export function contextSearch(context: ScanContext): string {
  return context.kind === 'desk' ? '' : `?${context.kind}=${context.id}`
}

/** Where door mode opens for this context (its address names it, so a tablet's bookmark keeps it). */
export function doorPath(context: ScanContext): string {
  return `/loyalty/scan/door${contextSearch(context)}`
}

export function sameContext(a: ScanContext, b: ScanContext): boolean {
  return a.kind === b.kind && (a.kind === 'desk' || a.id === (b as { id: number }).id)
}

/**
 * Today's events one can scan for now: published, not over (its end after the venue's now), starting today or
 * earlier (an event that runs past midnight is still open) — or just after midnight with its doors already open (two
 * hours before its start, release 9) — soonest first. Times are compared as the venue's wall clock, as text:
 * `YYYY-MM-DDTHH:mm` sorts as it reads.
 */
export function openEvents(events: readonly EventRow[], nowWall: string): EventRow[] {
  const today = nowWall.slice(0, 10)
  return events
    .filter(e => e.status === 'published' && e.ends_at > nowWall && (e.starts_at.slice(0, 10) <= today || opensAt(e.starts_at) <= nowWall))
    .slice()
    .sort((a, b) => (a.starts_at < b.starts_at ? -1 : a.starts_at > b.starts_at ? 1 : a.id - b.id))
}

export function activePlaces(places: readonly PlaceRow[]): PlaceRow[] {
  return places.filter(p => p.is_active)
}

export interface Resolved {
  context: ScanContext
  place: PlaceRow | null
  event: EventRow | null
  /** The lists that would confirm the context have not loaded (or could not): the context is kept as wanted. */
  pending: boolean
}

/**
 * The context to scan for, given the lists loaded so far (undefined: not loaded): the desk as it is; a place that is
 * listed and switched on; an event among today's open ones (`openEvents`). One that is not there falls back to the
 * desk. While its list is unknown the wanted context is kept (the server decides each scan anyway).
 */
export function resolveContext(wanted: ScanContext, places: readonly PlaceRow[] | undefined, events: readonly EventRow[] | undefined): Resolved {
  if (wanted.kind === 'place') {
    if (places === undefined) return { context: wanted, place: null, event: null, pending: true }
    const place = places.find(p => p.id === wanted.id && p.is_active) ?? null
    return place ? { context: wanted, place, event: null, pending: false } : { context: DESK, place: null, event: null, pending: false }
  }
  if (wanted.kind === 'event') {
    if (events === undefined) return { context: wanted, place: null, event: null, pending: true }
    const event = events.find(e => e.id === wanted.id) ?? null
    return event ? { context: wanted, place: null, event, pending: false } : { context: DESK, place: null, event: null, pending: false }
  }
  return { context: DESK, place: null, event: null, pending: false }
}

/** The venue's now as its wall clock (`YYYY-MM-DDTHH:mm`), to compare with an event's times as text. */
export function venueWallNow(timeZone: string, at: Date = new Date()): string {
  const now = venueNow(timeZone, at)
  return `${now.date}T${hhmm(now.minutes)}`
}

/** An event's hours as the venue reads them: `18:00–23:00` (the wall clock's own digits, never converted). */
export function eventHours(event: Pick<EventRow, 'starts_at' | 'ends_at'>): string {
  return `${timeOf(event.starts_at)}–${timeOf(event.ends_at)}`
}

/** Whether an event's check-in is open at the venue's now (§1: from two hours before its start to its end). */
export function checkInOpen(event: Pick<EventRow, 'starts_at' | 'ends_at' | 'status'>, nowWall: string): boolean {
  return event.status === 'published' && nowWall >= opensAt(event.starts_at) && nowWall < event.ends_at
}

/** How long before an event's start its check-in opens (AccessDecision, spec §1). */
export const CHECK_IN_OPENS_BEFORE_MIN = 120

/** The wall-clock moment an event's check-in opens: two hours before its start, on the previous day if need be. */
export function opensAt(startsAt: string): string {
  const minutes = minutesOf(timeOf(startsAt)) - CHECK_IN_OPENS_BEFORE_MIN
  const day = startsAt.slice(0, 10)
  return minutes >= 0 ? `${day}T${hhmm(minutes)}` : `${addDays(day, -1)}T${hhmm(minutes + 1440)}`
}
