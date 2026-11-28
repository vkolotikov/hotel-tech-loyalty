import { expect, it } from 'vitest'
import { answerFixture } from './fixture'
import { setupRewardChoices } from './setupRewards'

it('keeps a template suggestion when its saved match is unavailable', () => {
  const answer = answerFixture()
  answer.presets[0].stamp_rewards = [{ index: 0, name: 'Free coffee', points_cost: 100 }]
  Object.assign(answer.catalogue.rewards[0], { is_redeemable: false })
  expect(setupRewardChoices(answer, answer.presets[0].key).map(r => r.id)).toContain(-1)
})
