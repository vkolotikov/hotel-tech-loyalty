import type { Offer } from '../../lib/types'

type T = (key: string, fallback: string, vars?: Record<string, unknown>) => string

/** "15% off" / "25 off" / "2x points" — only for types the engine can price. */
export function offerValueLabel(offer: Offer, t: T): string | null {
  const value = Number(offer.value ?? 0)
  if (!value) return null
  const type = String(offer.type ?? '').toLowerCase()
  if (type.includes('percent') || type === 'discount') return t('portal.rewards.percent_off', '{{value}}% off', { value })
  if (type.includes('amount') || type.includes('fixed')) return t('portal.rewards.amount_off', '{{value}} off', { value })
  if (type.includes('point')) return t('portal.rewards.points_multiplier', '{{value}}x points', { value })
  return null
}
