import { describe, expect, it } from 'vitest'
import type { Can } from '../lib/types'
import { BENEFIT_FIELDS, BOOST_FIELDS, benefitBody, benefitChoices, benefitFormOf, benefitProblems, boostBody, boostFormOf, boostProblems, boostState, boostTone, existingOn, needsAmount, programActions, thresholds, tierBenefitBody, tierBenefitFormOf, tierBenefitProblems, tierBenefitServerProblems, tierBody, tierFormOf, tierProblems, typedValue, weekdayName, weekdaysText } from './programMath'
import { chosenTiers, decimalOf, named, serverProblems, toggled, wallInput, wallOf } from '../lib/forms'
import type { Benefit, Boost, ProgramOptions, Tier } from './types'

const can = (more: Partial<Can> = {}): Can => ({ award: false, redeem: false, reverse: false, manage_program: false, manage_rewards: false, ...more })
const options: ProgramOptions = {
  categories: ['accommodation', 'dining', 'other'],
  fulfillment_modes: ['automatic', 'on_request'],
  value_types: ['percent_discount', 'fixed_amount', 'points_multiplier', 'free_item', 'text'],
  applies_to: ['all', 'services', 'stays'],
}
const tier = (more: Partial<Tier> = {}): Tier => ({
  id: 1, name: 'Gold', description: null, color: '#c9a227', min_points: 1000, min_nights: null, min_stays: null, min_spend: null,
  earn_rate: 1.5, is_active: true, sort_order: 1, members: 12, benefits: [], ...more,
})
const benefit = (more: Partial<Benefit> = {}): Benefit => ({
  id: 7, name: 'Late checkout', code: 'LATE', description: null, category: 'accommodation', fulfillment_mode: 'on_request', is_active: true, sort_order: 0, ...more,
})
const boost = (more: Partial<Boost> = {}): Boost => ({
  id: 3, name: 'Double weekend', description: null, multiplier: 2, starts_at: '2026-10-24T07:00:00+00:00', ends_at: '2026-10-25T21:59:00+00:00',
  days_of_week: null, tier_ids: null, is_active: true, state: 'upcoming', ...more,
})

describe('who changes the programme (spec 2026-10-21 §5)', () => {
  it('is a manager only; everyone else reads', () => {
    expect(programActions(can({ manage_program: true }))).toEqual({ manage: true })
    expect(programActions(can({ award: true, redeem: true, manage_rewards: true }))).toEqual({ manage: false })
  })
})

describe('the tier form', () => {
  it('starts a new tier at 0 points, earning ×1, in use', () => {
    expect(tierFormOf(null)).toEqual({ name: '', color: '', min_points: '0', earn_rate: '1', description: '', is_active: true })
    expect(tierFormOf(tier()).earn_rate).toBe('1.5')
  })

  it('says what is wrong before sending', () => {
    expect(tierProblems(tierFormOf(tier()))).toEqual({})
    expect(tierProblems({ ...tierFormOf(null), name: '  ' })).toEqual({ name: 'name' })
    expect(tierProblems({ ...tierFormOf(tier()), color: '#fff' })).toEqual({ color: 'color' })
    expect(tierProblems({ ...tierFormOf(tier()), color: '' })).toEqual({})
    expect(tierProblems({ ...tierFormOf(tier()), min_points: '1.5' })).toEqual({ min_points: 'min_points' })
    expect(tierProblems({ ...tierFormOf(tier()), min_points: '10000001' })).toEqual({ min_points: 'min_points' })
    expect(tierProblems({ ...tierFormOf(tier()), earn_rate: '100' })).toEqual({ earn_rate: 'earn_rate' })
    expect(tierProblems({ ...tierFormOf(tier()), earn_rate: '1,25' })).toEqual({})
  })

  it('sends numbers, a lower-case colour or none, and no empty description', () => {
    expect(tierBody({ name: ' Gold ', color: '#C9A227', min_points: '1000', earn_rate: '1,5', description: ' ', is_active: false }))
      .toEqual({ name: 'Gold', color: '#c9a227', min_points: 1000, earn_rate: 1.5, description: null, is_active: false })
    expect(tierBody({ ...tierFormOf(null), name: 'Base' }).color).toBeNull()
  })

  it('lists what reaches a tier: points always, the rest where set', () => {
    expect(thresholds(tier())).toEqual([{ kind: 'points', value: 1000 }])
    expect(thresholds(tier({ min_nights: 5, min_spend: 0 }))).toEqual([{ kind: 'points', value: 1000 }, { kind: 'nights', value: 5 }, { kind: 'spend', value: 0 }])
  })
})

describe('the server\'s field errors, in the workspace\'s words', () => {
  it('maps each field Laravel names to the form\'s word, an array item to its list', () => {
    expect(serverProblems({ 'tier_ids.0': ['x'], ends_at: ['y'], surprise: ['z'] }, BOOST_FIELDS)).toEqual({ tier_ids: 'tier_ids', ends_at: 'order' })
    expect(serverProblems(undefined, BOOST_FIELDS)).toEqual({})
  })

  it('reads a refused benefit code as taken: the form checked everything else about it', () => {
    expect(serverProblems({ code: ['The code has already been taken.'] }, BENEFIT_FIELDS)).toEqual({ code: 'code_taken' })
  })

  it('reads a refused amount by its type', () => {
    const form = { ...tierBenefitFormOf(null, options), benefit_id: '7', value_type: 'percent_discount', value_amount: '150' }
    expect(tierBenefitServerProblems({ value_amount: ['…'] }, form)).toEqual({ value_amount: 'percent_over' })
    expect(tierBenefitServerProblems({ value_amount: ['…'] }, { ...form, value_type: 'points_multiplier' })).toEqual({ value_amount: 'multiplier_under' })
    expect(tierBenefitServerProblems({ value_amount: ['…'] }, { ...form, value_type: 'fixed_amount' })).toEqual({ value_amount: 'value_amount' })
  })
})

describe('the benefit catalogue form', () => {
  it('asks a code on create only, and a category and a mode from the server\'s lists', () => {
    expect(benefitProblems(benefitFormOf(null), true, options)).toEqual({ name: 'name', code: 'code', category: 'category', fulfillment_mode: 'fulfillment_mode' })
    expect(benefitProblems({ ...benefitFormOf(benefit()), code: '' }, false, options)).toEqual({})
    expect(benefitProblems({ ...benefitFormOf(benefit()), category: 'spa' }, false, options)).toEqual({ category: 'category' })
  })

  it('sends the code only when creating', () => {
    expect(benefitBody(benefitFormOf(benefit()), true)).toEqual({ name: 'Late checkout', code: 'LATE', category: 'accommodation', fulfillment_mode: 'on_request', description: null })
    expect(benefitBody(benefitFormOf(benefit()), false)).not.toHaveProperty('code')
  })
})

describe('a tier\'s benefit', () => {
  it('starts as a wording for every booking, as the server stores one sent without a type', () => {
    expect(tierBenefitFormOf(null, options)).toEqual({ benefit_id: '', value: '', value_type: 'text', value_amount: '', applies_to: 'all' })
  })

  it('asks an amount only for a type the booking engine applies', () => {
    expect(needsAmount('percent_discount')).toBe(true)
    expect(needsAmount('free_item')).toBe(false)
    expect(needsAmount('text')).toBe(false)
    const form = { ...tierBenefitFormOf(null, options), benefit_id: '7' }
    expect(tierBenefitProblems(form, options)).toEqual({})
    expect(tierBenefitProblems({ ...form, value_type: 'fixed_amount' }, options)).toEqual({ value_amount: 'value_amount' })
    expect(tierBenefitProblems({ ...form, value_type: 'percent_discount', value_amount: '101' }, options)).toEqual({ value_amount: 'percent_over' })
    expect(tierBenefitProblems({ ...form, value_type: 'points_multiplier', value_amount: '0.5' }, options)).toEqual({ value_amount: 'multiplier_under' })
    expect(tierBenefitProblems({ ...form, benefit_id: '' }, options)).toEqual({ benefit_id: 'benefit_id' })
  })

  it('sends no amount for a wording, and the amount as a number otherwise', () => {
    const form = { benefit_id: '7', value: ' Until 2 pm ', value_type: 'text', value_amount: '15', applies_to: 'stays' }
    expect(tierBenefitBody(form)).toEqual({ benefit_id: 7, value: 'Until 2 pm', value_type: 'text', value_amount: null, applies_to: 'stays' })
    expect(tierBenefitBody({ ...form, value_type: 'percent_discount' }).value_amount).toBe(15)
  })

  it('finds what the tier already gives, and offers switched-off benefits only when kept', () => {
    const tb = { id: 9, benefit_id: 7, name: 'Late checkout', category: null, value: null, value_type: 'text', value_amount: null, applies_to: 'all' }
    expect(existingOn(tier({ benefits: [tb] }), 7)).toBe(tb)
    expect(existingOn(tier({ benefits: [tb] }), 8)).toBeNull()
    const off = benefit({ id: 8, is_active: false })
    expect(benefitChoices([benefit(), off]).map(b => b.id)).toEqual([7])
    expect(benefitChoices([benefit(), off], 8).map(b => b.id)).toEqual([7, 8])
  })

  it('shows a typed value only where one applies', () => {
    expect(typedValue({ value_type: 'percent_discount', value_amount: 10 })).toEqual({ type: 'percent_discount', amount: 10 })
    expect(typedValue({ value_type: 'text', value_amount: 10 })).toBeNull()
    expect(typedValue({ value_type: 'fixed_amount', value_amount: null })).toBeNull()
  })
})

describe('the venue\'s clock for boosts (spec §6.6)', () => {
  it('turns an instant into the venue\'s wall clock, not the browser\'s', () => {
    expect(wallOf('2026-10-21T10:00:00+00:00', 'Europe/Riga')).toBe('2026-10-21T13:00')
    expect(wallOf('2026-10-21T10:00:00Z', 'America/New_York')).toBe('2026-10-21T06:00')
    expect(wallOf('2026-12-21T10:00:00Z', 'Europe/Riga')).toBe('2026-12-21T12:00')
    expect(wallOf(null, 'Europe/Riga')).toBe('')
    expect(wallOf('not a time', 'Europe/Riga')).toBe('')
  })

  it('keeps a datetime-local value to the minute', () => {
    expect(wallInput('2026-10-21T13:00:30')).toBe('2026-10-21T13:00')
  })

  it('starts a new boost on the venue\'s today, for a week, and an existing one at its own times', () => {
    const fresh = boostFormOf(null, 'Europe/Riga', '2026-10-21')
    expect([fresh.starts_at, fresh.ends_at, fresh.multiplier]).toEqual(['2026-10-21T00:00', '2026-10-28T23:59', '2'])
    const kept = boostFormOf(boost({ days_of_week: [6, 0], tier_ids: [1] }), 'Europe/Riga', '2026-10-21')
    expect([kept.starts_at, kept.ends_at, kept.days, kept.tiers]).toEqual(['2026-10-24T10:00', '2026-10-25T23:59', [6, 0], [1]])
  })

  it('refuses an end before the start, and a multiplier outside 1–10', () => {
    const form = boostFormOf(boost(), 'UTC', '2026-10-21')
    expect(boostProblems(form)).toEqual({})
    expect(boostProblems({ ...form, ends_at: form.starts_at })).toEqual({ ends_at: 'order' })
    expect(boostProblems({ ...form, multiplier: '0.5' })).toEqual({ multiplier: 'multiplier' })
    expect(boostProblems({ ...form, multiplier: '11' })).toEqual({ multiplier: 'multiplier' })
    expect(boostProblems({ ...form, starts_at: '' })).toEqual({ starts_at: 'starts_at' })
  })

  it('sends the wall clock as it is, and empty lists as every day and every tier', () => {
    const form = { ...boostFormOf(null, 'UTC', '2026-10-21'), name: ' Weekend ', multiplier: '1,5', days: [6, 0], tiers: [] }
    expect(boostBody(form)).toEqual({
      name: 'Weekend', description: null, multiplier: 1.5, starts_at: '2026-10-21T00:00', ends_at: '2026-10-28T23:59',
      days_of_week: [0, 6], tier_ids: null, is_active: true,
    })
  })
})

describe('a boost\'s state and days', () => {
  it('reads the server\'s state, and anything new as off', () => {
    expect(['live', 'upcoming', 'ended', 'off', 'paused'].map(boostState)).toEqual(['live', 'upcoming', 'ended', 'off', 'off'])
    expect(['live', 'upcoming', 'ended', 'off'].map(s => boostTone(boostState(s)))).toEqual(['fulfilled', 'approved', 'cancelled', 'cancelled'])
  })

  it('names weekdays in the language, from Monday, and says nothing for every day', () => {
    expect(weekdayName(0, 'en')).toBe('Sun')
    expect(weekdayName(1, 'en', 'long')).toBe('Monday')
    expect(weekdaysText([0, 6, 5], 'en')).toBe('Fri, Sat, Sun')
    expect(weekdaysText(null, 'en')).toBe('')
    expect(weekdaysText([0, 1, 2, 3, 4, 5, 6], 'en')).toBe('')
  })

  it('toggles a choice in order, and keeps only tiers still in the ladder', () => {
    expect(toggled([1, 5], 3)).toEqual([1, 3, 5])
    expect(toggled([1, 3, 5], 3)).toEqual([1, 5])
    expect(chosenTiers([2, 99], [tier({ id: 1 }), tier({ id: 2 })]).map(x => x.id)).toEqual([2])
    expect(chosenTiers(null, [tier()])).toEqual([])
  })
})

describe('words for the server\'s values', () => {
  it('names a value the family knows and leaves any other as sent', () => {
    expect(named('loyalty.program.category', { dining: 'Dining' }, 'dining')).toEqual(['loyalty.program.category.dining', 'Dining'])
    expect(named('loyalty.program.category', { dining: 'Dining' }, 'spa')).toBeNull()
    expect(named('loyalty.program.category', { dining: 'Dining' }, null)).toBeNull()
  })

  it('reads a decimal comma as a point', () => {
    expect(decimalOf('1,5')).toBe(1.5)
    expect(decimalOf('abc')).toBeNull()
    expect(decimalOf('')).toBeNull()
  })
})
