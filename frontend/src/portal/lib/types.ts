import type { PortalAccent } from '../theme/applyPortalTheme'

export interface PortalVenue {
  name: string
  logo_url: string | null
  industry: string
  currency: string
  timezone: string
  contact: { email: string | null; phone: string | null }
  accent: PortalAccent
  display_face: string
}

export interface PortalCapabilities {
  loyalty: boolean
  services: boolean
  stays: boolean
  chat: boolean
  payments: { services: boolean; stays: boolean; publishable_key: string | null }
}

export interface PortalPolicies {
  services_cancel_hours: number
  booking_cancel_hours: number
  services_cancellation_policy: string
  booking_cancellation_policy: string
  /** The venue's check-in and check-out times, "HH:MM", in the venue's own time zone. */
  check_in_time: string
  check_out_time: string
}

export interface Tier { id: number; name: string; color_hex?: string | null }

export interface Activity {
  id: number
  type: string
  points: number
  balance_after?: number | null
  description?: string | null
  created_at: string
  is_reversed?: boolean
}

export interface BenefitPreview {
  id: number
  name: string
  category?: string | null
  display?: string | null
  value_type?: string | null
  value_amount?: number | null
}

export interface PortalMember {
  member_number: string
  name: string
  tier: Tier | null
  current_points: number
  lifetime_points: number
  referral_code: string | null
  progress: { percentage: number; points_needed: number; next_tier: Tier | null }
  recent_activity: Activity[]
  marketing_consent: boolean
  email_notifications: boolean
  push_notifications: boolean
  member_since: string
  user: { id: number; name: string; email: string; phone: string | null; language: string | null; nationality?: string | null; avatar_url?: string | null; date_of_birth?: string | null }
  benefits: BenefitPreview[]
  /** Release 4, part A: the kinds of message, as the server reads them (PortalBootstrap::member()). A kind switched
   *  off is not sent at all — no push, no inbox row (NotificationService::send()). */
  notification_preferences?: NotificationPreferences
  /** Release 4, part F: "Offers by SMS", off until the member turns it on. Absent until the server sends it; the
   *  portal shows the switch only then. */
  sms_consent?: boolean
}

/** The categories of NotificationService::CATEGORIES, the keys PUT member/profile `notification_preferences` takes. */
export type MessageKind = 'offers' | 'points' | 'tier' | 'stays'
export type NotificationPreferences = Record<MessageKind, boolean>

/**
 * One notification kept for the member's inbox — a `push_notifications` row, every column, as
 * `GET /v1/member/notifications` answers it (Laravel's paginator; MemberNotificationsTest pins the shape).
 */
export interface InboxNotification {
  id: number
  member_id: number
  type: string
  title: string
  body: string | null
  data: Record<string, unknown> | null
  channel: string | null
  campaign_id: number | null
  is_sent: boolean
  sent_at: string | null
  read_at: string | null
  created_at: string
  updated_at: string
}

export interface PortalBootstrap {
  venue: PortalVenue
  capabilities: PortalCapabilities
  policies: PortalPolicies
  member: PortalMember | null
  counts: { unread_notifications: number; upcoming_bookings: number }
}

export type BookingKind = 'service' | 'stay'

export interface PortalBooking {
  kind: BookingKind
  id: number
  reference: string
  title: string
  subtitle: string | null
  starts_at: string | null
  ends_at: string | null
  status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | string
  payment_status: string | null
  total: number
  currency: string
  discount: { amount: number; label: string } | null
  can_cancel: boolean
  cancel_deadline: string | null
  notes: string | null
  party_size: number | null
  guests: number | null
  nights: number | null
  /** Whether there is a real Stripe PaymentIntent behind this booking — not merely whether
   *  `payment_status` says "paid". Staff can mark a booking paid for cash or a bank transfer with no
   *  online payment at all, and `moneyPromise()` must never promise a card refund for that money. */
  paid_online: boolean
  /** Part H: a deposit charged on the venue's booking page (the rest is paid at the venue); null otherwise. */
  deposit?: { amount: number } | null
  /** Release 5, part C: a stay of several rooms booked as one (MemberBookingQuery::combinationDto()) lists them;
   *  the booking's own total, guests and `can_cancel` are the whole combination's. Absent for one room. */
  rooms?: { id: number; reference: string; title: string; guests: number | null; total: number; status: string }[]
}

export interface Paginated<T> { data: T[]; meta: { scope: string; page: number; per_page: number; total: number } }

export interface CardPayload { member_number: string; qr_svg?: string | null; qr_image?: string | null }

export interface Benefit {
  tier_benefit_id: number
  benefit_id: number
  name: string
  category?: string | null
  description?: string | null
  display?: string | null
  fulfillment_mode?: string | null
  requestable: boolean
  request?: { id: number; status: string; requested_at?: string } | null
  last_fulfilled_at?: string | null
}

export interface Reward {
  id: number
  name: string
  description?: string | null
  category?: string | null
  image_url?: string | null
  points_cost: number
  stock?: number | null
  per_member_limit?: number | null
  can_afford: boolean
  claimed_by_me: number
  remaining_for_me: number | null
  in_stock: boolean | null
}

export interface Redemption {
  id: number
  code: string
  status: 'pending' | 'fulfilled' | 'cancelled' | string
  points_spent: number
  created_at: string
  reward?: { id: number; name: string; category?: string | null; image_url?: string | null; points_cost: number } | null
}

export interface Offer {
  id: number
  title: string
  description?: string | null
  type?: string | null
  value?: number | string | null
  image_url?: string | null
  end_date?: string | null
  terms_conditions?: string | null
  usage_limit?: number | null
  times_used?: number | null
}

export interface Claim {
  id: number
  status: string
  claimed_at?: string | null
  used_at?: string | null
  expires_at?: string | null
  offer?: Offer | null
}

export interface LaravelPage<T> { data: T[]; current_page: number; last_page: number; total: number }

// ─── Service booking (the Book flow) ───────────────────────────────────────
//
// These mirror the server's actual JSON key-for-key (read from
// ServiceCatalogue::build(), PortalServiceBookingController's own
// quotePayload()/paymentIntent(), PricingResult::toArray(),
// CouponResolver::resolveCode() and DiscountService::quoteForBooking()) —
// not a hand-written guess, which would under-list a few fields the server
// actually sends and leave some string fields wider than the values
// the server can produce.

export interface CatalogueCategory { id: number; name: string; slug: string; description: string | null; icon: string | null; image: string | null; color: string | null }

export interface CatalogueService {
  id: number; category_id: number | null; name: string; description: string | null; short_description: string | null
  duration_minutes: number; buffer_after_minutes: number; price: number; member_price: number; currency: string | null
  image: string | null; gallery: string[]; tags: string[]; master_ids: number[]
}

export interface CatalogueMaster { id: number; name: string; title: string | null; bio: string | null; avatar: string | null; specialties: string[]; service_ids: number[] }

export interface CatalogueExtra {
  id: number; name: string; description: string | null
  // ServiceExtra::$casts['price'] is 'decimal:2', which Eloquent serializes as a string ("12.00") — the
  // portal endpoint (PortalServiceBookingController::index()) re-casts it to a number before sending it.
  price: number; price_type: string
  duration_minutes: number | null; lead_time_hours: number | null; image: string | null; icon: string | null
  category: string | null; currency: string | null
}

export interface CatalogueRules { currency: string; lead_minutes: number; slot_step: number; max_advance_days: number; allow_master_choice: boolean; cancellation_policy: string }

export interface Catalogue {
  categories: CatalogueCategory[]
  services: CatalogueService[]
  masters: CatalogueMaster[]
  extras: CatalogueExtra[]
  rules: CatalogueRules
  pricing: { automatic: { label: string; type: string; value: number } | null }
}

export interface Slot { start: string; end: string; duration_minutes: number; time_label: string; masters: number[] }

export type CouponRef = { member_offer_id: number } | { redemption_id: number }

export interface QuoteBody {
  service_id: number; master_id?: number | null; start_at: string; party_size?: number
  extras?: { id: number; quantity?: number }[]; coupon?: CouponRef | null
}

export interface QuoteLine { id: number; name: string; unit_price: number; quantity: number; line_total: number }

export interface Quote {
  service: { id: number; name: string; duration_minutes: number }
  master: { id: number; name: string } | null
  start_at: string
  end_at: string
  duration_minutes: number
  lines: { service_price: number; extras: QuoteLine[]; extras_total: number }
  list_amount: number
  discount: { amount: number; label: string; source: 'tier_benefit' | 'offer' | 'reward' } | null
  coupon: { source: 'offer' | 'reward'; source_id: number; label: string; status: 'applied' | 'outbid' | 'wrong_scope'; discount: number } | null
  total_amount: number
  currency: string
  payment: { mode: 'online' | 'at_venue'; reason: 'payments_off' | 'mock_mode' | 'currency_mismatch' | null }
  policy: { cancellation_policy: string | null; cancel_hours: number }
}

export interface ResolvedCoupon { kind: 'offer' | 'reward'; coupon: CouponRef; label: string; type: 'percent_discount' | 'fixed_amount'; value: number; value_label: string; valid_until: string | null }

/** `pay_at_venue_grant` (release 4, part C): the server's own grant from a `pay_at_venue` answer given because
 *  online payment was unavailable — sent back as it came, never made here. */
export interface ConfirmBody extends QuoteBody { payment_intent_id?: string | null; notes?: string | null; pay_at_venue_grant?: string | null }

/** `reused` (release 4, part C): the server handed back the intent an earlier call made for the same hold or slot. */
export interface PaymentIntentReply { client_secret: string; payment_intent_id: string; amount: number; currency: string; reused?: boolean; hold_expires_at?: string }

// ─── Stay booking (the stay flow) ───────────────────────────────────────────
//
// These mirror the server's JSON key for key: StayCatalogue::build(),
// PortalStayBookingController::availability() and StayQuoteService::payload().
// A room's id is a string (the PMS id when the room has one).

export interface StayRoom {
  id: string; name: string; description: string | null; short_description: string | null
  max_guests: number; bedrooms: number; bed_type: string | null; size: string | null
  image: string | null; gallery: string[]; amenities: string[]; tags: string[]; base_price: number
}

export interface StayExtra {
  id: string; name: string; description: string | null; price: number; price_type: string
  lead_time_hours: number; image: string | null; icon: string | null; category: string | null
}

export interface StayPolicies { check_in_time: string; check_out_time: string; cancellation_policy: string | null; payment_terms: string | null; cancel_hours: number }

export interface StayRules { currency: string; min_nights: number; max_nights: number }

export interface StayCatalogue {
  rooms: StayRoom[]
  extras: StayExtra[]
  policies: StayPolicies
  rules: StayRules
  pricing: { automatic: { label: string; type: string; value: number } | null }
  payment: Quote['payment']
}

export interface AvailableRoom {
  id: string; name: string; short_description: string | null; max_guests: number; bedrooms: number
  bed_type: string | null; size: string | null; image: string | null; gallery: string[]; amenities: string[]
  price_per_night: number; total_price: number; member_total: number; currency: string; min_stay: number
}

/** Release 5, part C: two or three rooms that together sleep a party no single room does, offered by
 *  `PortalStayBookingController::availability()` when `rooms` is empty — booked as one stay, paid once. Every
 *  number is the server's; the quote prices it again. */
export interface AvailableCombination {
  key: string
  rooms: { id: string; name: string; max_guests: number; total_price: number; image: string | null }[]
  sleeps: number
  total_price: number
  member_total: number
  currency: string
}

/** `combinations` (release 5) is absent from an older server; an empty list means no combination is offered. */
export interface StayAvailability { rooms: AvailableRoom[]; nights: number; party_too_large: boolean; combinations?: AvailableCombination[] }

/** One room (`unit_id`) or a combination of two or three (`unit_ids`, release 5) — never both. */
export interface StayQuoteBody {
  unit_id?: string; unit_ids?: string[]; check_in: string; check_out: string; adults: number; children: number
  extras?: { id: string; quantity?: number }[]; coupon?: CouponRef | null
}

/** A combination quote's own room: its list price and who sleeps in it (StayQuoteService::payload()). */
export interface StayQuoteRoom { id: string; name: string; room_total: number; price_per_night: number; adults: number; children: number }

export interface StayQuoteLine { id: string; name: string; unit_price: number; quantity: number; line_total: number }

export interface StayQuote {
  hold_token: string
  expires_at: string | null
  room: { id: string; name: string }
  check_in: string
  check_out: string
  nights: number
  adults: number
  children: number
  lines: { room_total: number; price_per_night: number; extras: StayQuoteLine[]; extras_total: number }
  /** A combination's rooms (release 5); absent for one room. `room` then names them all together. */
  rooms?: StayQuoteRoom[]
  list_amount: number
  discount: Quote['discount']
  coupon: Quote['coupon']
  total_amount: number
  currency: string
  payment: Quote['payment']
  policy: { cancellation_policy: string | null; cancel_hours: number; check_in_time: string; check_out_time: string }
}

export interface StayConfirmBody { hold_token: string; payment_intent_id?: string | null; special_requests?: string | null; pay_at_venue_grant?: string | null }

/**
 * Release 4, part C — `GET member/portal/payments/{id}` (PortalPaymentReturnController): what a payment the member
 * came back with from a bank redirect is for, read by the server from the payment's own metadata. `state`:
 * `authorised` (confirm it), `processing` (the bank has not answered yet), `failed` (nothing was taken), `booked`
 * (a booking already carries it). `service`/`stay` is null when the booking can no longer be rebuilt (a stay's hold
 * is gone, or the payment predates the return).
 */
export interface PaymentReturn {
  kind: BookingKind
  state: 'authorised' | 'processing' | 'failed' | 'booked'
  payment_intent_id: string
  amount: number
  currency: string
  booking: PortalBooking | null
  service: { body: QuoteBody; name: string; master: string | null; start_at: string } | null
  stay: {
    hold_token: string; hold_active: boolean; room: { id: string; name: string }
    check_in: string; check_out: string; nights: number; adults: number; children: number
  } | null
}

/** Anything that carries a coupon verdict — a service quote or a stay quote. */
export interface Priced { coupon: Quote['coupon'] }

export interface CancelReply {
  booking: PortalBooking
  refund: { outcome: 'none' | 'released' | 'refunded'; amount: number; currency: string; coupon_released: boolean; points_reversed: number }
}
