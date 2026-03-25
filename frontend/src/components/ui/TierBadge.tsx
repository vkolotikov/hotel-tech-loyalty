interface TierBadgeProps {
  tier: string
  color?: string
}

export function TierBadge({ tier, color }: TierBadgeProps) {
  const style = color
    ? { backgroundColor: color, color: ['#FFD700', '#C0C0C0', '#E5E4E2', '#B9F2FF'].includes(color) ? '#333' : 'white' }
    : undefined

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold tier-${tier.toLowerCase()}`}
      style={style}
    >
      {tier}
    </span>
  )
}
