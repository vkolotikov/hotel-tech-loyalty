import {
  Building2, Dumbbell, GraduationCap, Home, Scale, Sparkles, Stethoscope, Store, Utensils,
  type LucideIcon,
} from 'lucide-react'

/**
 * THE TRADE'S ICON on the Design tab's trade chips (2026-09-09, the owner:
 * "add some icons in industry design buttons … make it more compact, more
 * visual").
 *
 * Presentation only, keyed by `Organization::INDUSTRIES` id — the same rule
 * `FIELD_PRESENTATION` follows: which trades are OFFERED still comes off the
 * served `industries[*]` rows (see `industryChips`), and an id this map does
 * not know wears the storefront rather than nothing, so a new trade on the
 * server never draws a chip with a hole in it.
 *
 * The choices are the ones `IndustrySwitcherPanel` already draws for the
 * same ids, so a business meets the same picture for its trade in Settings
 * and on its page's Design tab.
 */
export const INDUSTRY_ICONS: Record<string, LucideIcon> = {
  hotel: Building2,
  beauty: Sparkles,
  medical: Stethoscope,
  restaurant: Utensils,
  legal: Scale,
  real_estate: Home,
  education: GraduationCap,
  fitness: Dumbbell,
}

export function industryIcon(id: string): LucideIcon {
  return INDUSTRY_ICONS[id] ?? Store
}
