import { isHex } from '../../theme/colour'
import { onColor } from '../../theme/glass'
import { useIsLight } from '../../theme/hx'

interface TierBadgeProps {
  tier: string
  color?: string
}

const DARK_TEXT_TIERS = ['#ffd700', '#c0c0c0', '#e5e4e2', '#b9f2ff']

/**
 * Text colour on a tier fill. Glass and Classic keep the old rule. Clean light
 * follows the shared fill rule (onColor: white while white reads at 3:1,
 * dark ink below), so a pale tier fill no longer carries unreadable white.
 */
export function tierBadgeText(color: string, light: boolean): string {
  if (DARK_TEXT_TIERS.includes(color.toLowerCase())) return '#333'
  if (light && isHex(color)) return onColor(color)
  return 'white'
}

export function TierBadge({ tier, color }: TierBadgeProps) {
  const light = useIsLight()
  const style = color ? { backgroundColor: color, color: tierBadgeText(color, light) } : undefined

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold tier-${tier.toLowerCase()}`}
      style={style}
    >
      {tier}
    </span>
  )
}
