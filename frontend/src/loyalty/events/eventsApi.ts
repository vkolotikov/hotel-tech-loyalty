import type { QueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { loyaltyUrl, watched } from '../lib/api'
import type { CheckInAnswer, EventBody, EventOne, EventPeople, EventPerson, EventsList, EventsTab, LoyaltyEventRow } from './types'

/**
 * Events (release 8, spec 2026-10-25 §4): the list, one event, the dialog's saves, the event's life, its people,
 * sign-ups by staff and check-in by name. Every call is Loyalty's own (`loyaltyUrl`, `brand_id=all`).
 */
export const eventsApi = {
  list: (tab: EventsTab, page: number, filters: Record<string, string> = {}): Promise<EventsList> =>
    watched(api.get(loyaltyUrl('events'), { params: { when: tab, ...filters, ...(page > 1 ? { page } : {}) } })),
  one: (id: number): Promise<EventOne> => watched(api.get(loyaltyUrl(`events/${id}`))),
  create: (body: EventBody & { publish: boolean; idempotency_key: string }): Promise<{ event: LoyaltyEventRow }> =>
    watched(api.post(loyaltyUrl('events'), body)),
  update: (id: number, body: Partial<EventBody>): Promise<{ event: LoyaltyEventRow }> => watched(api.put(loyaltyUrl(`events/${id}`), body)),
  publish: (id: number): Promise<{ event: LoyaltyEventRow }> => watched(api.post(loyaltyUrl(`events/${id}/publish`))),
  cancel: (id: number, reason: string | null): Promise<{ event: LoyaltyEventRow }> =>
    watched(api.post(loyaltyUrl(`events/${id}/cancel`), reason ? { reason } : {})),
  remove: (id: number): Promise<{ deleted: true }> => watched(api.delete(loyaltyUrl(`events/${id}`))),
  people: (id: number, page: number, filters: Record<string, string> = {}): Promise<EventPeople> =>
    watched(api.get(loyaltyUrl(`events/${id}/people`), { params: { ...filters, ...(page > 1 ? { page } : {}) } })),
  signUp: (id: number, memberId: number, key: string): Promise<{ event: LoyaltyEventRow; person: EventPerson }> =>
    watched(api.post(loyaltyUrl(`events/${id}/sign-ups`), { member_id: memberId, idempotency_key: key })),
  cancelSignUp: (id: number, memberId: number): Promise<{ event: LoyaltyEventRow; person: EventPerson }> =>
    watched(api.delete(loyaltyUrl(`events/${id}/sign-ups/${memberId}`))),
  checkIn: (id: number, memberId: number, key: string): Promise<CheckInAnswer> =>
    watched(api.post(loyaltyUrl(`events/${id}/check-in`), { member_id: memberId, idempotency_key: key })),
}

export const EVENTS_KEY = ['loyalty', 'events'] as const
export const eventKey = (id: number) => ['loyalty', 'event', id] as const
export const peopleKey = (id: number) => ['loyalty', 'event', id, 'people'] as const

/** What an event's change makes stale: the lists, the event and its people. */
export function afterEventChange(client: QueryClient, id?: number): void {
  void client.invalidateQueries({ queryKey: [...EVENTS_KEY] })
  if (id !== undefined) void client.invalidateQueries({ queryKey: [...eventKey(id)] })
}

/** What a sign-up or a check-in makes stale: the event and its people, the lists' numbers, and the member (points). */
export function afterPersonChange(client: QueryClient, id: number, memberId: number): void {
  afterEventChange(client, id)
  for (const queryKey of [['loyalty', 'member', memberId], ['loyalty', 'history', memberId], ['loyalty', 'stamps', memberId], ['loyalty', 'members']]) {
    void client.invalidateQueries({ queryKey })
  }
}
