import { formatDay, resolveLocale } from '../lib/dates'
import { vocabIndustry } from '../lib/vocab'
import type { BookingKind, PortalCapabilities } from '../lib/types'

/**
 * Home's decisions, tested by value (the portal's tests render to a string): what the next-booking heading says, and
 * the venue's day of an instant.
 */

/**
 * The next-booking heading, one whole sentence per kind and industry so every language can make its words agree
 * ("Ваша ближайшая запись", "Su próxima cita"): a stay says stay wherever it was booked; an appointment uses the
 * venue's word for it. A hotel's appointment is an appointment (its word for a booking is "stay").
 */
export const NEXT_WORDS = {
  stay: 'Your next stay',
  hotel: 'Your next appointment',
  beauty: 'Your next appointment',
  medical: 'Your next appointment',
  restaurant: 'Your next reservation',
  fitness: 'Your next session',
  other: 'Your next appointment',
} as const

export type NextHeading = keyof typeof NEXT_WORDS

/**
 * Which sentence heads the next booking: by the booking shown (a stay or an appointment); with none, by what the venue
 * sells (a venue that sells only stays waits for a stay).
 */
export function nextHeading(kind: BookingKind | null | undefined, capabilities: Pick<PortalCapabilities, 'services' | 'stays'>, industry: string | null | undefined): { key: string; fallback: string } {
  const stay = kind ? kind === 'stay' : capabilities.stays && !capabilities.services
  const which: NextHeading = stay ? 'stay' : vocabIndustry(industry)
  return { key: `portal.home.next.${which}`, fallback: NEXT_WORDS[which] }
}

/**
 * The day of an instant (a points line's `created_at`) on the venue's calendar, where the member earned it — not the
 * UTC day the string starts with. A plain date (`2026-10-03`) is a calendar day already and is written as it is.
 */
export function instantDay(value: string, locale: string, timeZone?: string): string {
  if (!/T|\d \d/.test(value)) return formatDay(value, locale)
  const at = new Date(value)
  if (Number.isNaN(at.getTime())) return formatDay(value, locale)
  try {
    return new Intl.DateTimeFormat(resolveLocale(locale), { day: 'numeric', month: 'short', year: 'numeric', timeZone }).format(at)
  } catch {
    return formatDay(value, locale)
  }
}
