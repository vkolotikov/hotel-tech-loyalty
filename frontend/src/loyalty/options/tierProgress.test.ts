import { describe, expect, it } from 'vitest'
import { answerFixture } from './fixture'
import { alwaysOn, changesOf, configurable, formOf, isOn, reviewOf, sentenceOf, wayFormOf, wayOptions, wayProblems, type Say } from './optionsMath'
import type { OptionsAnswer, Way } from './types'
import { CHOICE_WORDS, PRESET_WORDS, SENTENCE_WORDS, WAY_WORDS } from './words'

/**
 * "How members move up" on Ways to earn (release 8, spec 2026-10-25 §3): a card that is always on, with one choice —
 * points, visits or spend — and a sentence for each that says what members see.
 */
const say: Say = (_key, fallback, vars) => fallback.replace(/\{\{(\w+)\}\}/g, (_, name: string) => vars?.[name] ?? '')
const tierProgress: Way = { key: 'tier_progress', switch: null, zero_off: null, fields: ['tier_progress_by'] }
const base = answerFixture()
const answer: OptionsAnswer = {
  ...base,
  options: { ...base.options, tier_progress_by: 'points' },
  ways: [...base.ways, tierProgress],
  fields: { ...base.fields, tier_progress_by: { type: 'enum', default: 'points', min: null, max: null, choices: ['points', 'visits', 'spend'], when: null } },
}
const ctx = { say, currency: 'EUR', locale: 'en', rewards: base.catalogue.rewards }

describe('how members move up (release 8)', () => {
  it('is always on, so its choice always shows and is always sent', () => {
    expect(alwaysOn(tierProgress)).toBe(true)
    // The earn rate is always on too (owner 2026-10-26); points on bookings has its switch.
    expect(alwaysOn(answer.ways[0])).toBe(true)
    expect(alwaysOn(answer.ways[1])).toBe(false)
    expect(isOn(tierProgress, answer.options)).toBe(true)
    const form = wayFormOf(tierProgress, answer.options, answer.fields)
    expect(form).toEqual({ on: true, values: { tier_progress_by: 'points' } })
    expect(wayOptions(tierProgress, { ...form, values: { tier_progress_by: 'visits' } }, answer.fields)).toEqual({ tier_progress_by: 'visits' })
    expect(changesOf(tierProgress, { ...form, values: { tier_progress_by: 'visits' } }, answer.options, answer.fields)).toEqual({ tier_progress_by: 'visits' })
    expect(changesOf(tierProgress, form, answer.options, answer.fields)).toEqual({})
    expect(wayProblems(tierProgress, { ...form, values: { tier_progress_by: 'nights' } }, answer.fields, [])).toEqual({ tier_progress_by: { code: 'choice' } })
  })

  it('says what members see with each choice', () => {
    expect(sentenceOf('tier_progress', { tier_progress_by: 'points' }, ctx)).toBe(SENTENCE_WORDS.tier_progress_points)
    expect(sentenceOf('tier_progress', { tier_progress_by: 'visits' }, ctx)).toContain('3 more visits to Gold')
    expect(sentenceOf('tier_progress', { tier_progress_by: 'spend' }, ctx)).toContain('€120 more to Gold')
    expect(Object.keys(CHOICE_WORDS.tier_progress_by)).toEqual(['points', 'visits', 'spend'])
    expect(WAY_WORDS.tier_progress).toBe('How members move up')
  })

  it('is set in the wizard like any card that is on, and never listed as left off', () => {
    const form = formOf(answer, { ...answer.options, tier_progress_by: 'visits' })
    expect(configurable(answer, form).map(w => w.key)).toContain('tier_progress')
    const review = reviewOf(answer, form, answer.options, ctx)
    expect(review.off).not.toContain('tier_progress')
    expect(review.on.find(r => r.key === 'tier_progress')?.text).toBe(SENTENCE_WORDS.tier_progress_visits)
  })

  it('names the two general memberships among the presets', () => {
    expect(PRESET_WORDS.members_club).toBe('Members’ club')
    expect(PRESET_WORDS.events_community).toBe('Events and community')
  })
})
