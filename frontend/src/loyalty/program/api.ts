import type { QueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { loyaltyUrl, watched } from '../lib/api'
import { PLACES_KEY } from '../places/placesApi'
import type { Benefit, BenefitBody, BenefitRemoval, Boost, BoostBody, Program, Tier, TierBenefit, TierBenefitBody, TierBody, TierRemoval } from './types'

/** Program's calls (spec 2026-10-21 §6.4): one read, and the managers' writes. */
export const programApi = {
  program: (): Promise<Program> => watched(api.get(loyaltyUrl('program'))),

  createTier: (body: TierBody): Promise<{ tier: Tier }> => watched(api.post(loyaltyUrl('program/tiers'), body)),
  updateTier: (id: number, body: TierBody): Promise<{ tier: Tier }> => watched(api.put(loyaltyUrl(`program/tiers/${id}`), body)),
  /** Release 11: a new name alone (its other settings stay as they are). */
  renameTier: (id: number, name: string): Promise<{ tier: Tier }> => watched(api.put(loyaltyUrl(`program/tiers/${id}`), { name })),
  /** Release 11: what deleting the tier would do, then the delete itself (its members moving to `moveTo`). */
  tierRemoval: (id: number): Promise<{ removal: TierRemoval }> => watched(api.get(loyaltyUrl(`program/tiers/${id}/removal`))),
  removeTier: (id: number, moveTo: number | null): Promise<{ removed: Record<string, number> }> =>
    watched(api.delete(loyaltyUrl(`program/tiers/${id}`), { params: moveTo === null ? {} : { move_to: moveTo } })),
  attachBenefit: (tierId: number, body: TierBenefitBody): Promise<{ tier_benefit: TierBenefit }> =>
    watched(api.post(loyaltyUrl(`program/tiers/${tierId}/benefits`), body)),
  detachBenefit: (tierId: number, tierBenefitId: number): Promise<{ ok: boolean }> =>
    watched(api.delete(loyaltyUrl(`program/tiers/${tierId}/benefits/${tierBenefitId}`))),

  createBenefit: (body: BenefitBody): Promise<{ benefit: Benefit }> => watched(api.post(loyaltyUrl('program/benefits'), body)),
  updateBenefit: (id: number, body: BenefitBody): Promise<{ benefit: Benefit }> => watched(api.put(loyaltyUrl(`program/benefits/${id}`), body)),
  benefitRemoval: (id: number): Promise<{ removal: BenefitRemoval }> => watched(api.get(loyaltyUrl(`program/benefits/${id}/removal`))),
  removeBenefit: (id: number): Promise<{ removed: { tiers: number } }> => watched(api.delete(loyaltyUrl(`program/benefits/${id}`))),

  createBoost: (body: BoostBody): Promise<{ boost: Boost }> => watched(api.post(loyaltyUrl('program/boosts'), body)),
  updateBoost: (id: number, body: BoostBody): Promise<{ boost: Boost }> => watched(api.put(loyaltyUrl(`program/boosts/${id}`), body)),
  removeBoost: (id: number): Promise<{ ok: boolean }> => watched(api.delete(loyaltyUrl(`program/boosts/${id}`))),
  /** Release 6: "These times are right" — stamps the named boosts still flagged, changes no time (a manager's). */
  confirmTimes: (ids: number[]): Promise<{ confirmed: number[]; unchanged: number[] }> =>
    watched(api.post(loyaltyUrl('program/boosts/confirm-times'), { ids })),
}

export const PROGRAM_KEY = ['loyalty', 'program'] as const
/** Where a removal's preview is kept while its dialog is open (release 11; read fresh each time it opens). */
export const removalKey = (kind: 'tier' | 'benefit', id: number) => ['loyalty', 'program', 'removal', kind, id] as const

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
