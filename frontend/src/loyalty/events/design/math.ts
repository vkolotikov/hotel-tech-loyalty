import type { EventBody } from '../types'

/** Send only the fields edited here, preserving unrelated changes from another manager. */
export function eventChanges(next: EventBody, initial: EventBody): Partial<EventBody> {
  return Object.fromEntries(Object.entries(next).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(initial[key as keyof EventBody])))
}
