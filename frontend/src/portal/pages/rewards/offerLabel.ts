import type { Offer } from '../../lib/types'
import { counted } from '../../lib/plural'

type T = (key: string, fallback: string, vars?: Record<string, unknown>) => string

const kind = (offer: Offer) => String(offer.type ?? '').toLowerCase()

/**
 * "15% off" / "25 off" / "2x points" / "+500 points" — only for types with a number the member gets. A bonus_points
 * offer's value is points added when it is claimed (release 7), never a multiplier; the phrase agrees with its number.
 */
export function offerValueLabel(offer: Offer, t: T): string | null {
  const value = Number(offer.value ?? 0)
  if (!value) return null
  const type = kind(offer)
  if (type === 'bonus_points') return counted(t, 'rewards.bonus_points', Math.round(value))
  if (type.includes('percent') || type === 'discount') return t('portal.rewards.percent_off', '{{value}}% off', { value })
  if (type.includes('amount') || type.includes('fixed')) return t('portal.rewards.amount_off', '{{value}} off', { value })
  if (type.includes('point')) return t('portal.rewards.points_multiplier', '{{value}}x points', { value })
  return null
}

/**
 * What a perk offer is (release 7): a free night, an upgrade or cashback is given by the venue in person — staff
 * honour it at the desk; cashback here is the venue's own, not the programme's credit. Null for every other type.
 */
export function offerPerkNote(offer: Offer, t: T): string | null {
  switch (kind(offer)) {
    case 'free_night': return t('portal.rewards.perk_free_night', 'A free night, given by the venue — show this when you book or arrive.')
    case 'upgrade': return t('portal.rewards.perk_upgrade', 'An upgrade, given by the venue — show this when you arrive.')
    case 'cashback': return t('portal.rewards.perk_cashback', 'Cashback, given by the venue at the desk — show this when you pay.')
    default: return null
  }
}

/** Whether claiming the offer adds points straight away (and so leaves nothing to show at the desk). */
export function paysPointsOnClaim(offer: Offer | null | undefined): boolean {
  return !!offer && kind(offer) === 'bonus_points' && Number(offer.value ?? 0) > 0
}

/** The claim's answer as the member reads it: the points it added, or "show it at the desk". */
export function claimedMessage(reply: { points_awarded?: number | null } | null | undefined, t: T): string {
  const points = Number(reply?.points_awarded ?? 0)
  return points > 0 ? counted(t, 'rewards.claimed_points', points) : t('portal.rewards.claimed', 'Offer claimed — show it at the desk')
}
