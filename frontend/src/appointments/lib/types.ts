/** The venue's wall clock as the server sends and accepts it: 'YYYY-MM-DDTHH:mm'. Never an instant — do not pass it to `new Date()`. */
export type Wall = string
/** 'YYYY-MM-DD' */
export type DateKey = string

export type Status = 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show'
export type PaymentState =
  | 'not_paid_online' | 'card_held' | 'paid_by_card' | 'marked_paid' | 'refunded'
  | 'marked_refunded' | 'partially_refunded' | 'failed' | 'hold_released' | 'unknown'
export type ActionKey = 'confirm' | 'start' | 'complete' | 'no_show' | 'cancel' | 'award_points' | 'reopen' | 'move'

export interface Bootstrap {
  name: string
  organization: { id: number; name: string; industry: string }
  brand: { id: number; name: string } | null
  venue: { timezone: string; timezone_named: boolean; today: DateKey; currency: string }
  staff: { name: string; role: string | null; can_manage?: boolean }
  loyalty: { programme_on: boolean; points_on_bookings: boolean }
  readiness: { services: number; team: number; bookable: boolean; checklist: Checklist }
  /** The venue's client-message settings (Part D). Optional for older fixtures; the server always sends it. */
  messages?: MessageSettingsInfo
}

export type MessageKind = 'booked' | 'moved' | 'confirmed' | 'cancelled' | 'reminder'
/** One client message about an appointment, as the server logged it. `at` is a real instant. */
export interface ClientMessageInfo {
  kind: MessageKind
  status: 'queued' | 'sent' | 'skipped' | 'failed'
  reason: 'not_requested' | 'no_recipient' | 'suppressed' | 'stale' | 'mail_error' | null
  recipient: string | null
  at: string | null
}
export interface MessageSettingsInfo { staff_default: boolean; reminder_hours: number; language: string }

export type CouponRef = { member_offer_id: number } | { redemption_id: number }
export interface CouponOption { kind: 'offer' | 'reward'; coupon: CouponRef; label: string; value_label?: string }
/** The price staff are about to book at (Part E): the portal's own member price. */
export interface PriceQuote {
  list_amount: number; discount: { amount: number; label: string; source: string } | null
  coupon: { status?: string; label?: string } | null; total_amount: number; currency: string; member: boolean
}

export type DeskMethod = 'cash' | 'card_desk' | 'transfer' | 'other'
export type RefundVia = DeskMethod | 'online_card'
/** `corrects`: a desk refund undoing a wrong entry — the money is owed again. */
export interface MoneyMovement { id: number; kind: 'payment' | 'refund'; method: RefundVia; amount: number; currency: string; note: string | null; corrects?: boolean; by: string | null; at: string | null }
/** The money of an appointment (Part E), worked out by the server. */
export interface MoneyInfo {
  total: number; currency: string; held_online: number; paid_online: number; refunded_online: number
  paid_desk: number; refunded_desk: number; legacy_marked_paid: boolean; owed: number; to_refund: number
  refundable_online: number; refundable_desk: number; paid_in: number; paid_back: number; can_take: boolean
  /** What a correction may undo: money entered here (not a label marked paid before Part E). */
  correctable_desk?: number; corrected_desk?: number
  movements: MoneyMovement[]
}
export interface TakingsRow extends MoneyMovement { reference: string | null; client: string | null }
/** One day's takings (Part E): totals per currency and method, every movement, and what was paid online. */
export interface Takings {
  date: DateKey
  totals: Record<string, Record<RefundVia, { in: number; out: number }>>
  rows: TakingsRow[]
  online: Record<string, number>
}

/** Part G: the six groups an appointment falls into, by what it is now (spec §4.2). */
export type InsightsGroup = 'done' | 'no_show' | 'unmarked' | 'late_cancel' | 'early_cancel' | 'ahead'
export interface InsightsMoney { done: number; value_done: number; taken: number; owed_done: number }
/** A row by service or by person. `id: null` is "No one assigned"; `name: null` with an id is a removed record. */
export interface InsightsRow {
  id: number | null
  name: string | null
  due: number
  done: number
  no_show: number
  late_cancel: number
  value_done: Record<string, number>
}
export interface InsightsFigures {
  groups: Record<InsightsGroup, number>
  /** Done + no-show + not marked yet + cancelled late: every rate is out of this. */
  due: number
  money: Record<string, InsightsMoney>
  main_currency: string | null
  by_service: InsightsRow[]
  by_person: InsightsRow[]
  sources: { online: number; desk: number; other: number }
}
export interface InsightsSpan { from: DateKey; to: DateKey; days: number }
export interface Insights {
  period: InsightsSpan
  previous: InsightsSpan
  now: Wall
  cancel_hours: number
  desk_ledger_since: DateKey
  current: InsightsFigures
  before: InsightsFigures
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
  /** 'ask': the screen offers "Tell the client by email" (confirm, cancel — Part D). */
  message: 'none' | 'ask'
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
  /** The address a client message would use, or null (Part D). */
  client_email?: string | null
  /** Client messages about this appointment, newest first (Part D). */
  messages?: ClientMessageInfo[]
  /** The money of this appointment (Part E). */
  money?: MoneyInfo
  /** Part F: the booking keeps a length staff set. */
  length_set_by_staff?: boolean
}

/** The move request (Part F: `length` sets the booking's own length, `normal_length` forgets it; neither keeps it). */
export interface MoveBody { start: Wall; master_id: number; revision: string; notify_client?: boolean; length?: number; normal_length?: boolean }

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
  /** "Tell the client by email"; absent = the venue's setting decides. */
  notify_client?: boolean
  /** Part E: the member's coupon, and the total staff saw (the server refuses `price_changed` otherwise). */
  coupon?: CouponRef
  expected_total?: number
}

export type ChecklistKey = 'timezone' | 'service' | 'performer' | 'hours' | 'online' | 'messages' | 'first_appointment'
export interface ChecklistStep { key: ChecklistKey; done: boolean; optional: boolean }
export interface Checklist { steps: ChecklistStep[]; complete: boolean }

/** A person on a service, or a service on a person, with the optional own duration and price. */
export interface SetupLink { id: number; duration_minutes: number | null; price: number | null }
export interface SetupService {
  id: number; name: string; category_id: number | null; duration_minutes: number; buffer_after_minutes: number
  price: number; currency: string; short_description: string | null; is_active: boolean; performers: SetupLink[]
}
export interface SetupCategory { id: number; name: string }
/** One working window: `HH:MM` times, day_of_week 0 = Sunday (the server's own reading). */
export interface HoursRow { day_of_week: number; start_time: string; end_time: string; is_active?: boolean }
export interface TimeOffEntry { id: number; date: DateKey; start_time: string | null; end_time: string | null; reason: string | null }
export interface SetupTeamMember {
  id: number; name: string; title: string | null; email: string | null; phone: string | null; user_id: number | null
  is_active: boolean; services: SetupLink[]; week: HoursRow[]; time_off: TimeOffEntry[]
}
export interface StaffAccount { user_id: number; name: string; email: string }
export interface SetupSettings {
  timezone: string; timezone_named: boolean; zones: string[]; currency: string
  lead_minutes: number; slot_step: number; max_advance_days: number; allow_master_choice: boolean
  points_on_bookings: boolean; programme_on: boolean; booking_link: string | null; embed_snippet: string | null
  upcoming_appointments: number
  /** Part D: client messages, all off until a manager switches them on. */
  client_messages_staff_default: boolean; client_messages_reminder_hours: number; client_messages_language: string
}
export interface SetupPayload {
  can_manage: boolean; my_team_member_id: number | null; services: SetupService[]; categories: SetupCategory[]
  team: SetupTeamMember[]; staff_accounts: StaffAccount[]; settings: SetupSettings; checklist: Checklist
}
/** An upcoming appointment a setup change would leave outside the person's hours. */
export interface Stranded { id: number; start: Wall; end: Wall; client: string; service: string | null; team_member: string | null }
export interface Impact { affected: Stranded[]; total: number }

export interface ServiceBody {
  name: string; category_id: number | null; duration_minutes: number; buffer_after_minutes: number; price: number
  short_description: string | null; is_active: boolean; performers: SetupLink[]
}
export interface TeamBody {
  name: string; title: string | null; email: string | null; phone: string | null; user_id: number | null
  is_active: boolean; services: SetupLink[]
}
export interface TimeOffBody { from: DateKey; to?: DateKey; start_time?: string; end_time?: string; reason?: string }
export type SettingsBody = Partial<Pick<SetupSettings, 'timezone' | 'currency' | 'lead_minutes' | 'slot_step' | 'max_advance_days' | 'allow_master_choice' | 'points_on_bookings'
  | 'client_messages_staff_default' | 'client_messages_reminder_hours' | 'client_messages_language'>>
