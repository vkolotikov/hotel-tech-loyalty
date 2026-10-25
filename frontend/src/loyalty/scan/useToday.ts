import { useQuery } from '@tanstack/react-query'
import { entriesKey, peopleKey, scanApi } from './scanApi'
import type { ScanContext } from './scanContext'
import { entryLine, peopleLines, TODAY_LINES, type TodayLine } from './verdict'

export interface Today {
  lines: TodayLine[]
  /** A place: let in and refused today; an event: checked in, signed up, walk-ins and the room left. */
  counts: { kind: 'place'; granted: number; denied: number } | { kind: 'event'; checkedIn: number; signedUp: number; walkIns: number; roomLeft: number | null } | null
  isLoading: boolean
  isError: boolean
}

/**
 * Who came in today at the place or event being scanned for: a place's entries (`GET places/{id}/entries`, the venue
 * day's, newest first) or an event's people (`GET events/{id}/people`). Each scan invalidates it (scanApi `afterScan`);
 * it also refreshes each minute, for the scans of the other doors.
 */
export function useToday(context: ScanContext, timeZone: string): Today {
  const placeId = context.kind === 'place' ? context.id : 0
  const eventId = context.kind === 'event' ? context.id : 0
  const entries = useQuery({ queryKey: entriesKey(placeId), queryFn: () => scanApi.entries(placeId), enabled: placeId > 0, refetchInterval: 60_000, retry: 1 })
  const people = useQuery({ queryKey: peopleKey(eventId), queryFn: () => scanApi.people(eventId), enabled: eventId > 0, refetchInterval: 60_000, retry: 1 })

  if (placeId > 0) {
    const data = entries.data
    return {
      lines: data ? data.entries.slice(0, TODAY_LINES).map(e => entryLine(e, timeZone)) : [],
      counts: data ? { kind: 'place', granted: data.counts.granted, denied: data.counts.denied } : null,
      isLoading: entries.isPending, isError: entries.isError,
    }
  }
  if (eventId > 0) {
    const data = people.data
    return {
      lines: data ? peopleLines(data.people, timeZone) : [],
      counts: data ? { kind: 'event', checkedIn: data.counts.checked_in, signedUp: data.counts.signed_up, walkIns: data.counts.walk_ins, roomLeft: data.counts.room_left } : null,
      isLoading: people.isPending, isError: people.isError,
    }
  }
  return { lines: [], counts: null, isLoading: false, isError: false }
}
