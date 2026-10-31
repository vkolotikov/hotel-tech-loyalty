import { api } from '../../../lib/api'
import type { PortalEvent, PortalEvents } from '../../lib/types'

// The shapes live in lib/types.ts (plain types the members' app shares); named here for the event screens' imports.
export type { PortalEvent, AttendedEvent, PortalEvents } from '../../lib/types'

/** The member's events: their own endpoints under the portal's door (member.only). */
export const eventsApi = {
  list: (): Promise<PortalEvents> => api.get('/v1/member/portal/events').then(r => r.data),
  signUp: (id: number): Promise<{ event: PortalEvent }> => api.post(`/v1/member/portal/events/${id}/sign-up`).then(r => r.data),
  cancel: (id: number): Promise<{ event: PortalEvent }> => api.delete(`/v1/member/portal/events/${id}/sign-up`).then(r => r.data),
}

export const EVENTS_KEY = ['portal-events'] as const
