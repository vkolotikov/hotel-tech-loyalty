import { describe, expect, it } from 'vitest'
import type { Can } from '../lib/types'
import { serverProblems } from '../lib/forms'
import {
  OFFER_FIELDS, brandChoice, brandName, brandPart, initialBrand, megabytes, offerBody, offerFormOf, offerProblems, offerState, offerTone, offerValue, pictureProblem, redemptionActions, redemptionTone, referralTone,
  rewardBody, rewardDiscount, rewardFormOf, rewardProblems, rewardServerProblems, rewardsActions, searchFor, stockOf, tabAfter, tabFrom, typeChoices,
} from './rewardsMath'
import type { Offer, OfferOptions, Reward, RewardOptions } from './types'

const can = (more: Partial<Can> = {}): Can => ({ award: false, redeem: false, reverse: false, manage_program: false, manage_rewards: false, manage_members: false, view_insights: false, manage_campaigns: false, manage_app: false, ...more })
const image = { max_kb: 5120, max_edge: 4096, types: ['image/jpeg', 'image/png', 'image/webp'] }
const rewardOptions: RewardOptions = { discount_types: ['percent_discount', 'fixed_amount'], applies_to: ['all', 'services', 'stays'], image }
const offerOptions: OfferOptions = { types: ['discount', 'bonus_points', 'free_night'], applies_to: ['all', 'stays'], image: { ...image, max_kb: 2048 } }
const reward = (more: Partial<Reward> = {}): Reward => ({
  id: 4, name: 'Breakfast for two', description: null, terms: null, category: 'Dining', points_cost: 500, stock: null, per_member_limit: 2,
  discount_type: null, discount_value: null, applies_to: 'all', expires_at: null, is_active: true, image_url: null, redeemed: 10, fulfilled: 7, ...more,
})
const offer = (more: Partial<Offer> = {}): Offer => ({
  id: 6, title: 'Autumn weekend', description: 'Two nights', type: 'discount', value: 15, code: 'AUTUMN', applies_to: 'stays', tier_ids: [2],
  start_date: '2026-10-01', end_date: '2026-10-31', usage_limit: 100, times_used: 3, per_member_limit: null, is_active: true, is_featured: false, image_url: null,
  state: 'live', ...more,
})

describe('the tab in the address (spec 2026-10-21 §4.6)', () => {
  it('reads ?tab=, the catalogue for none or anything else', () => {
    expect(tabFrom('?tab=offers')).toBe('offers')
    expect(tabFrom('?tab=redemptions&x=1')).toBe('redemptions')
    expect(tabFrom('')).toBe('catalogue')
    expect(tabFrom('?tab=wallet')).toBe('catalogue')
  })

  it('writes the catalogue as the page\'s own address and round-trips every tab', () => {
    expect(searchFor('catalogue')).toBe('')
    for (const tab of ['catalogue', 'redemptions', 'offers', 'referrals'] as const) expect(tabFrom(searchFor(tab))).toBe(tab)
  })

  it('moves between tabs with the arrows, wrapping, and with Home and End', () => {
    expect(tabAfter('catalogue', 'ArrowRight')).toBe('redemptions')
    expect(tabAfter('referrals', 'ArrowRight')).toBe('catalogue')
    expect(tabAfter('catalogue', 'ArrowLeft')).toBe('referrals')
    expect(tabAfter('offers', 'Home')).toBe('catalogue')
    expect(tabAfter('offers', 'End')).toBe('referrals')
    expect(tabAfter('offers', 'Enter')).toBeNull()
  })
})

describe('who does what (spec §5)', () => {
  it('changes rewards and offers with "manage offers", handles redemptions with "redeem points"', () => {
    expect(rewardsActions(can({ manage_rewards: true }))).toEqual({ manage: true, redeem: false })
    expect(rewardsActions(can({ redeem: true, manage_program: true }))).toEqual({ manage: false, redeem: true })
  })

  it('offers Mark fulfilled and Cancel only on a pending redemption, to whoever may redeem', () => {
    expect(redemptionActions('pending', can({ redeem: true }))).toEqual({ fulfil: true, cancel: true })
    expect(redemptionActions('fulfilled', can({ redeem: true }))).toEqual({ fulfil: false, cancel: false })
    expect(redemptionActions('cancelled', can({ redeem: true }))).toEqual({ fulfil: false, cancel: false })
    expect(redemptionActions('pending', can({ manage_rewards: true, manage_program: true }))).toEqual({ fulfil: false, cancel: false })
  })
})

describe('state tones', () => {
  it('reads redemptions, offers and referrals in the shared tones, anything new as the quiet grey', () => {
    expect(['pending', 'fulfilled', 'cancelled', 'odd'].map(redemptionTone)).toEqual(['pending', 'fulfilled', 'cancelled', 'cancelled'])
    expect(['live', 'upcoming', 'ended', 'off', 'paused'].map(offerState)).toEqual(['live', 'upcoming', 'ended', 'off', 'off'])
    expect(['live', 'upcoming', 'ended', 'off'].map(s => offerTone(offerState(s)))).toEqual(['fulfilled', 'approved', 'cancelled', 'cancelled'])
    expect(['rewarded', 'qualified', 'pending', 'odd'].map(referralTone)).toEqual(['fulfilled', 'approved', 'pending', 'cancelled'])
  })
})

describe('the reward form', () => {
  it('starts empty, for every booking, offered', () => {
    const form = rewardFormOf(null, rewardOptions, 'Europe/Riga')
    expect([form.applies_to, form.is_active, form.discount_type]).toEqual(['all', true, ''])
  })

  it('shows an expiry on the venue\'s clock', () => {
    expect(rewardFormOf(reward({ expires_at: '2026-12-31T21:59:00+00:00' }), rewardOptions, 'Europe/Riga').expires_at).toBe('2026-12-31T23:59')
  })

  it('says what is wrong before sending', () => {
    const form = rewardFormOf(reward(), rewardOptions, 'UTC')
    expect(rewardProblems(form, rewardOptions)).toEqual({})
    expect(rewardProblems({ ...form, name: '', points_cost: '0' }, rewardOptions)).toEqual({ name: 'name', points_cost: 'points_cost' })
    expect(rewardProblems({ ...form, stock: '-1', per_member_limit: '1001' }, rewardOptions)).toEqual({ stock: 'stock', per_member_limit: 'per_member_limit' })
    expect(rewardProblems({ ...form, discount_type: 'percent_discount', discount_value: '' }, rewardOptions)).toEqual({ discount_value: 'discount_value' })
    expect(rewardProblems({ ...form, discount_type: 'percent_discount', discount_value: '120' }, rewardOptions)).toEqual({ discount_value: 'percent_over' })
    expect(rewardProblems({ ...form, discount_type: 'fixed_amount', discount_value: '120' }, rewardOptions)).toEqual({})
    expect(rewardProblems({ ...form, expires_at: '2026-12-31' }, rewardOptions)).toEqual({ expires_at: 'expires_at' })
  })

  it('sends empty fields as none, and no discount type with no value', () => {
    const body = rewardBody({ ...rewardFormOf(reward(), rewardOptions, 'UTC'), stock: '', per_member_limit: '', discount_value: '10', category: ' ' })
    expect([body.stock, body.per_member_limit, body.discount_type, body.discount_value, body.category, body.expires_at]).toEqual([null, null, null, null, null, null])
    expect(rewardBody({ ...rewardFormOf(reward(), rewardOptions, 'UTC'), discount_type: 'fixed_amount', discount_value: '12,5', expires_at: '2026-12-31T23:59' }))
      .toMatchObject({ discount_type: 'fixed_amount', discount_value: 12.5, expires_at: '2026-12-31T23:59', points_cost: 500, stock: null, per_member_limit: 2 })
  })

  it('reads a refused discount value by its type', () => {
    const form = { ...rewardFormOf(reward(), rewardOptions, 'UTC'), discount_type: 'percent_discount' }
    expect(rewardServerProblems({ discount_value: ['…'], name: ['…'] }, form)).toEqual({ discount_value: 'percent_over', name: 'name' })
    expect(rewardServerProblems({ discount_value: ['…'] }, { ...form, discount_type: 'fixed_amount' })).toEqual({ discount_value: 'discount_value' })
  })

  it('reads stock and a typed discount for the card', () => {
    expect([stockOf(null), stockOf(0), stockOf(4)]).toEqual(['unlimited', 'none', 'some'])
    expect(rewardDiscount(reward({ discount_type: 'percent_discount', discount_value: 10 }))).toEqual({ type: 'percent_discount', amount: 10 })
    expect(rewardDiscount(reward())).toBeNull()
  })
})

describe('the offer form', () => {
  it('starts on the venue\'s today for 30 days, of the server\'s first type, for every tier', () => {
    const form = offerFormOf(null, offerOptions, '2026-10-21')
    expect([form.type, form.start_date, form.end_date, form.tiers, form.applies_to]).toEqual(['discount', '2026-10-21', '2026-11-20', [], 'all'])
  })

  it('keeps a type the server no longer lists for the offer that has it', () => {
    expect(typeChoices(offerOptions.types, 'flash_sale')).toEqual(['discount', 'bonus_points', 'free_night', 'flash_sale'])
    expect(typeChoices(offerOptions.types, 'discount')).toEqual(offerOptions.types)
    const form = offerFormOf(offer({ type: 'flash_sale' }), offerOptions, '2026-10-21')
    expect(offerProblems(form, offerOptions, 'flash_sale')).toEqual({})
    expect(offerProblems(form, offerOptions)).toEqual({ type: 'type' })
  })

  it('says what is wrong before sending', () => {
    const form = offerFormOf(offer(), offerOptions, '2026-10-21')
    expect(offerProblems(form, offerOptions)).toEqual({})
    expect(offerProblems({ ...form, title: ' ', description: '' }, offerOptions)).toEqual({ title: 'title', description: 'description' })
    expect(offerProblems({ ...form, code: 'AB' }, offerOptions)).toEqual({ code: 'code' })
    expect(offerProblems({ ...form, code: 'AB C1' }, offerOptions)).toEqual({ code: 'code' })
    expect(offerProblems({ ...form, code: '' }, offerOptions)).toEqual({})
    expect(offerProblems({ ...form, end_date: form.start_date }, offerOptions)).toEqual({ end_date: 'order' })
    expect(offerProblems({ ...form, value: '1000000' }, offerOptions)).toEqual({ value: 'value' })
    expect(offerProblems({ ...form, usage_limit: '0' }, offerOptions)).toEqual({ usage_limit: 'usage_limit' })
  })

  it('sends the code in capitals, no tier as every tier, and on/off only on a change', () => {
    const form = { ...offerFormOf(offer(), offerOptions, '2026-10-21'), code: ' autumn-26 ', tiers: [] }
    expect(offerBody(form, true)).toMatchObject({ code: 'AUTUMN-26', tier_ids: null, is_active: true, usage_limit: 100, per_member_limit: null })
    expect(offerBody(form, false)).not.toHaveProperty('is_active')
  })

  it('reads a refused code as taken and a refused end date as out of order', () => {
    expect(serverProblems({ code: ['…'], end_date: ['…'], 'tier_ids.1': ['…'] }, OFFER_FIELDS)).toEqual({ code: 'code_taken', end_date: 'order', tier_ids: 'tier_ids' })
  })

  it('writes a value as a sentence where its type has one, as a number otherwise, and nothing for 0', () => {
    const phrased = ['discount', 'bonus_points']
    expect(offerValue('discount', 15, phrased)).toBe('phrase')
    expect(offerValue('free_night', 1, phrased)).toBe('number')
    expect(offerValue('upgrade', 0, phrased)).toBeNull()
  })
})

describe('a picture before it is sent (release 2 §7)', () => {
  it('takes the server\'s types up to its size; the longest side is the server\'s to check', () => {
    expect(pictureProblem({ type: 'image/jpeg', size: 5120 * 1024 }, image)).toBeNull()
    expect(pictureProblem({ type: 'image/webp', size: 10 }, image)).toBeNull()
    expect(pictureProblem({ type: 'image/jpeg', size: 5120 * 1024 + 1 }, image)).toBe('size')
    expect(pictureProblem({ type: 'image/jpeg', size: 2048 * 1024 + 1 }, offerOptions.image)).toBe('size')
    expect(pictureProblem({ type: 'application/pdf', size: 10 }, image)).toBe('type')
    expect(pictureProblem({ type: 'image/gif', size: 10 }, image)).toBe('type')
    expect(pictureProblem({ type: '', size: 10 }, image)).toBe('type')
  })

  it('says a limit in megabytes', () => {
    expect(megabytes(5120)).toBe(5)
    expect(megabytes(2048)).toBe(2)
    expect(megabytes(1536)).toBe(1.5)
  })
})

describe('the brand of a new reward, offer or boost (release 4)', () => {
  const two = { list: [{ id: 1, name: 'Spa', is_default: true }, { id: 2, name: 'Hotel', is_default: false }], default: 1 }

  it('offers a choice only for more than one brand', () => {
    expect(brandChoice(undefined)).toBe(false)
    expect(brandChoice({ list: [{ id: 1, name: 'Spa', is_default: true }], default: 1 })).toBe(false)
    expect(brandChoice(two)).toBe(true)
  })

  it('starts on the server\'s default, else the first offered, and on nothing without a choice', () => {
    expect(initialBrand(two)).toBe(1)
    expect(initialBrand({ ...two, default: 2 })).toBe(2)
    expect(initialBrand({ ...two, default: 9 })).toBe(1)
    expect(initialBrand({ list: [{ id: 1, name: 'Spa', is_default: true }], default: 1 })).toBeNull()
    expect(initialBrand(undefined)).toBeNull()
  })

  it('names a saved row\'s brand when there is a choice and the brand is offered', () => {
    expect(brandName(2, two)).toBe('Hotel')
    expect(brandName(7, two)).toBeNull()
    expect(brandName(null, two)).toBeNull()
    expect(brandName(1, { list: [{ id: 1, name: 'Spa', is_default: true }], default: 1 })).toBeNull()
  })

  it('sends `brand` only when one was chosen', () => {
    expect(brandPart(2)).toEqual({ brand: 2 })
    expect(brandPart(null)).toEqual({})
  })
})
