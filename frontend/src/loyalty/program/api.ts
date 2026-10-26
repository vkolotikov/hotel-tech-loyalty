import type { QueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { loyaltyUrl, watched } from '../lib/api'
import { PLACES_KEY } from '../places/placesApi'
import type { Benefit, BenefitBody, Boost, BoostBody, Program, Tier, TierBenefit, TierBenefitBody, TierBody } from './types'

/** Program's calls (spec 2026-10-21 §6.4): one read, and the managers' writes. */
export const programApi = {
  program: (): Promise<Program> => watched(api.get(loyaltyUrl('program'))),

  createTier: (body: TierBody): Promise<{ tier: Tier }> => watched(api.post(loyaltyUrl('program/tiers'), body)),
  updateTier: (id: number, body: TierBody): Promise<{ tier: Tier }> => watched(api.put(loyaltyUrl(`program/tiers/${id}`), body)),
  attachBenefit: (tierId: number, body: TierBenefitBody): Promise<{ tier_benefit: TierBenefit }> =>
    watched(api.post(loyaltyUrl(`program/tiers/${tierId}/benefits`), body)),
  detachBenefit: (tierId: number, tierBenefitId: number): Promise<{ ok: boolean }> =>
    watched(api.delete(loyaltyUrl(`program/tiers/${tierId}/benefits/${tierBenefitId}`))),

  createBenefit: (body: BenefitBody): Promise<{ benefit: Benefit }> => watched(api.post(loyaltyUrl('program/benefits'), body)),
  updateBenefit: (id: number, body: BenefitBody): Promise<{ benefit: Benefit }> => watched(api.put(loyaltyUrl(`program/benefits/${id}`), body)),

  createBoost: (body: BoostBody): Promise<{ boost: Boost }> => watched(api.post(loyaltyUrl('program/boosts'), body)),
  updateBoost: (id: number, body: BoostBody): Promise<{ boost: Boost }> => watched(api.put(loyaltyUrl(`program/boosts/${id}`), body)),
  removeBoost: (id: number): Promise<{ ok: boolean }> => watched(api.delete(loyaltyUrl(`program/boosts/${id}`))),
  /** Release 6: "These times are right" — stamps the named boosts still flagged, changes no time (a manager's). */
  confirmTimes: (ids: number[]): Promise<{ confirmed: number[]; unchanged: number[] }> =>
    watched(api.post(loyaltyUrl('program/boosts/confirm-times'), { ids })),
}

export const PROGRAM_KEY = ['loyalty', 'program'] as const

/**
 * What a saved change makes stale. The shell, the members list and Find read the tiers from the bootstrap, so a tier
 * change reads it again, and the places list too (its chips carry the tiers' names and colours); a member's page shows
 * the tier's benefits by name, so a benefit change reads those again.
 */
export function afterProgramChange(client: QueryClient, touched: { tiers?: boolean; benefits?: boolean } = {}): void {
  void client.invalidateQueries({ queryKey: PROGRAM_KEY })
  if (touched.tiers) {
    void client.invalidateQueries({ queryKey: ['loyalty', 'bootstrap'] })
    void client.invalidateQueries({ queryKey: PLACES_KEY, exact: true })
  }
  if (touched.benefits || touched.tiers) void client.invalidateQueries({ queryKey: ['loyalty', 'member'] })
}
