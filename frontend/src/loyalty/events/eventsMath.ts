import { addDays, dateOf, formatDate, isDateKey, minutesOf, timeOf, type DateKey, type Wall } from '../../workspace/lib/wallClock'
import type { Problems, Tone } from '../lib/forms'
import { points as grouped } from '../lib/format'
import type { CheckInAnswer, EventBody, EventPerson, EventPhase, EventsTab, LoyaltyEventRow } from './types'
import { COUNTED, OUTSIDE_WORDS, PERSON_WORDS, REASON_WORDS, type CountedKey } from './words'

/**
 * The Events area's decisions (release 8, spec 2026-10-25 §4), kept out of the components so they can be tested by
 * value (the workspace's tests render to a string): the tabs, an event's times as words (from the wall-clock strings,
 * never through `new Date()`), its numbers, what its page offers, the one dialog's defaults, checks and body, the
 * check-in's sentence, and Scan's "Scanning for" hand-over.
 */

/** react-i18next's `t` as the pure sentences take it. */
export type Say = (key: string, fallback: string, vars?: Record<string, unknown>) => string

// ─── The tabs ─────────────────────────────────────────────────────────────

export const EVENT_TABS = ['upcoming', 'past', 'drafts'] as const satisfies readonly EventsTab[]

/** The tab an address names (`?tab=drafts`); Upcoming for none or anything else. */
export function tabFrom(search: string): EventsTab {
  const tab = new URLSearchParams(search).get('tab')
  return (EVENT_TABS as readonly string[]).includes(tab ?? '') ? (tab as EventsTab) : 'upcoming'
}

export function searchFor(tab: EventsTab): string {
  return tab === 'upcoming' ? '' : `?tab=${tab}`
}

/** The tab the arrow keys, Home and End move to (they wrap); null for any other key. */
export function tabAfter(current: EventsTab, key: string): EventsTab | null {
  const i = EVENT_TABS.indexOf(current)
  const n = EVENT_TABS.length
  if (key === 'ArrowRight') return EVENT_TABS[(i + 1) % n]
  if (key === 'ArrowLeft') return EVENT_TABS[(i - 1 + n) % n]
  if (key === 'Home') return EVENT_TABS[0]
  if (key === 'End') return EVENT_TABS[n - 1]
  return null
}

// ─── Times as words ───────────────────────────────────────────────────────

/** A card's date block: "FRI", "9", "OCT" — read from the wall-clock string. */
export function dateBlock(start: Wall, locale: string): { weekday: string; day: string; month: string } {
  const date = dateOf(start)
  return {
    weekday: formatDate(date, locale, { weekday: 'short' }),
    day: formatDate(date, locale, { day: 'numeric' }),
    month: formatDate(date, locale, { month: 'short' }),
  }
}

/** "18:00–21:00"; across days, the days too: "Fri, Oct 9, 22:00 – Sat, Oct 10, 02:00". */
export function timeRange(start: Wall, end: Wall, locale: string): string {
  if (dateOf(start) === dateOf(end)) return `${timeOf(start)}–${timeOf(end)}`
  const day = (wall: Wall) => formatDate(dateOf(wall), locale, { weekday: 'short', day: 'numeric', month: 'short' })
  return `${day(start)}, ${timeOf(start)} – ${day(end)}, ${timeOf(end)}`
}

/** The whole "when": "Friday, October 9, 2026 · 18:00–21:00" (the day once, unless the event runs across days). */
export function whenLine(start: Wall, end: Wall, locale: string): string {
  const day = formatDate(dateOf(start), locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  return dateOf(start) === dateOf(end) ? `${day} · ${timeRange(start, end, locale)}` : timeRange(start, end, locale)
}

/** Where, in words: the place's name, else the written location, else null. */
export function whereOf(event: Pick<LoyaltyEventRow, 'place' | 'location'>): string | null {
  return event.place?.name ?? event.location ?? null
}

/** The venue's wall clock now, as the server writes times. */
export function wallNow(now: { date: DateKey; minutes: number }): Wall {
  return `${now.date}T${String(Math.floor(now.minutes / 60)).padStart(2, '0')}:${String(now.minutes % 60).padStart(2, '0')}`
}

// ─── Numbers ──────────────────────────────────────────────────────────────

/** A counted phrase in the language's own plural form ("1 place left", "2 places left"; «2 места», «5 мест»). */
export function counted(say: Say, key: CountedKey, count: number, locale: string): string {
  const [one, other] = COUNTED[key]
  return say(`loyalty.events.count.${key}`, other, { count, n: grouped(count, locale), defaultValue_one: one })
}

/**
 * The numbers an event's card shows: with sign-up, "12 signed up · 40 places left" (no places part without a
 * capacity); once people came, how many checked in; without sign-up and nobody in yet, the capacity if there is one.
 */
export function numbersLine(event: LoyaltyEventRow, say: Say, locale: string): string[] {
  const c = event.counts
  const out: string[] = []
  if (event.sign_up) out.push(counted(say, 'signed_up', c.signed_up, locale))
  if (c.checked_in > 0) out.push(counted(say, 'checked_in', c.checked_in, locale))
  if (c.room_left !== null && event.phase !== 'ended' && event.phase !== 'cancelled') out.push(counted(say, 'places_left', c.room_left, locale))
  else if (event.capacity !== null && out.length === 0) out.push(counted(say, 'places', event.capacity, locale))
  return out
}

/** The badge's tone for each phase (theme/loyalty.css `[data-state]`). */
export function phaseTone(phase: EventPhase): Tone {
  switch (phase) {
    case 'draft': return 'pending'
    case 'upcoming': return 'approved'
    case 'on_now': return 'fulfilled'
    case 'cancelled': return 'declined'
    default: return 'cancelled'
  }
}

// ─── What the event's page offers ─────────────────────────────────────────

export interface EventActions {
  edit: boolean
  publish: boolean
  cancel: boolean
  remove: boolean
  /** Start check-in (Scan with this event chosen) and Check in by name. */
  checkIn: boolean
  /** Add a member (a sign-up by staff). */
  addMember: boolean
  /** Cancel a person's sign-up from the list. */
  cancelSignUp: boolean
}

/**
 * Who may do what on the event's page: changes (edit, publish, cancel, delete a draft) are for `can_change` (a manager,
 * or `can_manage_offers`); checking in and signing members up are every staff member's, while the event is published
 * and not over. A draft that has already ended is not offered Publish (the server would say `event_ended`).
 */
export function eventActions(event: LoyaltyEventRow, canChange: boolean, now: Wall): EventActions {
  const live = event.status === 'published' && event.phase !== 'ended'
  return {
    edit: canChange && event.status !== 'cancelled',
    publish: canChange && event.status === 'draft' && event.ends_at > now,
    cancel: canChange && live,
    remove: canChange && event.status === 'draft',
    checkIn: live,
    addMember: live && event.sign_up,
    cancelSignUp: live,
  }
}

// ─── Scan's "Scanning for" ────────────────────────────────────────────────

/** Where Scan reads its "Scanning for" choice (part D's scan screen). */
export const SCAN_CONTEXT_KEY = 'loyalty:scan-context'

/** Scan's choice for this event, as Scan stores it. */
export function scanContextFor(eventId: number): string {
  return JSON.stringify({ kind: 'event', id: eventId })
}

/** Scan with this event chosen — the address carries it, so it works where the device's storage is blocked. */
export function scanPathFor(eventId: number): string {
  return `/loyalty/scan?event=${eventId}`
}

/** Door mode for this event: the full-screen scanner for a tablet at the entrance. */
export function doorPathFor(eventId: number): string {
  return `/loyalty/scan/door?event=${eventId}`
}

// ─── The one dialog ───────────────────────────────────────────────────────

export interface EventForm {
  title: string
  description: string
  date: DateKey
  start: string
  /** On when the event ends on a later day than it starts. */
  later_day: boolean
  end_date: DateKey
  end: string
  where: 'place' | 'location' | 'none'
  place_id: number | null
  location: string
  admits: 'all' | 'tiers'
  tier_ids: number[]
  points: string
  counts_as_visit: boolean
  sign_up: boolean
  capacity: string
  walk_ins: boolean
}

export const MAX_POINTS = 100000
export const MAX_CAPACITY = 100000
export const MAX_DAYS = 14

/**
 * A new event's defaults: tonight from 18:00 to 21:00 on the venue's clock (tomorrow once 18:00 has passed), every
 * member, 50 points, counted as a visit, no sign-up, walk-ins welcome. Where is left unsaid until it is chosen (a
 * venue with places picks one from the list; one without writes it).
 */
export function newForm(now: { date: DateKey; minutes: number }, hasPlaces = false): EventForm {
  const date = now.minutes < 18 * 60 ? now.date : addDays(now.date, 1)
  return {
    title: '', description: '', date, start: '18:00', later_day: false, end_date: date, end: '21:00',
    where: hasPlaces ? 'none' : 'location', place_id: null, location: '',
    admits: 'all', tier_ids: [], points: '50', counts_as_visit: true, sign_up: false, capacity: '', walk_ins: true,
  }
}

/** A saved event as the dialog holds it. */
export function formOf(event: LoyaltyEventRow): EventForm {
  const date = dateOf(event.starts_at)
  const endDate = dateOf(event.ends_at)
  return {
    title: event.title,
    description: event.description ?? '',
    date,
    start: timeOf(event.starts_at),
    later_day: endDate !== date,
    end_date: endDate,
    end: timeOf(event.ends_at),
    where: event.place ? 'place' : event.location ? 'location' : 'none',
    place_id: event.place?.id ?? null,
    location: event.location ?? '',
    admits: event.admits,
    tier_ids: event.tiers.map(t => t.id).sort((a, b) => a - b),
    points: String(event.points),
    counts_as_visit: event.counts_as_visit,
    sign_up: event.sign_up,
    capacity: event.capacity !== null ? String(event.capacity) : '',
    walk_ins: event.walk_ins,
  }
}

const isTime = (text: string): boolean => /^([01]\d|2[0-3]):[0-5]\d$/.test(text)
const whole = (text: string): number | null => (/^\d+$/.test(text.trim()) ? Number(text.trim()) : null)

/** The event's start and end as the server takes them (the end on the start's day unless "Ends on a later day"). */
export function wallsOf(form: EventForm): { starts_at: Wall; ends_at: Wall } {
  return { starts_at: `${form.date}T${form.start}`, ends_at: `${form.later_day ? form.end_date : form.date}T${form.end}` }
}

/** What is wrong with the form before sending: each field and the code of its sentence (words.ts PROBLEM_WORDS). */
export function formProblems(form: EventForm): Problems {
  const out: Problems = {}
  if (form.title.trim() === '') out.title = 'title'
  if (form.description.length > 2000) out.description = 'description'
  if (!isDateKey(form.date)) out.date = 'date'
  if (!isTime(form.start)) out.start = 'start'
  if (!isTime(form.end) || (form.later_day && !isDateKey(form.end_date))) out.end = 'end'
  if (!out.date && !out.start && !out.end) {
    const { starts_at, ends_at } = wallsOf(form)
    if (ends_at <= starts_at) out.end = 'ends_at'
    else if (ends_at > `${addDays(form.date, MAX_DAYS)}T${form.start}`) out.end = 'too_long'
  }
  if (form.where === 'place' && form.place_id === null) out.place_id = 'place_id'
  if (form.where === 'location' && form.location.trim().length > 200) out.location = 'location'
  if (form.admits === 'tiers' && form.tier_ids.length === 0) out.tier_ids = 'tier_ids'
  const pts = whole(form.points)
  if (pts === null || pts > MAX_POINTS) out.points = 'points'
  if (form.capacity.trim() !== '') {
    const cap = whole(form.capacity)
    if (cap === null || cap < 1 || cap > MAX_CAPACITY) out.capacity = 'capacity'
  }
  if (!form.sign_up && !form.walk_ins) out.walk_ins = 'walk_ins'
  return out
}

/** The server's field errors, by the dialog's own fields. */
export const EVENT_FIELDS: Record<string, string> = {
  title: 'title', description: 'description', starts_at: 'start', ends_at: 'ends_at', place_id: 'place_id', location: 'location',
  tier_ids: 'tier_ids', points: 'points', capacity: 'capacity', walk_ins: 'walk_ins',
}

/** Where a server field error shows in the dialog (`starts_at` beside the start, `ends_at` beside the end). */
export const FIELD_OF: Record<string, keyof Problems> = { start: 'start', ends_at: 'end' }

/** What the dialog sends. */
export function bodyOf(form: EventForm): EventBody {
  const location = form.location.trim()
  return {
    title: form.title.trim(),
    description: form.description.trim() || null,
    ...wallsOf(form),
    place_id: form.where === 'place' ? form.place_id : null,
    location: form.where === 'location' && location !== '' ? location : null,
    admits: form.admits,
    tier_ids: form.admits === 'tiers' ? form.tier_ids : [],
    points: whole(form.points) ?? 0,
    counts_as_visit: form.counts_as_visit,
    sign_up: form.sign_up,
    walk_ins: form.walk_ins,
    capacity: form.capacity.trim() === '' ? null : whole(form.capacity),
  }
}

/** "Ends the next day", said under the times when an event runs past midnight. */
export function endsLater(form: EventForm): number {
  if (!form.later_day || !isDateKey(form.date) || !isDateKey(form.end_date)) return 0
  let n = 0
  for (let d = form.date; d < form.end_date && n <= MAX_DAYS + 1; d = addDays(d, 1)) n++
  return n
}

/** The minutes an event lasts, for the dialog's summary ("3 h"); null while the times are not whole. */
export function durationMinutes(form: EventForm): number | null {
  if (!isTime(form.start) || !isTime(form.end)) return null
  const days = form.later_day ? endsLater(form) : 0
  const total = days * 1440 + minutesOf(form.end) - minutesOf(form.start)
  return total > 0 ? total : null
}

/**
 * Who a change of a published event's tiers would leave out (the server's 409 `signed_up_outside`, with `count` and up
 * to five `members` names): "Signed up and left out: Grace Hopper and 3 others." Null when the refusal names nobody.
 */
export function outsideLine(extra: Record<string, unknown>, say: Say, locale: string): string | null {
  const names = Array.isArray(extra.members) ? extra.members.filter((n): n is string => typeof n === 'string' && n !== '') : []
  if (names.length === 0) return null
  const count = typeof extra.count === 'number' && extra.count > names.length ? extra.count : names.length
  return count > names.length
    ? say('loyalty.events.outside.some', OUTSIDE_WORDS.some, { names: names.join(', '), others: counted(say, 'others', count - names.length, locale) })
    : say('loyalty.events.outside.all', OUTSIDE_WORDS.all, { names: names.join(', ') })
}

// ─── Check-in by name ─────────────────────────────────────────────────────

export interface CheckInSaid {
  tone: 'success' | 'info' | 'danger'
  text: string
  /** "+50 points" when this check-in gave points. */
  points: string | null
}

/** What a check-in answered, as a sentence: checked in, in already (when), or the reason it was refused. */
export function checkInSentence(answer: CheckInAnswer, name: string, say: Say, locale: string): CheckInSaid {
  const v = answer.verdict
  if (v.granted && answer.already_in) {
    return { tone: 'info', text: say('loyalty.events.reason.already_in', REASON_WORDS.already_in, { name, time: answer.already_in }), points: null }
  }
  if (v.granted) {
    return {
      tone: 'success',
      text: say('loyalty.events.reason.welcome', REASON_WORDS.welcome, { name }),
      points: answer.points > 0 ? counted(say, 'points_plus', answer.points, locale) : null,
    }
  }
  const reason = v.reason in REASON_WORDS ? v.reason : 'unknown'
  const vars = {
    name,
    date: v.valid_until ? formatDate(v.valid_until, locale, { day: 'numeric', month: 'short', year: 'numeric' }) : '',
    tiers: v.allowed_tiers.join(', '),
    tier: v.tier?.name ?? '',
  }
  return { tone: 'danger', text: say(`loyalty.events.reason.${reason}`, REASON_WORDS[reason], vars), points: null }
}

// ─── The people ───────────────────────────────────────────────────────────

export type PersonState = 'in' | 'walk_in' | 'signed_up' | 'cancelled'

/**
 * A person's state on the list: checked in (signed up), a walk-in, signed up and not in yet, or cancelled. At an event
 * without sign-up everyone simply came in: nobody is called a walk-in there.
 */
export function personState(p: EventPerson, signUp = true): PersonState {
  if (p.checked_in_at !== null) return p.walk_in && signUp ? 'walk_in' : 'in'
  return p.cancelled_at !== null ? 'cancelled' : 'signed_up'
}

/** The person's state in words: "Checked in 19:02", "Walk-in · 19:05", "Signed up", "Cancelled". */
export function personLine(p: EventPerson, say: Say, signUp = true): string {
  const state = personState(p, signUp)
  return say(`loyalty.events.person.${state}`, PERSON_WORDS[state], { time: p.checked_in_at ?? '' })
}

/**
 * The list in its groups, in the server's order: signed up (in or not yet), walk-ins, cancelled. At an event without
 * sign-up, the walk-ins are simply everyone who came in (`walkIns`, titled "Checked in" there).
 */
export function peopleGroups(people: EventPerson[], signUp = true): { signedUp: EventPerson[]; walkIns: EventPerson[]; cancelled: EventPerson[] } {
  const came = (p: EventPerson) => p.checked_in_at !== null && (p.walk_in || !signUp)
  return {
    signedUp: people.filter(p => !came(p) && ['in', 'signed_up'].includes(personState(p, signUp))),
    walkIns: people.filter(came),
    cancelled: people.filter(p => !came(p) && personState(p, signUp) === 'cancelled'),
  }
}
