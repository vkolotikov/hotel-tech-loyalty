import { api } from '../../lib/api'
import type {
  Benefit, BookingKind, CardPayload, Claim, LaravelPage, Offer, Paginated, PortalBooking, PortalBootstrap, Redemption, Reward, Activity,
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
}

/** The server's sentence when it sent one, else the caller's fallback. */
export function apiMessage(error: unknown, fallback: string): string {
  const res = (error as { response?: { data?: { message?: string; error?: string; errors?: Record<string, string[]> } } })?.response
  const first = res?.data?.errors ? Object.values(res.data.errors)[0]?.[0] : undefined
  return first || res?.data?.message || fallback
}
