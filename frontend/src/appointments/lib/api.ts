import { api } from '../../lib/api'
import type {
  ActionKey, AppointmentDetail, Bootstrap, MoveBody, CalendarPayload, Checklist, ClientMessageInfo, ClientProfile, ClientSummary, CouponOption, CouponRef, CreateBody, DateKey, DeskMethod, HoursRow, Impact, Insights, PriceQuote, RefundVia, Takings,
  PointsResult, ServiceBody, SettingsBody, SetupCategory, SetupPayload, SetupService, SetupSettings, SetupTeamMember, SlotsPayload,
  TeamBody, TimeOffBody, Wall,
} from './types'

/**
 * Every call the workspace makes, in one place, typed. All of them live
 * under the one prefix the server gates with the organisation's flag;
 * tokens.test.ts refuses any other API path anywhere in this folder.
 */
const BASE = '/v1/admin/appointments'

/** `?dry_run=1`: the server answers with the appointments a change would strand and saves nothing. */
const dryRunParams = (dryRun: boolean) => (dryRun ? { params: { dry_run: 1 } } : undefined)

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

  /** `length` (Part F): only the starts where a length staff set fits. */
  slots: (serviceId: number, masterId: number, date: DateKey, ignore?: number, length?: number): Promise<SlotsPayload> =>
    watched(api.get(`${BASE}/slots`, { params: { service_id: serviceId, master_id: masterId, date, ignore, length } })),

  searchClients: (search: string): Promise<{ clients: ClientSummary[] }> =>
    watched(api.get(`${BASE}/clients`, { params: { search } })),

  createClient: (body: { name: string; phone?: string; email?: string; confirm_new?: boolean }): Promise<{ client: ClientSummary }> =>
    watched(api.post(`${BASE}/clients`, body)),

  client: (id: number): Promise<ClientProfile> => watched(api.get(`${BASE}/clients/${id}`)),

  /** `key` is the draft's Idempotency-Key: the same key and body answer with the first booking. */
  createBooking: (body: CreateBody, key: string): Promise<{ booking: AppointmentDetail; replayed: boolean; client_message: ClientMessageInfo | null }> =>
    watched(api.post(`${BASE}/bookings`, body, { headers: { 'Idempotency-Key': key } })),

  booking: (id: number): Promise<{ booking: AppointmentDetail }> => watched(api.get(`${BASE}/bookings/${id}`)),

  quote: (p: { client_id: number; service_id: number; master_id: number; start: Wall; coupon?: CouponRef | null }): Promise<PriceQuote> =>
    watched(api.get(`${BASE}/quote`, { params: { ...p, coupon: p.coupon ?? undefined } })),

  coupons: (clientId: number): Promise<{ coupons: CouponOption[] }> => watched(api.get(`${BASE}/clients/${clientId}/coupons`)),

  resolveCoupon: (clientId: number, code: string): Promise<{ coupon: CouponOption }> =>
    watched(api.post(`${BASE}/clients/${clientId}/coupons/resolve`, { code })),

  move: (id: number, body: MoveBody): Promise<{ booking: AppointmentDetail; client_message: ClientMessageInfo | null }> =>
    watched(api.patch(`${BASE}/bookings/${id}`, body)),

  act: (id: number, body: { action: ActionKey; revision: string; reason?: string; notify_client?: boolean; refunds?: { via: RefundVia; amount: number }[] }): Promise<{ booking: AppointmentDetail; points: PointsResult | null; client_message: ClientMessageInfo | null }> =>
    watched(api.post(`${BASE}/bookings/${id}/actions`, body)),

  takePayment: (id: number, body: { amount: number; method: DeskMethod; note?: string; revision: string }): Promise<{ booking: AppointmentDetail }> =>
    watched(api.post(`${BASE}/bookings/${id}/payments`, body)),

  refund: (id: number, body: { amount: number; via: RefundVia; reason: string; corrects?: boolean; revision: string }): Promise<{ booking: AppointmentDetail }> =>
    watched(api.post(`${BASE}/bookings/${id}/refunds`, body)),

  takings: (date: DateKey): Promise<Takings> => watched(api.get(`${BASE}/takings`, { params: { date } })),
  insights: (from: DateKey, to: DateKey): Promise<Insights> => watched(api.get(`${BASE}/insights`, { params: { from, to } })),

  setup: (): Promise<SetupPayload> => watched(api.get(`${BASE}/setup`)),

  linkCopied: (): Promise<{ checklist: Checklist }> => watched(api.post(`${BASE}/setup/checklist/link-copied`)),

  createService: (body: ServiceBody): Promise<{ service: SetupService }> => watched(api.post(`${BASE}/setup/services`, body)),

  updateService: (id: number, body: Partial<ServiceBody>, dryRun = false): Promise<{ service?: SetupService } & Impact> =>
    watched(api.patch(`${BASE}/setup/services/${id}`, body, dryRunParams(dryRun))),

  createCategory: (name: string): Promise<{ category: SetupCategory }> => watched(api.post(`${BASE}/setup/categories`, { name })),

  createTeamMember: (body: TeamBody): Promise<{ team_member: SetupTeamMember }> => watched(api.post(`${BASE}/setup/team`, body)),

  updateTeamMember: (id: number, body: Partial<TeamBody>, dryRun = false): Promise<{ team_member?: SetupTeamMember } & Impact> =>
    watched(api.patch(`${BASE}/setup/team/${id}`, body, dryRunParams(dryRun))),

  saveHours: (id: number, week: HoursRow[], dryRun = false): Promise<{ team_member?: SetupTeamMember } & Impact> =>
    watched(api.put(`${BASE}/setup/team/${id}/hours`, { week }, dryRunParams(dryRun))),

  addTimeOff: (id: number, body: TimeOffBody, dryRun = false): Promise<{ team_member?: SetupTeamMember } & Impact> =>
    watched(api.post(`${BASE}/setup/team/${id}/time-off`, body, dryRunParams(dryRun))),

  removeTimeOff: (id: number, entryId: number): Promise<{ team_member: SetupTeamMember }> =>
    watched(api.delete(`${BASE}/setup/team/${id}/time-off/${entryId}`)),

  saveSettings: (body: SettingsBody): Promise<{ settings: SetupSettings; checklist: Checklist }> =>
    watched(api.patch(`${BASE}/setup/settings`, body)),

  /** How many services and extras a currency change would relabel; nothing is saved. */
  currencyPreview: (currency: string): Promise<{ services: number; extras: number }> =>
    watched(api.patch(`${BASE}/setup/settings`, { currency }, dryRunParams(true))),
}

export interface ApiFailure {
  status: number
  /** The server's snake_case code; `unknown` for any other body; `network` when no answer came; '' for no error. */
  code: string
  message: string
  current?: AppointmentDetail
  matches?: ClientSummary[]
  /** A refused form's messages by field (Laravel's `errors`). */
  fields?: Record<string, string[]>
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
    fields: data.errors && typeof data.errors === 'object' ? (data.errors as Record<string, string[]>) : undefined,
  }
}
