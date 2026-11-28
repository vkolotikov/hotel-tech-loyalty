import type { CatalogueReward, OptionsAnswer } from './types'
import { presetOf } from './optionsMath'

/** Draft references stay separate from saved ids until Apply resolves the selected trusted suggestion. */
export function setupRewardChoices(answer: OptionsAnswer, choice: string): CatalogueReward[] {
  const saved = answer.catalogue.rewards
  const suggestions = (presetOf(answer, choice)?.stamp_rewards ?? [])
    .filter(reward => !saved.some(r => r.is_redeemable !== false && r.name === reward.name && r.points_cost === reward.points_cost))
    .map(reward => ({ id: -(reward.index + 1), name: reward.name, points_cost: reward.points_cost, template_index: reward.index }))
  return [...suggestions, ...saved]
}
