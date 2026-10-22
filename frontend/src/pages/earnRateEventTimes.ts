import { format } from 'date-fns'
import { formatWallTime } from '../lib/venueTime'

/**
 * The full admin's boost times (HexaTech Loyalty release 4, R4-6). The form's datetime-local holds the venue's wall
 * clock and is sent without an offset; the server reads that as the venue's clock and stores the instant, and answers
 * each event with its instants on the venue's clock (`starts_at_venue`, `ends_at_venue`, `YYYY-MM-DDTHH:mm`). The page
 * edits and lists those, so one boost reads the same time in the form, in the list and in HexaTech Loyalty, whatever
 * this computer's zone. Before the fix the form showed the instant's UTC digits and the list the browser's zone.
 */
export interface BoostTimes {
  starts_at?: string | null
  ends_at?: string | null
  starts_at_venue?: string | null
  ends_at_venue?: string | null
}

const WALL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

/** What the form holds for a saved time: the venue's wall clock; from a server without it, the instant's digits as before. */
export function formWall(venue: string | null | undefined, instant: string | null | undefined): string {
  if (venue && WALL.test(venue)) return venue
  return instant ? instant.slice(0, 16) : ''
}

/** A time in the list, "Oct 9, 18:00" on the venue's clock; from a server without it, the browser's as before. */
export function listWall(venue: string | null | undefined, instant: string | null | undefined): string {
  if (venue && WALL.test(venue)) {
    return formatWallTime(venue, 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  }
  return instant ? format(new Date(instant), 'MMM d, HH:mm') : ''
}
