import { ApiError, failureFrom } from './failure'
import type { Activity, Benefit, BookingKind, CancelReply, Catalogue, Claim, ConfirmBody, PaymentIntentReply, Quote, QuoteBody, ResolvedCoupon, Slot, StayAvailability, StayCatalogue, StayConfirmBody, StayQuote, StayQuoteBody, InboxNotification, JoinContext, LaravelPage, MemberCardAnswer, MemberCredit, MemberStamps, Offer, Paginated, PortalBooking, PortalBootstrap, PortalEvent, PortalEvents, Redemption, Reward, SignInAnswer } from './types'
import type { AppVersions } from './version'
import { mediaAddress } from './format'

/** The HexaTech API (production by default; a development build may point elsewhere with EXPO_PUBLIC_API_URL). */
export const API_BASE = (process.env.EXPO_PUBLIC_API_URL ?? 'https://app.hexa-tech.uk/api').replace(/\/+$/, '')
/** The web app beside it, for the pages a phone opens in the browser (password reset, account set-up). */
export const WEB_BASE = (process.env.EXPO_PUBLIC_WEB_URL ?? API_BASE.replace(/\/api$/, '')).replace(/\/+$/, '')

/** Where the API's stored pictures are served (`/storage/…` beside the API). */
const API_ORIGIN = API_BASE.replace(/\/api$/, '')

/** A stored picture's address as the phone must ask for it (relative `/storage/…` answers resolved beside the API). */
export function mediaUrl(url: string | null | undefined): string | null {
  return mediaAddress(url, API_ORIGIN)
}

const TIMEOUT_MS = 15_000

type Query = Record<string, string | number | null | undefined>

let readToken: () => string | null = () => null
let readLanguage: () => string = () => 'en'
let onSignedOut: () => void = () => {}

/** The session tells the client where the token is and what to do when the server no longer accepts it. */
export function connectSession(options: { token: () => string | null; language: () => string; signedOut: () => void }): void {
  readToken = options.token
  readLanguage = options.language
  onSignedOut = options.signedOut
}

function withQuery(path: string, query?: Query): string {
  const parts = Object.entries(query ?? {})
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
  if (parts.length === 0) return path
  return `${path}${path.includes('?') ? '&' : '?'}${parts.join('&')}`
}

async function send<T>(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown, query?: Query, asToken?: string, extraHeaders?: Record<string, string>): Promise<T> {
  const token = asToken ?? readToken()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(`${API_BASE}${withQuery(path, query)}`, {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Accept-Language': readLanguage(),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...extraHeaders,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    })
  } catch {
    throw new ApiError(failureFrom(0, null))
  } finally {
    clearTimeout(timer)
  }

  const text = await response.text()
  let parsed: unknown = null
  try {
    parsed = text ? JSON.parse(text) : null
  } catch {
    parsed = null
  }
  if (!response.ok) {
    const failure = failureFrom(response.status, parsed)
    // A token the server no longer knows ends the session; a refused sign-in does not.
    if (response.status === 401 && token && !asToken) onSignedOut()
    throw new ApiError(failure)
  }
  return parsed as T
}

/** Reads are asked once more after no answer or a server error; writes never are on their own. */
async function read<T>(path: string, query?: Query): Promise<T> {
  try {
    return await send<T>('GET', path, undefined, query)
  } catch (error) {
    const status = error instanceof ApiError ? error.failure.status : 0
    if (status === 0 || status >= 500) return send<T>('GET', path, undefined, query)
    throw error
  }
}

export const api = {
  signIn: (email: string, password: string, device: string): Promise<SignInAnswer> =>
    send('POST', '/v1/auth/login', { email, password, device, user_type: 'member' }),
  /** Revokes this token; sent with the token itself, which the session has already forgotten. */
  signOut: (token: string): Promise<unknown> => send('DELETE', '/v1/auth/logout', undefined, undefined, token),
  joinContext: (orgToken: string): Promise<JoinContext> => send('GET', `/v1/public/join/${encodeURIComponent(orgToken)}`),
  register: (body: { name: string; email: string; phone: string; password: string; password_confirmation: string; referral_code: string; org_token: string }): Promise<SignInAnswer> =>
    send('POST', '/v1/auth/register', body),

  /** Which versions of this app the server still serves; public, asked before sign-in too. */
  appVersions: (): Promise<AppVersions> => read('/v1/apps/member/version'),
  /** Everything the home screen needs at once (the portal's own bootstrap). */
  bootstrap: (): Promise<PortalBootstrap> => read('/v1/member/portal'),
  card: (): Promise<MemberCardAnswer> => read('/v1/member/card'),
  pointsHistory: (page: number): Promise<LaravelPage<Activity>> => read('/v1/member/points/history', { page, per_page: 20 }),
  appleWalletLink: (): Promise<{ url: string; expires_in: number }> => read('/v1/member/card/apple-wallet/link'),
  googleWallet: (): Promise<{ saveUrl?: string; save_url?: string }> => read('/v1/member/card/google-wallet'),

  // The portal's own member endpoints (frontend/src/portal/lib/portalApi.ts), the same calls and shapes.
  benefits: (): Promise<{ tier: string | null; benefits: Benefit[] }> => read('/v1/member/benefits'),
  requestBenefit: (tierBenefitId: number): Promise<unknown> => send('POST', `/v1/member/benefits/${tierBenefitId}/request`),
  cancelBenefitRequest: (requestId: number): Promise<unknown> => send('DELETE', `/v1/member/benefits/requests/${requestId}`),
  rewards: (): Promise<{ rewards: Reward[]; current_points: number }> => read('/v1/member/rewards'),
  redeem: (rewardId: number): Promise<{ redemption: Redemption; message: string }> => send('POST', `/v1/member/rewards/${rewardId}/redeem`),
  redemptions: (): Promise<{ redemptions: Redemption[] }> => read('/v1/member/my/redemptions'),
  offers: (): Promise<{ general: Offer[]; personalized: Claim[] }> => read('/v1/member/offers'),
  claimOffer: (offerId: number): Promise<{ points_awarded?: number | null }> => send('POST', `/v1/member/offers/${offerId}/claim`),
  notifications: (page: number): Promise<LaravelPage<InboxNotification>> => read('/v1/member/notifications', { page, per_page: 20 }),
  markRead: (id: number): Promise<unknown> => send('POST', `/v1/member/notifications/${id}/read`),
  markAllRead: (): Promise<unknown> => send('POST', '/v1/member/notifications/read-all'),
  updateProfile: (payload: Record<string, unknown>): Promise<unknown> => send('PUT', '/v1/member/profile', payload),
  changePassword: (payload: { current_password: string; password: string; password_confirmation: string }): Promise<unknown> => send('PUT', '/v1/member/password', payload),
  deleteAccount: (payload: { password: string; confirmation: string }): Promise<unknown> => send('DELETE', '/v1/member/account', payload),
  stamps: (): Promise<MemberStamps> => read('/v1/member/portal/stamps'),
  credit: (): Promise<MemberCredit> => read('/v1/member/portal/credit'),
  events: (): Promise<PortalEvents> => read('/v1/member/portal/events'),
  eventSignUp: (id: number): Promise<{ event: PortalEvent }> => send('POST', `/v1/member/portal/events/${id}/sign-up`),
  eventCancel: (id: number): Promise<{ event: PortalEvent }> => send('DELETE', `/v1/member/portal/events/${id}/sign-up`),
  referral: (): Promise<{ referral_code: string | null; referral_link: string | null; total_referrals: number; rewarded_referrals: number }> => read('/v1/member/referral'),

  /** This phone's push token for the member (one per member, as the server keeps it). */
  savePushToken: (token: string): Promise<unknown> => send('POST', '/v1/auth/push-token', { expo_push_token: token }),
  /** Before signing out, with the session's own token: the member's push token is cleared when it is this phone's. */
  forgetPushToken: (token: string, authToken: string): Promise<unknown> => send('DELETE', '/v1/auth/push-token', { expo_push_token: token }, undefined, authToken),

  // ─── Bookings (the portal's member endpoints, unchanged) ───
  bookings: (scope: 'upcoming' | 'past', page = 1): Promise<Paginated<PortalBooking>> => read('/v1/member/portal/bookings', { scope, page }),
  booking: (kind: BookingKind, id: number): Promise<PortalBooking> => read(`/v1/member/portal/bookings/${kind}/${id}`),
  cancelBooking: (kind: BookingKind, id: number): Promise<CancelReply> => send('POST', `/v1/member/portal/bookings/${kind}/${id}/cancel`),

  // ─── Appointments (the portal's Book flow; prices, holds and payments are the server's) ───
  catalogue: (): Promise<Catalogue> => read('/v1/member/portal/services'),
  calendar: (serviceId: number, masterId: number | null, start: string, end: string): Promise<{ available_dates: string[] }> =>
    read('/v1/member/portal/services/calendar', { service_id: serviceId, master_id: masterId ?? undefined, start, end }),
  availability: (serviceId: number, masterId: number | null, date: string): Promise<{ slots: Slot[] }> =>
    read('/v1/member/portal/services/availability', { service_id: serviceId, master_id: masterId ?? undefined, date }),
  quote: (body: QuoteBody): Promise<Quote> => send('POST', '/v1/member/portal/services/quote', body),
  /** The visit's Idempotency-Key travels with it: a pay-at-venue grant, if the server offers one, is for the one booking
   *  the confirm under that same key makes. */
  paymentIntent: (body: QuoteBody, idempotencyKey: string): Promise<PaymentIntentReply> =>
    send('POST', '/v1/member/portal/services/payment-intent', body, undefined, undefined, { 'Idempotency-Key': idempotencyKey }),
  confirm: (body: ConfirmBody, idempotencyKey: string): Promise<{ booking: PortalBooking; replayed: boolean }> =>
    send('POST', '/v1/member/portal/services/confirm', body, undefined, undefined, { 'Idempotency-Key': idempotencyKey }),
  resolveCoupon: (code: string): Promise<ResolvedCoupon> => send('POST', '/v1/member/portal/coupons/resolve', { code }),

  // ─── Stays (the portal's stay flow; the quote names a hold, the server prices and books it) ───
  stayCatalogue: (): Promise<StayCatalogue> => read('/v1/member/portal/stays'),
  stayAvailability: (checkIn: string, checkOut: string, adults: number, children: number): Promise<StayAvailability> =>
    read('/v1/member/portal/stays/availability', { check_in: checkIn, check_out: checkOut, adults, children }),
  stayQuote: (body: StayQuoteBody): Promise<StayQuote> => send('POST', '/v1/member/portal/stays/quote', body),
  stayPaymentIntent: (holdToken: string): Promise<PaymentIntentReply> => send('POST', '/v1/member/portal/stays/payment-intent', { hold_token: holdToken }),
  /** No Idempotency-Key: a hold is booked once, and a repeated confirm answers the booking it became. */
  stayConfirm: (body: StayConfirmBody): Promise<{ booking: PortalBooking; replayed: boolean }> => send('POST', '/v1/member/portal/stays/confirm', body),
}
