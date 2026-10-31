import { api } from '../../lib/api'
import type {
  Benefit, BookingKind, CancelReply, CardPayload, Catalogue, Claim, ConfirmBody, LaravelPage, Offer, Paginated, PaymentIntentReply, PaymentReturn, PortalBooking,
  PortalBootstrap, Quote, QuoteBody, Redemption, ResolvedCoupon, Reward, Slot, Activity, InboxNotification,
  StayAvailability, StayCatalogue, StayConfirmBody, StayQuote, StayQuoteBody,
} from './types'

/** Notifications per inbox page. */
export const INBOX_PAGE_SIZE = 20

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

  // ─── The inbox (release 4, part A): the member app's own endpoints, unchanged ───
  notifications: (page: number): Promise<LaravelPage<InboxNotification>> =>
    api.get('/v1/member/notifications', { params: { page, per_page: INBOX_PAGE_SIZE } }).then(r => r.data),
  markNotificationRead: (id: number): Promise<{ message: string }> => api.post(`/v1/member/notifications/${id}/read`).then(r => r.data),
  markAllNotificationsRead: (): Promise<{ message: string }> => api.post('/v1/member/notifications/read-all').then(r => r.data),

  // ─── Service booking (the Book flow) ─────────────────────────────────────
  catalogue: (): Promise<Catalogue> => api.get('/v1/member/portal/services').then(r => r.data),
  calendar: (serviceId: number, masterId: number | null, start: string, end: string): Promise<{ available_dates: string[] }> =>
    api.get('/v1/member/portal/services/calendar', { params: { service_id: serviceId, master_id: masterId ?? undefined, start, end } }).then(r => r.data),
  availability: (serviceId: number, masterId: number | null, date: string): Promise<{ slots: Slot[] }> =>
    api.get('/v1/member/portal/services/availability', { params: { service_id: serviceId, master_id: masterId ?? undefined, date } }).then(r => r.data),
  quote: (body: QuoteBody): Promise<Quote> => api.post('/v1/member/portal/services/quote', body).then(r => r.data),
  // The visit's Idempotency-Key travels with it (release 4, part C): a pay-at-venue grant, if the server offers one,
  // is for the one booking the confirm under that same key makes.
  paymentIntent: (body: QuoteBody, idempotencyKey?: string): Promise<PaymentIntentReply> =>
    api.post('/v1/member/portal/services/payment-intent', body, idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : undefined).then(r => r.data),
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

  // ─── Return from a bank redirect (release 4, part C) ─────────────────────
  // Read only: what the payment is for, from its own metadata on the server — then the ordinary confirm above.
  paymentReturn: (paymentIntentId: string): Promise<PaymentReturn> =>
    api.get(`/v1/member/portal/payments/${encodeURIComponent(paymentIntentId)}`).then(r => r.data),

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

// The Book and cancel flows' error sentences live in `bookErrors.ts`, framework-free, so the members' app shares them.
export { bookErrorKey, bookErrorFallback, cancelErrorKey, cancelErrorFallback } from './bookErrors'
