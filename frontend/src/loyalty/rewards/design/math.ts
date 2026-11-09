import type { Benefit, Tier } from '../../program/types'
import type { Offer, Reward } from '../types'
import type { RewardOptions } from '../types'
import { rewardProblems, type RewardForm } from '../rewardsMath'

export interface RewardModes { stock: 'unlimited' | 'limited'; limit: 'none' | 'once' | 'custom'; expiry: 'none' | 'date' }
export function rewardModes(form: RewardForm): RewardModes {
  return { stock: form.stock === '' ? 'unlimited' : 'limited', limit: form.per_member_limit === '' ? 'none' : form.per_member_limit === '1' ? 'once' : 'custom', expiry: form.expires_at ? 'date' : 'none' }
}
/** A temporarily empty custom input stays visible and invalid; it never silently becomes an unlimited setting. */
export function rewardEditorProblems(form: RewardForm, options: RewardOptions, modes: RewardModes): ReturnType<typeof rewardProblems> {
  return { ...rewardProblems(form, options), ...(modes.stock === 'limited' && !form.stock.trim() ? { stock: 'stock' } : {}), ...(modes.limit === 'custom' && !form.per_member_limit.trim() ? { per_member_limit: 'per_member_limit' } : {}), ...(modes.expiry === 'date' && !form.expires_at ? { expires_at: 'expires_at' } : {}) }
}

/** Match the member redemption gate; stock is remaining stock, not an original allocation. */
export function rewardStatus(reward: Reward, now = Date.now()): 'off' | 'ended' | 'soldOut' | 'active' {
  if (!reward.is_active) return 'off'
  if (reward.expires_at && new Date(reward.expires_at).getTime() <= now) return 'ended'
  if (reward.stock !== null && reward.stock <= 0) return 'soldOut'
  return 'active'
}

export function benefitAssignments(benefit: Benefit, tiers: Tier[]) {
  return tiers.flatMap(tier => tier.benefits.filter(b => b.benefit_id === benefit.id).map(value => ({ tier, value })))
}

export interface OfferFilters { q: string; brand: string; status: string }

/** One filter decision for both the list and the return from an editor. */
export function offerMatches(offer: Offer, filters: OfferFilters, brandName: string): boolean {
  return `${offer.title} ${brandName} ${offer.code ?? ''}`.toLocaleLowerCase().includes(filters.q.toLocaleLowerCase())
    && (filters.brand === 'all' || (filters.brand === 'every' ? offer.brand_id == null : String(offer.brand_id) === filters.brand))
    && (filters.status === 'all' || (filters.status === 'current' ? ['live', 'upcoming'].includes(offer.state) : offer.state === filters.status))
}

/** Keep the saved/cancelled selection visible, retaining each filter that still matches it. */
export function offerReadUrl(search: string, offer: Offer, brandName: string, saved = false): string {
  const params = new URLSearchParams(search)
  const filters = { q: params.get('q') ?? '', brand: params.get('brand') ?? 'all', status: params.get('status') ?? 'current' }
  const any = { q: '', brand: 'all', status: 'all' }
  return rewardsUrl('offers', {
    q: offerMatches(offer, { ...any, q: filters.q }, brandName) ? filters.q : null,
    brand: offerMatches(offer, { ...any, brand: filters.brand }, brandName) ? filters.brand : 'all',
    status: offerMatches(offer, { ...any, status: filters.status }, brandName) ? filters.status : 'all',
    selected: offer.id, saved: saved ? '1' : null,
  })
}

/** Keep legacy tab addresses intact and isolate list filters from editor addresses. */
export function rewardsUrl(tab: string, values: Record<string, string | number | null | undefined> = {}) {
  const params = new URLSearchParams(tab === 'catalogue' ? '' : `tab=${tab}`)
  for (const [key, value] of Object.entries(values)) if (value !== null && value !== undefined && value !== '') params.set(key, String(value))
  return `/loyalty/rewards${params.size ? `?${params}` : ''}`
}
