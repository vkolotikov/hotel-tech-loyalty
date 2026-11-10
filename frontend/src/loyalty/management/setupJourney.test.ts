import { describe, expect, it } from 'vitest'
import { answerFixture } from '../options/fixture'
import { formOf } from '../options/optionsMath'
import { setupJourney } from './setupJourney'
describe('guided setup member journey from the real draft', () => {
  it('uses the draft rate and welcome points with an actual reward cost', () => {
    const answer = answerFixture()
    answer.options = { ...answer.options, points_per_currency: 3, points_on_bookings: true, desk_earn_enabled: false, welcome_bonus_points: 100 }
    answer.catalogue.rewards = [{ id: 5, name: 'Real reward', points_cost: 600 }]
    const form = formOf(answer, answer.options)
    const journey = setupJourney(answer, form)
    expect(journey).toMatchObject({ welcome: 100, spend: 150, remaining: 350, reward: { id: 5, name: 'Real reward', points_cost: 600 } })
    form.earn_rate.values.points_per_currency = '5'
    expect(setupJourney(answer, form).spend).toBe(250)
  })
  it('does not invent earning or a redemption when triggers or the catalogue are empty', () => {
    const answer = answerFixture()
    answer.options = { ...answer.options, points_on_bookings: false, desk_earn_enabled: false, welcome_bonus_points: 0 }
    answer.catalogue.rewards = []
    expect(setupJourney(answer, formOf(answer, answer.options))).toMatchObject({ welcome: 0, spend: 0, remaining: null, reward: null })
    answer.options.points_on_bookings = true
    answer.not_used = ['points_on_spend']
    expect(setupJourney(answer, formOf(answer, answer.options)).spend).toBe(0)
  })
})
