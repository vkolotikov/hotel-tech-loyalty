/** The venue's wall clock as the server sends and accepts it: 'YYYY-MM-DDTHH:mm'. Never an instant — do not pass it to `new Date()`. */
export type Wall = string
/** 'YYYY-MM-DD' */
export type DateKey = string

export type Status = 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show'
export type PaymentState =
  | 'not_paid_online' | 'card_held' | 'paid_by_card' | 'marked_paid' | 'refunded'
  | 'marked_refunded' | 'partially_refunded' | 'failed' | 'hold_released' | 'unknown'
export type ActionKey = 'confirm' | 'start' | 'complete' | 'no_show' | 'cancel' | 'mark_paid_at_venue' | 'award_points' | 'move'

export interface Bootstrap {
  name: string
  organization: { id: number; name: string; industry: string }
  brand: { id: number; name: string } | null
  venue: { timezone: string; timezone_named: boolean; today: DateKey; currency: string }
  staff: { name: string; role: string | null }
  loyalty: { programme_on: boolean; points_on_bookings: boolean }
  readiness: { services: number; team: number; bookable: boolean }
}

export interface MemberSummary { id: number; number: string; tier: string | null; points: number }
export interface ClientSummary { id: number; name: string; phone: string | null; email: string | null; member: MemberSummary | null }

/** A calendar row: what a card shows and nothing more. */
export interface AppointmentSummary {
  id: number
  reference: string
  start: Wall
  end: Wall
  duration_minutes: number
  service: { id: number; name: string } | null
  master: { id: number; name: string } | null
  client: { id: number | null; name: string; is_member: boolean }
  status: Status
  payment: { state: PaymentState }
  revision: string
}

export interface PointsPreview { points: number; reason: string | null }
export interface PointsResult { awarded: number; reason: string | null }

export interface Consequences {
  payment: 'none' | 'hold_will_be_charged' | 'hold_will_be_released' | 'hold_expired' | 'captured_not_refunded' | 'marked_only'
  points: PointsPreview | null
  coupon: 'none' | 'not_returned'
  message: 'none'
}
export interface ActionInfo { key: ActionKey; allowed: boolean; consequences: Consequences }

export interface LoyaltyCardData {
  member: MemberSummary | null
  benefits: { name: string | null; display: string | null; description: string | null }[]
  points_on_bookings?: boolean
  /** Points the ledger holds for this appointment; null until the award has run. */
  awarded?: number | null
}

export interface HistoryEntry {
  /** A real instant (ISO 8601, UTC), unlike the appointment's own times. */
  at: string
  actor: string | null
  action: string
  description: string | null
  changes: { old: unknown; new: unknown }
}

export interface AppointmentDetail extends Omit<AppointmentSummary, 'client' | 'payment'> {
  client: { id: number | null; name: string; phone: string | null; email: string | null; member: MemberSummary | null }
  payment: { state: PaymentState; raw: string; amount: number; refunded_amount: number | null; carries_card_payment: boolean; currency: string }
  price: { total: number; list: number | null; discount_label: string | null; currency: string }
  source: string
  notes: { customer: string | null; staff: string | null }
  actions: ActionInfo[]
  loyalty: LoyaltyCardData | null
  history: HistoryEntry[]
}

export interface MasterDay {
  /** Working windows, 'HH:mm', time off already taken out. */
  windows: { start: string; end: string }[]
  /** Both null = the whole day. */
  time_off: { start: string | null; end: string | null; reason: string | null }[]
}
export interface CalendarMaster { id: number; name: string; title: string | null; avatar: string | null; days: Record<DateKey, MasterDay> }
export interface CatalogueService { id: number; name: string; duration_minutes: number; buffer_after_minutes: number; price: number; currency: string; master_ids: number[] }
export interface CalendarPayload { from: DateKey; to: DateKey; masters: CalendarMaster[]; services: CatalogueService[]; appointments: AppointmentSummary[] }
export interface SlotsPayload { slots: { start: Wall; end: Wall; label: string }[]; duration_minutes: number; price: number; currency: string }

export interface ClientProfile {
  client: ClientSummary
  upcoming: AppointmentSummary[]
  past: AppointmentSummary[]
  matched_by_email: AppointmentSummary[]
  loyalty: LoyaltyCardData | null
  last: { service_id: number; master_id: number | null } | null
}

export interface CreateBody {
  client_id: number
  service_id: number
  master_id: number
  start: Wall
  source?: 'admin' | 'phone' | 'walk_in'
  customer_notes?: string
  staff_notes?: string
}
