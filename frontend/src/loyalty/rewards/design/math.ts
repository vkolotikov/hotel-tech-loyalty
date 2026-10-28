import type { Benefit, Tier } from '../../program/types'
import type { Reward } from '../types'
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

/** Keep legacy tab addresses intact and isolate list filters from editor addresses. */
export function rewardsUrl(tab: string, values: Record<string, string | number | null | undefined> = {}) {
  const params = new URLSearchParams(tab === 'catalogue' ? '' : `tab=${tab}`)
  for (const [key, value] of Object.entries(values)) if (value !== null && value !== undefined && value !== '') params.set(key, String(value))
  return `/loyalty/rewards${params.size ? `?${params}` : ''}`
}
