import { api } from '../../lib/api'
import type {
  ActionKey, AppointmentDetail, Bootstrap, CalendarPayload, ClientProfile, ClientSummary, CreateBody, DateKey, PointsResult, SlotsPayload, Wall,
} from './types'

/**
 * Every call the workspace makes, in one place, typed. All of them live
 * under the one prefix the server gates with the organisation's flag;
 * tokens.test.ts refuses any other API path anywhere in this folder.
 */
const BASE = '/v1/admin/appointments'

const offListeners = new Set<() => void>()

/**
 * Be told when any call is refused because the organisation's workspace was
 * switched off, or its subscription lapsed, while this window was open. The
 * provider answers by asking for the bootstrap again, whose own refusal puts
 * the shell's notice and the way back to the full admin on screen. Returns
 * the unsubscribe.
 */
export function onWorkspaceOff(listener: () => void): () => void {
  offListeners.add(listener)
  return () => { offListeners.delete(listener) }
}

/** Every call but the bootstrap goes through here; the failure is passed on untouched. */
function watched<T>(request: Promise<{ data: T }>): Promise<T> {
  return request.then(r => r.data, (error: unknown) => {
    const code = failureOf(error).code
    if (code === 'workspace_disabled' || code === 'subscription_required') offListeners.forEach(listener => listener())
    throw error
  })
}

export const appointmentsApi = {
  bootstrap: (): Promise<Bootstrap> => api.get(`${BASE}/bootstrap`).then(r => r.data),

  /** `windows: false` leaves out every person's working hours — for a view that draws no grid. */
  calendar: (from: DateKey, to: DateKey, opts: { masterId?: number | null; includeCancelled?: boolean; windows?: boolean } = {}): Promise<CalendarPayload> =>
    watched(api.get(`${BASE}/calendar`, { params: { from, to, master_id: opts.masterId ?? undefined, include_cancelled: opts.includeCancelled ? 1 : 0, windows: opts.windows === false ? 0 : 1 } })),

  slots: (serviceId: number, masterId: number, date: DateKey, ignore?: number): Promise<SlotsPayload> =>
    watched(api.get(`${BASE}/slots`, { params: { service_id: serviceId, master_id: masterId, date, ignore } })),

  searchClients: (search: string): Promise<{ clients: ClientSummary[] }> =>
    watched(api.get(`${BASE}/clients`, { params: { search } })),

  createClient: (body: { name: string; phone?: string; email?: string; confirm_new?: boolean }): Promise<{ client: ClientSummary }> =>
    watched(api.post(`${BASE}/clients`, body)),

  client: (id: number): Promise<ClientProfile> => watched(api.get(`${BASE}/clients/${id}`)),

  /** `key` is the draft's Idempotency-Key: the same key and body answer with the first booking. */
  createBooking: (body: CreateBody, key: string): Promise<{ booking: AppointmentDetail; replayed: boolean }> =>
    watched(api.post(`${BASE}/bookings`, body, { headers: { 'Idempotency-Key': key } })),

  booking: (id: number): Promise<{ booking: AppointmentDetail }> => watched(api.get(`${BASE}/bookings/${id}`)),

  move: (id: number, body: { start: Wall; master_id: number; revision: string }): Promise<{ booking: AppointmentDetail }> =>
    watched(api.patch(`${BASE}/bookings/${id}`, body)),

  act: (id: number, body: { action: ActionKey; revision: string; reason?: string }): Promise<{ booking: AppointmentDetail; points: PointsResult | null }> =>
    watched(api.post(`${BASE}/bookings/${id}/actions`, body)),
}

export interface ApiFailure {
  status: number
  /** The server's snake_case code; `unknown` for any other body; `network` when no answer came; '' for no error. */
  code: string
  message: string
  current?: AppointmentDetail
  matches?: ClientSummary[]
}

/** What went wrong, from an axios error (or anything else that was thrown). Pure: no i18n, no side effects. */
export function failureOf(error: unknown): ApiFailure {
  if (!error) return { status: 0, code: '', message: '' }

  const response = (error as { response?: { status?: number; data?: unknown } }).response
  if (!response) return { status: 0, code: 'network', message: error instanceof Error ? error.message : '' }

  const data = response.data && typeof response.data === 'object' ? (response.data as Record<string, unknown>) : {}
  const code = typeof data.error === 'string' && /^[a-z_]+$/.test(data.error) ? data.error : 'unknown'

  return {
    status: response.status ?? 0,
    code,
    message: typeof data.message === 'string' ? data.message : '',
    current: data.current as AppointmentDetail | undefined,
    matches: data.matches as ClientSummary[] | undefined,
  }
}
