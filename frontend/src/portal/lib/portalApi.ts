import { api } from '../../lib/api'
import type {
  Benefit, BookingKind, CancelReply, CardPayload, Catalogue, Claim, ConfirmBody, LaravelPage, Offer, Paginated, PaymentIntentReply, PortalBooking,
  PortalBootstrap, Quote, QuoteBody, Redemption, ResolvedCoupon, Reward, Slot, Activity,
  StayAvailability, StayCatalogue, StayConfirmBody, StayQuote, StayQuoteBody,
} from './types'

/**
 * Every call the portal makes, in one place, typed. Member endpoints only —
 * the sweep in tokens.test.ts refuses any admin-prefixed API path anywhere
 * in this folder.
 */
export const portalApi = {
  bootstrap: (): Promise<PortalBootstrap> => api.get('/v1/member/portal').then(r => r.data),
  bookings: (scope: 'upcoming' | 'past', page = 1): Promise<Paginated<PortalBooking>> =>
    api.get('/v1/member/portal/bookings', { params: { scope, page } }).then(r => r.data),
  booking: (kind: BookingKind, id: number): Promise<PortalBooking> =>
    api.get(`/v1/member/portal/bookings/${kind}/${id}`).then(r => r.data),
  card: (): Promise<CardPayload> => api.get('/v1/member/card').then(r => r.data),
  benefits: (): Promise<{ tier: string | null; benefits: Benefit[] }> => api.get('/v1/member/benefits').then(r => r.data),
  requestBenefit: (tierBenefitId: number) => api.post(`/v1/member/benefits/${tierBenefitId}/request`).then(r => r.data),
  cancelBenefitRequest: (requestId: number) => api.delete(`/v1/member/benefits/requests/${requestId}`).then(r => r.data),
  rewards: (): Promise<{ rewards: Reward[]; current_points: number }> => api.get('/v1/member/rewards').then(r => r.data),
  redeem: (rewardId: number): Promise<{ redemption: Redemption; message: string }> =>
    api.post(`/v1/member/rewards/${rewardId}/redeem`).then(r => r.data),
  redemptions: (): Promise<{ redemptions: Redemption[] }> => api.get('/v1/member/my/redemptions').then(r => r.data),
  offers: (): Promise<{ general: Offer[]; personalized: Claim[] }> => api.get('/v1/member/offers').then(r => r.data),
  claimOffer: (offerId: number) => api.post(`/v1/member/offers/${offerId}/claim`).then(r => r.data),
  pointsHistory: (page: number): Promise<LaravelPage<Activity>> =>
    api.get('/v1/member/points/history', { params: { page, per_page: 20 } }).then(r => r.data),
  updateProfile: (payload: Record<string, unknown>) => api.put('/v1/member/profile', payload).then(r => r.data),
  changePassword: (payload: { current_password: string; password: string; password_confirmation: string }) =>
    api.put('/v1/member/password', payload).then(r => r.data),
  referral: (): Promise<{ referral_code: string | null; referral_link: string | null; total_referrals: number; rewarded_referrals: number }> =>
    api.get('/v1/member/referral').then(r => r.data),
  appleWalletLink: (): Promise<{ url: string; expires_in: number }> => api.get('/v1/member/card/apple-wallet/link').then(r => r.data),
  googleWallet: (): Promise<{ saveUrl?: string; save_url?: string }> => api.get('/v1/member/card/google-wallet').then(r => r.data),
  deleteAccount: (payload: Record<string, string>) => api.delete('/v1/member/account', { data: payload }).then(r => r.data),

  // ─── Service booking (the Book flow) ─────────────────────────────────────
  catalogue: (): Promise<Catalogue> => api.get('/v1/member/portal/services').then(r => r.data),
  calendar: (serviceId: number, masterId: number | null, start: string, end: string): Promise<{ available_dates: string[] }> =>
    api.get('/v1/member/portal/services/calendar', { params: { service_id: serviceId, master_id: masterId ?? undefined, start, end } }).then(r => r.data),
  availability: (serviceId: number, masterId: number | null, date: string): Promise<{ slots: Slot[] }> =>
    api.get('/v1/member/portal/services/availability', { params: { service_id: serviceId, master_id: masterId ?? undefined, date } }).then(r => r.data),
  quote: (body: QuoteBody): Promise<Quote> => api.post('/v1/member/portal/services/quote', body).then(r => r.data),
  paymentIntent: (body: QuoteBody): Promise<PaymentIntentReply> => api.post('/v1/member/portal/services/payment-intent', body).then(r => r.data),
  confirm: (body: ConfirmBody, idempotencyKey: string): Promise<{ booking: PortalBooking; replayed: boolean }> =>
    api.post('/v1/member/portal/services/confirm', body, { headers: { 'Idempotency-Key': idempotencyKey } }).then(r => r.data),
  resolveCoupon: (code: string): Promise<ResolvedCoupon> => api.post('/v1/member/portal/coupons/resolve', { code }).then(r => r.data),

  // ─── Stay booking (the stay flow) ────────────────────────────────────────
  stayCatalogue: (): Promise<StayCatalogue> => api.get('/v1/member/portal/stays').then(r => r.data),
  stayAvailability: (checkIn: string, checkOut: string, adults: number, children: number): Promise<StayAvailability> =>
    api.get('/v1/member/portal/stays/availability', { params: { check_in: checkIn, check_out: checkOut, adults, children } }).then(r => r.data),
  stayQuote: (body: StayQuoteBody): Promise<StayQuote> => api.post('/v1/member/portal/stays/quote', body).then(r => r.data),
  stayPaymentIntent: (holdToken: string): Promise<PaymentIntentReply> =>
    api.post('/v1/member/portal/stays/payment-intent', { hold_token: holdToken }).then(r => r.data),
  // No Idempotency-Key: a hold is booked once, and a repeated confirm answers the booking it became.
  stayConfirm: (body: StayConfirmBody): Promise<{ booking: PortalBooking; replayed: boolean }> =>
    api.post('/v1/member/portal/stays/confirm', body).then(r => r.data),

  // ─── Cancellation ────────────────────────────────────────────────────────
  cancelBooking: (kind: BookingKind, id: number): Promise<CancelReply> =>
    api.post(`/v1/member/portal/bookings/${kind}/${id}/cancel`).then(r => r.data),
}

/** The server's sentence when it sent one, else the caller's fallback. */
export function apiMessage(error: unknown, fallback: string): string {
  const res = (error as { response?: { data?: { message?: string; error?: string; errors?: Record<string, string[]> } } })?.response
  const first = res?.data?.errors ? Object.values(res.data.errors)[0]?.[0] : undefined
  return first || res?.data?.message || fallback
}

/** The server's `{error: <snake_code>}` off any failed call, or null when there isn't one. */
export function apiErrorCode(e: unknown): string | null {
  return (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? null
}

/**
 * The booking a failed call's body may carry — today only the cancel endpoint's own `cancel_failed` 500,
 * whose body includes the booking's true state when a refund may already have gone through before the
 * failure (`PortalBookingController::cancel()`). Null for every other error shape, including one with no
 * response body at all.
 */
export function apiErrorBooking(e: unknown): PortalBooking | null {
  return (e as { response?: { data?: { booking?: PortalBooking } } })?.response?.data?.booking ?? null
}

/**
 * Every error code the Book flow's endpoints can answer with, mapped to the
 * exact English sentence `portal.book.<code>` carries in the bundle — the
 * booking-window and payment codes (`quoteError()`'s own
 * BookingWindowException/ExtraLeadTimeException/SlotTakenException codes,
 * plus confirm()'s payment/idempotency codes), every CouponException code
 * CouponResolver::resolveCode() can throw, and the stay flow's own codes
 * (`hold_expired`, `price_changed`, `room_unavailable`, `pms_unavailable`,
 * `invalid_stay`, `hold_not_found`). `payment_check_failed` is the 503 BOTH
 * portal confirm endpoints answer with when Stripe cannot be reached to
 * check the payment — the authorisation is intact and a retry of the same
 * confirm is safe; its sentence is kept identical to the server's own
 * (`portalApi.test.ts`). A code
 * with no entry here
 * (`not_found`, `no_membership`, `payment_unavailable`, `pay_at_venue`,
 * `idempotency_key_required`) falls back to the generic error, same as a code
 * this flow has never seen — `pay_at_venue` in particular is never an error
 * to report: `PayStep.tsx`'s own `NOTHING_TO_CHARGE` set treats it exactly
 * like `nothing_to_pay` and shows `book.pay_at_venue_note` instead, so mapping
 * it here would fight that branch and collide with `book.pay_at_venue`'s own
 * existing meaning (the "Pay at the venue" mode label, not a sentence). This
 * is the *only* place these sentences are written down in English — every
 * screen that needs one calls
 * `t(bookErrorKey(code), bookErrorFallback(code))` rather than keeping its own
 * copy, so a bundle edit here can't silently desync from a component's own
 * fallback text. `portalApi.test.ts` proves each one is byte-identical to
 * `portal.en.json`.
 */
const BOOK_ERROR_FALLBACK: Record<string, string> = {
  not_bookable: 'Online booking is not available for this venue yet.',
  slot_taken: 'That time was just taken. Please pick another.',
  too_soon: 'That time is too soon to book online.',
  too_far_ahead: 'That date is beyond the booking window.',
  extra_lead_time: 'One of the add-ons needs more notice than this time allows.',
  payment_required: 'Please complete the payment first.',
  payment_mismatch: 'The price changed. Please review and pay again.',
  idempotency_conflict: 'This booking was already submitted. Check your bookings.',
  confirm_failed: 'We could not complete the booking. Please try again.',
  nothing_to_pay: 'There is nothing to pay online for this booking.',
  coupon_not_found: 'We do not recognise that code.',
  coupon_used: 'That coupon has already been used.',
  coupon_expired: 'That coupon has expired.',
  coupon_wrong_tier: 'That code is for another membership level.',
  coupon_no_capacity: 'That code has been fully claimed.',
  coupon_untyped: 'That reward cannot be used as a coupon.',
  hold_expired: 'This took a little too long. Please check the price again.',
  price_changed: 'The price has changed. Please check it again.',
  room_unavailable: 'That room was just booked. Please choose another.',
  pms_unavailable: 'We could not reach the booking system. Please try again in a moment.',
  invalid_stay: 'Those dates cannot be booked online.',
  hold_not_found: 'We could not find that booking. Please start again.',
  payment_check_failed: 'We could not check your payment just now. No new payment was made. Please try to confirm once more.',
}

/** `payment_check_failed` alone lives under `portal.book.error.*`, not the flat `portal.book.*` every other
 *  code here uses — the fix-wave brief names that exact key, one level deeper, for the one code that is
 *  answered by a Stripe-reachability check rather than a booking-domain rule. */
export function bookErrorKey(code: string | null): string {
  if (code === null || !(code in BOOK_ERROR_FALLBACK)) return 'portal.common.error'
  return code === 'payment_check_failed' ? 'portal.book.error.payment_check_failed' : `portal.book.${code}`
}

/** The bundle's own English sentence for a `bookErrorKey()` code, or the generic fallback for anything
 *  `bookErrorKey` doesn't map — pass this as `t()`'s second argument alongside `bookErrorKey(code)`. */
export function bookErrorFallback(code: string | null): string {
  return (code !== null && BOOK_ERROR_FALLBACK[code]) || 'Something went wrong. Please try again.'
}

/**
 * Every code the cancel endpoint can answer with, mapped to the exact English sentence
 * `portal.bookings.cancel_error.<code>` carries in the bundle. `not_found` is left out on purpose: the
 * sheet that offers Cancel has already loaded the booking, so it falls back to the generic error.
 * `cancel_failed` — the endpoint's own catch-all 500 — is mapped: a refund may already have gone through
 * before the failure, so its sentence must not claim nothing happened.
 * `portalApi.test.ts` proves each one is byte-identical to `portal.en.json`.
 */
const CANCEL_ERROR_FALLBACK: Record<string, string> = {
  outside_policy: 'Free cancellation has ended for this booking. Please contact the venue.',
  not_cancellable: 'This booking cannot be cancelled here. Please contact the venue.',
  already_cancelled: 'This booking is already cancelled.',
  cancel_in_progress: 'This booking is being cancelled. Please check it again in a moment.',
  refund_failed: 'We could not return the payment just now, so the booking was not cancelled. Please try again in a moment.',
  refund_unavailable: 'The payment cannot be returned here, so the booking was not cancelled. Please contact the venue.',
  cancel_failed: 'We could not finish cancelling this booking. If a refund was due it may already be on its way. Please try again, or contact the venue.',
}

export function cancelErrorKey(code: string | null): string {
  return code !== null && code in CANCEL_ERROR_FALLBACK ? `portal.bookings.cancel_error.${code}` : 'portal.common.error'
}

export function cancelErrorFallback(code: string | null): string {
  return (code !== null && CANCEL_ERROR_FALLBACK[code]) || 'Something went wrong. Please try again.'
}
