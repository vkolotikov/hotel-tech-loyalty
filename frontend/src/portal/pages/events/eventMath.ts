import { formatDay, resolveLocale } from '../../lib/dates'
import type { PortalEvent, PortalEvents } from './eventsApi'

/**
 * The member's events, decided here and tested by value (the portal's tests render to a string): what an event's
 * button says, its times in words (from the wall-clock strings, never through `new Date()`), the phrases that agree
 * with their number, the next event for Home, and the words for a refusal. The server decides who may sign up; this
 * only draws it.
 */

/** A phrase for t(): its key, the English, and the options (a plural family's `count` and its one-form fallback). */
export interface Phrase {
  key: string
  fallback: string
  options: Record<string, unknown>
}

export const EVENT_WORDS = {
  title: 'Events',
  line: 'What is on for members. Sign up where it asks, and show your card at the door.',
  coming_up: 'Coming up',
  attended: 'You came to',
  none: 'Nothing is planned right now.',
  none_body: 'New events show here as soon as they are announced.',
  load_failed: 'The events could not be loaded.',
  sign_up: 'Sign up',
  signed_up: 'You’re signed up',
  cancel: 'Cancel',
  cancel_sign_up: 'Cancel my sign-up',
  full: 'Full',
  checked_in: 'You’re checked in',
  come_along: 'No sign-up needed: just come along.',
  sign_up_needed: 'Sign up to get in.',
  started: 'It has started: if you cannot come, let the team know.',
  your_next: 'Your next event',
  next_up: 'Coming up',
  see_all: 'See events',
  link: 'Events',
  when: '{{day}} · {{time}}',
  from_to: 'From {{from}} to {{to}}',
} as const

/** Why the member cannot sign up, in their words (EventSignUp's codes; a code without a word reads as `closed`). */
export const WHY_WORDS: Record<string, string> = {
  event_full: 'Full',
  tier_not_allowed: 'For other membership levels',
  membership_expired: 'Your membership ends before this event',
  inactive: 'Your membership is switched off',
  already_in: 'You’re checked in',
  sign_up_closed: 'Sign-up has closed',
  closed: 'Sign-up has closed',
}

/** What a failed sign-up or cancel says (the server's refusals; anything else reads as `unknown`). */
export const ERROR_WORDS: Record<string, string> = {
  event_full: 'Sorry, the last place has just gone.',
  tier_not_allowed: 'This event is for other membership levels.',
  membership_expired: 'Your membership ends before this event. Ask the team to renew it.',
  inactive: 'Your membership is switched off. Please contact the team.',
  sign_up_closed: 'Sign-up for this event has closed.',
  cancel_closed: 'The event has started, so the sign-up cannot be cancelled here. Please let the team know.',
  already_in: 'You’re already checked in.',
  not_signed_up: 'You were not signed up.',
  not_found: 'This event is no longer listed.',
  unknown: 'That did not work. Please try again.',
}

/** Phrases with a number that must agree with it, as [one, other]; `{{n}}` is the number as the language writes it. */
export const EVENT_COUNTED = {
  points: ['+{{n}} point', '+{{n}} points'],
  places_left: ['{{n}} place left', '{{n}} places left'],
} as const satisfies Record<string, readonly [string, string]>

export function counted(key: keyof typeof EVENT_COUNTED, count: number, locale: string): Phrase {
  return {
    key: `portal.events.${key}`,
    fallback: EVENT_COUNTED[key][1],
    options: { count, n: count.toLocaleString(resolveLocale(locale)), defaultValue_one: EVENT_COUNTED[key][0] },
  }
}

const dateOf = (wall: string) => wall.slice(0, 10)
const timeOf = (wall: string) => wall.slice(11, 16)

/** "18:00–21:00"; across days, the days too ("Fri 9 Oct 22:00 – Sat 10 Oct 02:00"). */
export function timeRange(e: Pick<PortalEvent, 'starts_at' | 'ends_at'>, locale: string): string {
  if (dateOf(e.starts_at) === dateOf(e.ends_at)) return `${timeOf(e.starts_at)}–${timeOf(e.ends_at)}`
  const day = (wall: string) => formatDay(dateOf(wall), locale, { weekday: 'short', day: 'numeric', month: 'short' })
  return `${day(e.starts_at)} ${timeOf(e.starts_at)} – ${day(e.ends_at)} ${timeOf(e.ends_at)}`
}

/** The day of an event in words ("Fri 9 Oct"). */
export function dayText(wall: string, locale: string): string {
  return formatDay(dateOf(wall), locale, { weekday: 'short', day: 'numeric', month: 'short' })
}

/** When, in one line: "Fri 9 Oct · 18:00–21:00", or across days "From Fri 9 Oct 22:00 to Sat 10 Oct 02:00". */
export function whenPhrase(e: Pick<PortalEvent, 'starts_at' | 'ends_at'>, locale: string): Phrase {
  if (dateOf(e.starts_at) === dateOf(e.ends_at)) {
    return { key: 'portal.events.when', fallback: EVENT_WORDS.when, options: { day: dayText(e.starts_at, locale), time: timeRange(e, locale) } }
  }
  const at = (wall: string) => `${dayText(wall, locale)} ${timeOf(wall)}`
  return { key: 'portal.events.from_to', fallback: EVENT_WORDS.from_to, options: { from: at(e.starts_at), to: at(e.ends_at) } }
}

/** A card's date block: "FRI", "9", "OCT". */
export function dateBlock(wall: string, locale: string): { weekday: string; day: string; month: string } {
  const d = dateOf(wall)
  return {
    weekday: formatDay(d, locale, { weekday: 'short' }),
    day: formatDay(d, locale, { day: 'numeric' }),
    month: formatDay(d, locale, { month: 'short' }),
  }
}

/** What an event's card offers the member. */
export type EventAction =
  | { kind: 'checked_in' }
  | { kind: 'signed_up'; canCancel: boolean }
  | { kind: 'sign_up' }
  | { kind: 'full' }
  | { kind: 'why_not'; code: string }
  | { kind: 'come_along' }

export function actionOf(e: PortalEvent): EventAction {
  if (e.checked_in) return { kind: 'checked_in' }
  if (e.my === 'signed_up') return { kind: 'signed_up', canCancel: e.can_cancel }
  if (!e.sign_up) return { kind: 'come_along' }
  if (e.can_sign_up) return { kind: 'sign_up' }
  if (e.why_not === 'event_full') return { kind: 'full' }
  return { kind: 'why_not', code: e.why_not && e.why_not in WHY_WORDS ? e.why_not : 'closed' }
}

/** The line under the button for an event that takes sign-ups: how many places are left, or that sign-up is needed. */
export function noteOf(e: PortalEvent, locale: string): Phrase | null {
  const action = actionOf(e)
  if (action.kind === 'signed_up' && !action.canCancel) return { key: 'portal.events.started', fallback: EVENT_WORDS.started, options: {} }
  if (action.kind !== 'sign_up') return null
  if (e.room_left !== null) return counted('places_left', e.room_left, locale)
  return e.walk_ins ? null : { key: 'portal.events.sign_up_needed', fallback: EVENT_WORDS.sign_up_needed, options: {} }
}

/**
 * Home's event: the next one the member signed up for; else, so they know there is one, the next event open to them.
 * Null when there is none.
 */
export function nextEvent(data: PortalEvents | undefined): { event: PortalEvent; mine: boolean } | null {
  if (!data) return null
  const mine = data.upcoming.find(e => e.my === 'signed_up' && !e.checked_in)
  if (mine) return { event: mine, mine: true }
  const any = data.upcoming[0]
  return any ? { event: any, mine: false } : null
}

/** The words for a refused sign-up or cancel. */
export function errorPhrase(code: string | null): Phrase {
  const c = code && code in ERROR_WORDS ? code : 'unknown'
  return { key: `portal.events.error.${c}`, fallback: ERROR_WORDS[c], options: {} }
}

/** The words for why the member cannot sign up. */
export function whyPhrase(code: string): Phrase {
  return { key: `portal.events.why.${code}`, fallback: WHY_WORDS[code] ?? WHY_WORDS.closed, options: {} }
}
