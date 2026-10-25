import { Award, BadgePercent, BedDouble, Car, Coins, Flower2, Gift, KeyRound, UtensilsCrossed, type LucideIcon } from 'lucide-react'
import type { BenefitPreview } from '../../lib/types'

/**
 * A benefit's icon by its category (the server's benefit categories, LoyaltyForms::BENEFIT_CATEGORIES); a category this
 * does not know reads as a gift. Only a picture: the benefit's name always stands beside it.
 */
const ICONS: Record<string, LucideIcon> = {
  accommodation: BedDouble,
  dining: UtensilsCrossed,
  wellness: Flower2,
  transport: Car,
  recognition: Award,
  points: Coins,
  access: KeyRound,
  discount: BadgePercent,
}

export function benefitIcon(category: string | null | undefined): LucideIcon {
  return ICONS[category ?? ''] ?? Gift
}

/** The card's benefit chips: the first few as the server ordered them, and how many more the Benefits tab lists. */
export function benefitChips(benefits: BenefitPreview[] | null | undefined, max = 4): { shown: BenefitPreview[]; more: number } {
  const all = benefits ?? []
  return { shown: all.slice(0, max), more: Math.max(0, all.length - max) }
}
