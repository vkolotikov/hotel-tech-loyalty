import { describe, expect, it } from 'vitest'
import { answerFixture, presetFixture } from './fixture'
import {
  KEEP, changesOf, configurable, formOf, formProblems, isOn, offersSetup, optionsOfForm, pointsPhrase, previewOptions, problemText, recommendedForm,
  reviewOf, sentenceOf, serverProblems, setupBody, startChoice, stepAfter, typedValue, wayFormOf, wayOptions, wayProblems, waysWith, type Say,
} from './optionsMath'
import type { Options, Way } from './types'

/** The English fallback with its {{names}} filled in, as the tests' i18n does. */
const say: Say = (_key, fallback, vars) => fallback.replace(/\{\{(\w+)\}\}/g, (_, name: string) => vars?.[name] ?? '')
const answer = answerFixture()
const way = (key: string): Way => answer.ways.find(w => w.key === key)!
const ctx = { say, currency: 'EUR', locale: 'en', rewards: answer.catalogue.rewards }
const sentence = (key: string, more: Options = {}) => sentenceOf(key, { ...answer.options, ...more }, ctx)

describe('a card’s form and its options (release 7 §1)', () => {
  it('reads a switch, or a number whose 0 is off, and shows each field as text', () => {
    expect(isOn(way('points_on_spend'), answer.options)).toBe(true)
    expect(isOn(way('stamp_card'), answer.options)).toBe(false)
    expect(isOn(way('welcome_bonus'), { welcome_bonus_points: 0 })).toBe(false)
    expect(wayFormOf(way('referrals'), answer.options, answer.fields)).toEqual({
      on: true, values: { referrer_bonus_points: '250', referee_bonus_points: '250', referral_reward_on: 'first_visit' },
    })
    expect(wayFormOf(way('stamp_card'), answer.options, answer.fields).values).toEqual({
      stamps_per_card: '10', stamp_reward_kind: 'points', stamp_reward_points: '100', stamp_reward_id: '',
    })
  })

  it('shows the server’s default for a number that is switched off, so switching it on starts from it', () => {
    expect(wayFormOf(way('welcome_bonus'), { ...answer.options, welcome_bonus_points: 0 }, answer.fields)).toEqual({ on: false, values: { welcome_bonus_points: '500' } })
    expect(wayFormOf(way('points_expiry'), { ...answer.options, points_expiry_months: 0 }, answer.fields)).toEqual({ on: false, values: { points_expiry_months: '24' } })
  })

  it('types what was typed: whole numbers, decimals with a point or comma, choices, a reward or none', () => {
    expect(typedValue(' 12 ', answer.fields.stamps_per_card)).toBe(12)
    expect(typedValue('1.5', answer.fields.stamps_per_card)).toBeUndefined()
    expect(typedValue('2,5', answer.fields.cashback_percent)).toBe(2.5)
    expect(typedValue('abc', answer.fields.cashback_percent)).toBeUndefined()
    expect(typedValue('signup', answer.fields.referral_reward_on)).toBe('signup')
    expect(typedValue('never', answer.fields.referral_reward_on)).toBeUndefined()
    expect(typedValue('', answer.fields.stamp_reward_id)).toBeNull()
    expect(typedValue('7', answer.fields.stamp_reward_id)).toBe(7)
  })

  it('a card on sends its switch and the fields it shows; a card off sends only that it is off', () => {
    const stamps = { on: true, values: { stamps_per_card: '8', stamp_reward_kind: 'reward', stamp_reward_points: '100', stamp_reward_id: '7' } }
    expect(wayOptions(way('stamp_card'), stamps, answer.fields)).toEqual({ stamps_enabled: true, stamps_per_card: 8, stamp_reward_kind: 'reward', stamp_reward_id: 7 })
    expect(wayOptions(way('stamp_card'), { ...stamps, on: false }, answer.fields)).toEqual({ stamps_enabled: false })
    expect(wayOptions(way('welcome_bonus'), { on: false, values: { welcome_bonus_points: '500' } }, answer.fields)).toEqual({ welcome_bonus_points: 0 })
    expect(wayOptions(way('desk_earn'), { on: true, values: {} }, answer.fields)).toEqual({ desk_earn_enabled: true })
  })

  it('a card changes only what differs from what is stored (decimals to two places)', () => {
    const form = formOf(answer, answer.options)
    expect(changesOf(way('cashback'), form.cashback, answer.options, answer.fields)).toEqual({})
    expect(changesOf(way('cashback'), { on: true, values: { cashback_percent: '5.00' } }, answer.options, answer.fields)).toEqual({ cashback_enabled: true })
    expect(changesOf(way('cashback'), { on: true, values: { cashback_percent: '3,5' } }, answer.options, answer.fields)).toEqual({ cashback_enabled: true, cashback_percent: 3.5 })
    expect(changesOf(way('referrals'), { on: true, values: { referrer_bonus_points: '400', referee_bonus_points: '250', referral_reward_on: 'first_visit' } }, answer.options, answer.fields))
      .toEqual({ referrer_bonus_points: 400 })
    // A field that does not read as a value is left out: problems say why.
    expect(changesOf(way('earn_rate'), { on: true, values: { points_per_currency: 'ten' } }, answer.options, answer.fields)).toEqual({})
  })

  it('every card together is what the wizard sends', () => {
    const form = formOf(answer, answer.options)
    form.stamp_card = { ...form.stamp_card, on: true }
    form.birthday_bonus = { ...form.birthday_bonus, on: false }
    const sent = optionsOfForm(answer, form)
    expect(sent).toMatchObject({ points_on_bookings: true, points_per_currency: 1, stamps_enabled: true, stamps_per_card: 10, stamp_reward_points: 100, birthday_bonus_points: 0, checkin_enabled: false, cashback_enabled: false })
    expect(sent).not.toHaveProperty('stamp_reward_id')
    expect(sent).not.toHaveProperty('checkin_points')
    expect(sent).not.toHaveProperty('programme_setup_completed_at')
  })
})

describe('what stops a card before it is sent', () => {
  it('checks each field the card shows against the server’s bounds; nothing while the card is off', () => {
    const f = { on: true, values: { stamps_per_card: '1', stamp_reward_kind: 'points', stamp_reward_points: '0', stamp_reward_id: '' } }
    expect(wayProblems(way('stamp_card'), f, answer.fields, answer.catalogue.rewards)).toEqual({
      stamps_per_card: { code: 'whole', min: 2, max: 50 },
      stamp_reward_points: { code: 'whole', min: 1, max: 1000000 },
    })
    expect(wayProblems(way('stamp_card'), { ...f, on: false }, answer.fields, answer.catalogue.rewards)).toEqual({})
    expect(wayProblems(way('cashback'), { on: true, values: { cashback_percent: '60' } }, answer.fields, [])).toEqual({ cashback_percent: { code: 'number', min: 0.1, max: 50 } })
  })

  it('asks for a reward from the catalogue when a full card gives one', () => {
    const f = { on: true, values: { stamps_per_card: '10', stamp_reward_kind: 'reward', stamp_reward_points: '100', stamp_reward_id: '' } }
    expect(wayProblems(way('stamp_card'), f, answer.fields, answer.catalogue.rewards)).toEqual({ stamp_reward_id: { code: 'reward' } })
    expect(wayProblems(way('stamp_card'), { ...f, values: { ...f.values, stamp_reward_id: '42' } }, answer.fields, answer.catalogue.rewards)).toEqual({ stamp_reward_id: { code: 'reward' } })
    expect(wayProblems(way('stamp_card'), { ...f, values: { ...f.values, stamp_reward_id: '9' } }, answer.fields, answer.catalogue.rewards)).toEqual({})
  })

  it('a number whose 0 means off must be at least 1 while it is on', () => {
    expect(wayProblems(way('welcome_bonus'), { on: true, values: { welcome_bonus_points: '0' } }, answer.fields, [])).toEqual({ welcome_bonus_points: { code: 'whole', min: 1, max: 1000000 } })
    expect(wayProblems(way('welcome_bonus'), { on: false, values: { welcome_bonus_points: '0' } }, answer.fields, [])).toEqual({})
  })

  it('reads the server’s field errors in its own words, with the option’s bounds', () => {
    const failure = { status: 422, code: 'invalid', fields: { points_per_currency: ['Must be between 0.01 and 1000.'], stamp_reward_id: ['x'], referral_reward_on: ['x'], made_up: ['x'] }, extra: {} }
    expect(serverProblems(failure, answer)).toEqual({
      points_per_currency: { code: 'number', min: 0.01, max: 1000 },
      stamp_reward_id: { code: 'reward' },
      referral_reward_on: { code: 'choice' },
    })
    expect(serverProblems(null, answer)).toEqual({})
    expect(waysWith(serverProblems(failure, answer), answer)).toEqual(['earn_rate', 'referrals', 'stamp_card'])
  })

  it('says what is wrong in a sentence', () => {
    expect(problemText({ code: 'whole', min: 2, max: 50 }, say, 'en')).toBe('Enter a whole number from 2 to 50.')
    expect(problemText({ code: 'number', min: 0.01, max: 1000 }, say, 'en')).toBe('Enter a number from 0.01 to 1,000, e.g. 2.5.')
    expect(problemText({ code: 'reward' }, say, 'en')).toBe('Choose the reward a full card gives.')
  })

  it('the whole form’s problems are every card’s', () => {
    const form = formOf(answer, answer.options)
    form.cashback = { on: true, values: { cashback_percent: '0' } }
    form.check_in = { on: true, values: { checkin_points: '-1' } }
    expect(Object.keys(formProblems(answer, form, []))).toEqual(['checkin_points', 'cashback_percent'])
  })
})

describe('what members get, in a sentence', () => {
  it('points on spend, in the venue’s currency', () => {
    // Owner 2026-10-26: the rate is its own card and serves bookings and the desk alike; each has its own switch.
    expect(sentence('earn_rate')).toBe('Members get 1 point for every €1 they spend.')
    expect(sentence('earn_rate', { points_per_currency: 10 })).toBe('Members get 10 points for every €1 they spend.')
    expect(sentenceOf('earn_rate', { ...answer.options, points_per_currency: 1.5 }, { ...ctx, currency: 'USD' })).toBe('Members get 1.5 points for every $1 they spend.')
    expect(sentence('earn_rate', { points_on_bookings: false, desk_earn_enabled: true })).toBe('Members get 1 point for every €1 they spend.')
    expect(sentence('earn_rate', { points_on_bookings: false, desk_earn_enabled: false })).toBe('Spending earns nothing yet: switch on Points on bookings or Earn at the desk.')
    expect(sentence('points_on_spend')).toBe('Completed bookings earn points at your earn rate.')
    expect(sentence('points_on_spend', { points_on_bookings: false })).toBe('Bookings earn no points.')
  })

  it('expiry, bonuses and referrals', () => {
    expect(sentence('points_expiry')).toBe('Points expire 24 months after they are earned.')
    expect(sentence('points_expiry', { points_expiry_months: 1 })).toBe('Points expire 1 month after they are earned.')
    expect(sentence('points_expiry', { points_expiry_months: 0 })).toBe('Points never expire.')
    expect(sentence('welcome_bonus', { welcome_bonus_points: 1500 })).toBe('New members get 1,500 points when they join.')
    expect(sentence('welcome_bonus', { welcome_bonus_points: 0 })).toBe('New members get no welcome bonus.')
    expect(sentence('birthday_bonus')).toBe('Members get 500 points on their birthday.')
    expect(sentence('referrals')).toBe('A member who refers a friend gets 250 points and the friend gets 250 points, once the friend has made a first visit.')
    expect(sentence('referrals', { referral_reward_on: 'signup', referrer_bonus_points: 1 })).toBe('A member who refers a friend gets 1 point and the friend gets 250 points, as soon as the friend joins.')
    expect(sentence('referrals', { referral_enabled: false })).toBe('Members have no referral link.')
  })

  it('the stamp card, with points or a reward from the catalogue', () => {
    expect(sentence('stamp_card')).toBe('No stamp card.')
    expect(sentence('stamp_card', { stamps_enabled: true, stamps_per_card: 8, stamp_reward_points: 400 }))
      .toBe('Members collect a stamp for each visit, one a day. A card holds 8 stamps; a full card gives 400 points.')
    expect(sentence('stamp_card', { stamps_enabled: true, stamp_reward_kind: 'reward', stamp_reward_id: 7 }))
      .toBe('Members collect a stamp for each visit, one a day. A card holds 10 stamps; a full card gives Free coffee.')
    expect(sentence('stamp_card', { stamps_enabled: true, stamp_reward_kind: 'reward', stamp_reward_id: null }))
      .toBe('Members collect a stamp for each visit, one a day. A card holds 10 stamps; a full card gives a reward you choose.')
  })

  it('the desk: check-in, purchases and cashback', () => {
    expect(sentence('check_in')).toBe('No check-in at the desk.')
    expect(sentence('check_in', { checkin_enabled: true })).toBe('Staff check members in at the desk, once a day: each check-in counts as a visit.')
    expect(sentence('check_in', { checkin_enabled: true, checkin_points: 10 })).toBe('Staff check members in at the desk, once a day: each check-in gives 10 points and counts as a visit.')
    expect(sentence('desk_earn', { desk_earn_enabled: true })).toBe('Staff add a purchase at the desk after a scan, and the member earns points for it.')
    expect(sentence('cashback', { cashback_enabled: true, cashback_percent: 2.5 })).toBe('Members get 2.5% of what they spend back as credit, to use at the desk.')
    expect(sentence('cashback')).toBe('No cashback credit.')
    expect(sentence('made_up')).toBe('')
  })

  it('writes numbers as the language does', () => {
    expect(pointsPhrase(1500, say, 'de')).toBe('1.500 points')
    expect(sentenceOf('earn_rate', { ...answer.options, points_per_currency: 2.5 }, { ...ctx, locale: 'fr' })).toBe('Members get 2,5 points for every 1\u00a0€ they spend.')
  })

  it('keeps one full stop when an abbreviated amount ends the sentence ("50 б." in Russian)', () => {
    const russian: Say = (key, fallback, vars) => (key === 'loyalty.options.amount.points_many' ? `${vars?.points} б.` : say(key, fallback, vars))
    const text = sentenceOf('stamp_card', { ...answer.options, stamps_enabled: true, stamp_reward_kind: 'points', stamp_reward_points: 50 }, { ...ctx, say: russian })
    expect(text.endsWith('50 б.')).toBe(true)
    expect(text).not.toContain('..')
  })

  it('the sentence follows what is typed, and a number not yet a number reads as stored', () => {
    const typing = { on: true, values: { welcome_bonus_points: '75' } }
    expect(sentenceOf('welcome_bonus', previewOptions(way('welcome_bonus'), typing, answer.options, answer.fields), ctx)).toBe('New members get 75 points when they join.')
    const half = { on: true, values: { welcome_bonus_points: '7x' } }
    expect(previewOptions(way('welcome_bonus'), half, answer.options, answer.fields).welcome_bonus_points).toBe(500)
    // Out of its bounds, a number is not promised either: the sentence keeps what is stored.
    expect(sentenceOf('cashback', previewOptions(way('cashback'), { on: true, values: { cashback_percent: '80' } }, answer.options, answer.fields), ctx))
      .toBe('Members get 5% of what they spend back as credit, to use at the desk.')
    expect(previewOptions(way('welcome_bonus'), { on: true, values: { welcome_bonus_points: '0' } }, answer.options, answer.fields).welcome_bonus_points).toBe(500)
    // Switched on from 0 with nothing valid typed: the server's default.
    expect(previewOptions(way('welcome_bonus'), { on: true, values: { welcome_bonus_points: '' } }, { ...answer.options, welcome_bonus_points: 0 }, answer.fields).welcome_bonus_points).toBe(500)
    expect(sentenceOf('stamp_card', previewOptions(way('stamp_card'), { on: true, values: { stamps_per_card: '6', stamp_reward_kind: 'points', stamp_reward_points: '50', stamp_reward_id: '' } }, answer.options, answer.fields), ctx))
      .toBe('Members collect a stamp for each visit, one a day. A card holds 6 stamps; a full card gives 50 points.')
  })
})

describe('the setup wizard', () => {
  it('moves through four steps and stops at either end', () => {
    expect(stepAfter('business', 1)).toBe('choose')
    expect(stepAfter('review', 1)).toBeNull()
    expect(stepAfter('business', -1)).toBeNull()
    expect(stepAfter('review', -1)).toBe('configure')
  })

  it('a venue with tiers keeps them; a new one starts on its industry’s preset', () => {
    expect(startChoice(answer)).toBe(KEEP)
    const fresh = answerFixture({ catalogue: { tiers: 0, rewards: [], offers: 0, boosts: 0 } })
    expect(startChoice(fresh)).toBe('beauty')
    expect(startChoice({ ...fresh, presets: [presetFixture('hotel_classic', false)] })).toBe('hotel_classic')
  })

  it('pre-ticks and pre-fills from the preset’s recommendation, or from today’s options when keeping', () => {
    const beauty = recommendedForm(answer, presetFixture('beauty', true), answer.options)
    expect(beauty.stamp_card).toEqual({ on: true, values: { stamps_per_card: '8', stamp_reward_kind: 'points', stamp_reward_points: '400', stamp_reward_id: '' } })
    expect(beauty.points_expiry.values.points_expiry_months).toBe('18')
    expect(beauty.cashback.on).toBe(false)
    const kept = recommendedForm(answer, null, answer.options)
    expect(kept.stamp_card.on).toBe(false)
    expect(kept.earn_rate.values.points_per_currency).toBe('1')
    // The configure step lists the ticked ways that have numbers.
    expect(configurable(answer, beauty).map(w => w.key)).toEqual(['earn_rate', 'points_expiry', 'welcome_bonus', 'birthday_bonus', 'referrals', 'stamp_card'])
  })

  it('reviews what members will get, in the cards’ order, and names the ways left off', () => {
    const form = recommendedForm(answer, presetFixture('beauty', true), answer.options)
    const review = reviewOf(answer, form, answer.options, ctx)
    expect(review.on.map(l => l.key)).toEqual(['earn_rate', 'points_on_spend', 'points_expiry', 'welcome_bonus', 'birthday_bonus', 'referrals', 'stamp_card'])
    expect(review.on[0].text).toBe('Members get 10 points for every €1 they spend.')
    expect(review.on[1].text).toBe('Completed bookings earn points at your earn rate.')
    expect(review.on[6].text).toBe('Members collect a stamp for each visit, one a day. A card holds 8 stamps; a full card gives 400 points.')
    expect(review.off).toEqual(['check_in', 'desk_earn', 'cashback'])
  })

  it('sends the preset unless the tiers are kept, every card’s options and the press’s key', () => {
    const form = recommendedForm(answer, presetFixture('beauty', true), answer.options)
    const body = setupBody(answer, 'beauty', form, 'press-1')
    expect(body.preset).toBe('beauty')
    expect(body.idempotency_key).toBe('press-1')
    expect(body.options).toMatchObject({ stamps_enabled: true, stamps_per_card: 8, checkin_enabled: false, welcome_bonus_points: 100 })
    expect(setupBody(answer, KEEP, form, 'press-2')).not.toHaveProperty('preset')
  })

  it('offers the wizard to a manager until it was applied or skipped', () => {
    expect(offersSetup(true, { setup_done: false })).toBe(true)
    expect(offersSetup(true, { setup_done: true })).toBe(false)
    expect(offersSetup(false, { setup_done: false })).toBe(false)
    expect(offersSetup(true, undefined)).toBe(false)
  })
})
