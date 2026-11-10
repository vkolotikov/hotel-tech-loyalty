import type { OptionsAnswer } from '../options/types'
import { optionsOfForm, type OptionsForm } from '../options/optionsMath'
import { baseExample } from '../earn/model'
export function setupJourney(answer: OptionsAnswer, form: OptionsForm, available = answer.catalogue.rewards) {
  const options = { ...answer.options, ...optionsOfForm(answer, form) }
  const welcome = Math.max(0, Number(options.welcome_bonus_points) || 0)
  const spend = (options.points_on_bookings === true && !(answer.not_used ?? []).includes('points_on_spend')) || options.desk_earn_enabled === true ? baseExample('50', String(options.points_per_currency)) ?? 0 : 0
  const reward = [...available].sort((a, b) => a.points_cost - b.points_cost)[0] ?? null
  return { welcome, spend, reward, remaining: reward ? Math.max(0, reward.points_cost - welcome - spend) : null }
}
