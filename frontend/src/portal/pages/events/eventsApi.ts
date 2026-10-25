import { api } from '../../../lib/api'

/**
 * An event as the member sees it (release 8, spec 2026-10-25 §4; PortalEvents::row()). Times are the venue's wall
 * clock, 'YYYY-MM-DDTHH:mm' — read as digits, never passed to `new Date()`.
 */
export interface PortalEvent {
  id: number
  title: string
  description: string | null
  starts_at: string
  ends_at: string
  /** The place's name, or the written location, or null. */
  where: string | null
  points: number
  sign_up: boolean
  walk_ins: boolean
  capacity: number | null
  /** Places left (sign-ups and walk-ins taken off the capacity); null without a capacity. */
  room_left: number | null
  my: 'signed_up' | 'none'
  /** The member has checked in already (an event on now). */
  checked_in: boolean
  can_sign_up: boolean
  /** Why the member cannot sign up (EventSignUp's code), while the event takes sign-ups; else null. */
  why_not: string | null
  can_cancel: boolean
}

export interface AttendedEvent {
  id: number
  title: string
  starts_at: string
  points: number
}

/** `GET member/portal/events` */
export interface PortalEvents {
  upcoming: PortalEvent[]
  attended: AttendedEvent[]
}

/** The member's events: their own endpoints under the portal's door (member.only). */
export const eventsApi = {
  list: (): Promise<PortalEvents> => api.get('/v1/member/portal/events').then(r => r.data),
  signUp: (id: number): Promise<{ event: PortalEvent }> => api.post(`/v1/member/portal/events/${id}/sign-up`).then(r => r.data),
  cancel: (id: number): Promise<{ event: PortalEvent }> => api.delete(`/v1/member/portal/events/${id}/sign-up`).then(r => r.data),
}

export const EVENTS_KEY = ['portal-events'] as const
