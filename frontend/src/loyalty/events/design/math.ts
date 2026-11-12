import type { EventBody, LoyaltyEventRow } from '../types'

/** Send only the fields edited here, preserving unrelated changes from another manager. */
export function eventChanges(next: EventBody, initial: EventBody): Partial<EventBody> {
  return Object.fromEntries(Object.entries(next).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(initial[key as keyof EventBody])))
}

/** Presentation of server phases and capacity; no access or attendance decision is made here. */
export function eventRowStatus(event: LoyaltyEventRow) {
  if (event.phase === 'cancelled') return { word: 'cancelled', tone: 'neutral' } as const
  if (event.phase === 'draft') return { word: 'draft', tone: 'amber' } as const
  if (event.phase === 'ended') return { word: 'ended', tone: 'neutral' } as const
  if (event.phase === 'on_now') return { word: 'onNow', tone: 'green' } as const
  if (event.counts.room_left === 0) return { word: 'full', tone: 'amber' } as const
  return { word: event.sign_up ? 'signupOpen' : 'noSignup', tone: 'green' } as const
}
