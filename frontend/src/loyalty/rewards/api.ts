import type { QueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { loyaltyUrl, watched } from '../lib/api'
import type {
  Catalogue, Offer, OfferBody, OffersList, Redemption, RedemptionFilter, RedemptionsPage, ReferralsPage, Reward, RewardBody,
} from './types'

/** Rewards' calls (spec 2026-10-21 §6.4): the catalogue, redemptions, offers and referrals. */
export const rewardsApi = {
  catalogue: (): Promise<Catalogue> => watched(api.get(loyaltyUrl('rewards'))),
  createReward: (body: RewardBody): Promise<{ reward: Reward }> => watched(api.post(loyaltyUrl('rewards'), body)),
  updateReward: (id: number, body: RewardBody): Promise<{ reward: Reward }> => watched(api.put(loyaltyUrl(`rewards/${id}`), body)),

  redemptions: (filter: RedemptionFilter, page: number): Promise<RedemptionsPage> =>
    watched(api.get(loyaltyUrl('redemptions'), { params: { state: filter, ...(page > 1 ? { page } : {}) } })),
  fulfil: (id: number): Promise<{ redemption: Redemption }> => watched(api.post(loyaltyUrl(`redemptions/${id}/fulfil`))),
  cancel: (id: number): Promise<{ redemption: Redemption }> => watched(api.post(loyaltyUrl(`redemptions/${id}/cancel`))),

  offers: (): Promise<OffersList> => watched(api.get(loyaltyUrl('offers'))),
  createOffer: (body: OfferBody): Promise<{ offer: Offer }> => watched(api.post(loyaltyUrl('offers'), body)),
  updateOffer: (id: number, body: OfferBody): Promise<{ offer: Offer }> => watched(api.put(loyaltyUrl(`offers/${id}`), body)),

  referrals: (page: number): Promise<ReferralsPage> => watched(api.get(loyaltyUrl('referrals'), { params: page > 1 ? { page } : {} })),
}

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
