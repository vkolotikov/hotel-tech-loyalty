import type { QueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { loyaltyUrl, watched } from '../lib/api'
import type {
  Catalogue, Offer, OfferBody, OfferAttachment, OfferSendPreview, OffersList, Redemption, RedemptionFilter, RedemptionsPage, ReferralsPage, Reward, RewardBody,
} from './types'

/** Rewards' calls (spec 2026-10-21 §6.4): the catalogue, redemptions, offers and referrals. */
export const rewardsApi = {
  catalogue: (): Promise<Catalogue> => watched(api.get(loyaltyUrl('rewards'))),
  createReward: (body: RewardBody): Promise<{ reward: Reward }> => watched(api.post(loyaltyUrl('rewards'), body)),
  updateReward: (id: number, body: RewardBody): Promise<{ reward: Reward }> => watched(api.put(loyaltyUrl(`rewards/${id}`), body)),
  rewardState: (id: number, active: boolean): Promise<{ reward: Reward }> => watched(api.put(loyaltyUrl(`rewards/${id}/state`), { is_active: active })),
  deleteReward: (id: number): Promise<{ success: boolean }> => watched(api.delete(loyaltyUrl(`rewards/${id}`))),

  redemptions: (filter: RedemptionFilter, page: number, request?: number): Promise<RedemptionsPage> =>
    watched(api.get(loyaltyUrl('redemptions'), { params: { state: filter, ...(page > 1 ? { page } : {}), ...(request ? { request } : {}) } })),
  fulfil: (id: number): Promise<{ redemption: Redemption }> => watched(api.post(loyaltyUrl(`redemptions/${id}/fulfil`))),
  cancel: (id: number): Promise<{ redemption: Redemption }> => watched(api.post(loyaltyUrl(`redemptions/${id}/cancel`))),

  offers: (): Promise<OffersList> => watched(api.get(loyaltyUrl('offers'))),
  offerPreview: (id: number, member_ids: number[]): Promise<OfferSendPreview> => watched(api.post(loyaltyUrl(`offers/${id}/send-preview`), { member_ids })),
  sendOffer: (id: number, member_ids: number[], revision: string, idempotency_key: string): Promise<{ send_id: number; counts: OfferSendPreview['counts']; email_status: string; portal_done: boolean }> => watched(api.post(loyaltyUrl(`offers/${id}/send`), { member_ids, revision, idempotency_key })),
  uploadAttachment: (id: number, file: File): Promise<{ attachment: OfferAttachment }> => {
    const form = new FormData(); form.append('attachment', file)
    return watched(api.post(loyaltyUrl(`offers/${id}/attachment`), form))
  },
  removeAttachment: (id: number): Promise<{ attachment: null }> => watched(api.delete(loyaltyUrl(`offers/${id}/attachment`))),
  downloadAttachment: (id: number): Promise<Blob> => api.get(loyaltyUrl(`offers/${id}/attachment`), { responseType: 'blob' }).then(r => r.data),
  createOffer: (body: OfferBody): Promise<{ offer: Offer }> => watched(api.post(loyaltyUrl('offers'), body)),
  updateOffer: (id: number, body: OfferBody): Promise<{ offer: Offer }> => watched(api.put(loyaltyUrl(`offers/${id}`), body)),

  referrals: (page: number): Promise<ReferralsPage> => watched(api.get(loyaltyUrl('referrals'), { params: page > 1 ? { page } : {} })),

  /** A reward's or an offer's picture (release 2 §7): multipart `image`; answers the new address, or null once removed. */
  uploadPicture: (owner: PictureOwner, id: number, file: File): Promise<{ image_url: string }> => {
    const form = new FormData()
    form.append('image', file)
    return watched(api.post(loyaltyUrl(`${owner}/${id}/image`), form))
  },
  removePicture: (owner: PictureOwner, id: number): Promise<{ image_url: null }> => watched(api.delete(loyaltyUrl(`${owner}/${id}/image`))),
}

/** Whose picture: the path segment of its endpoints. */
export type PictureOwner = 'rewards' | 'offers'

export const CATALOGUE_KEY = ['loyalty', 'rewards', 'catalogue'] as const
export const OFFERS_KEY = ['loyalty', 'rewards', 'offers'] as const
export const redemptionsKey = (filter: RedemptionFilter, page: number) => ['loyalty', 'rewards', 'redemptions', filter, page] as const
export const referralsKey = (page: number) => ['loyalty', 'rewards', 'referrals', page] as const

/**
 * What a fulfilled or cancelled redemption makes stale: the list, the catalogue's counts and stock, and — a pending
 * one's points go back when it is cancelled — the member's balance, history and the members list.
 */
export function afterRedemption(client: QueryClient, memberId: number | null): void {
  void client.invalidateQueries({ queryKey: ['loyalty', 'rewards'] })
  if (memberId !== null) {
    void client.invalidateQueries({ queryKey: ['loyalty', 'member', memberId] })
    void client.invalidateQueries({ queryKey: ['loyalty', 'history', memberId] })
    void client.invalidateQueries({ queryKey: ['loyalty', 'members'] })
  }
}
