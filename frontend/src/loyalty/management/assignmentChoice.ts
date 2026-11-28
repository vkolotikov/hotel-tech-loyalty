export function assignmentChoice(tiers: { id: number; is_active: boolean }[], requested?: number) {
  return String(tiers.find(tier => tier.id === requested)?.id ?? tiers.find(tier => tier.is_active)?.id ?? tiers[0]?.id ?? '')
}
