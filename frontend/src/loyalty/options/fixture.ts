import type { OptionsAnswer, Preset } from './types'

/**
 * An answer of `GET options` as the server gives it (ProgrammeOverview, OptionsTest pins the shape), for the tests:
 * a venue that never set anything, with three tiers, two rewards and the presets of a beauty salon.
 */
export function answerFixture(more: Partial<OptionsAnswer> = {}): OptionsAnswer {
  return {
    options: {
      points_on_bookings: true, points_per_currency: 1, points_expiry_months: 24, welcome_bonus_points: 500, birthday_bonus_points: 500,
      referral_enabled: true, referrer_bonus_points: 250, referee_bonus_points: 250, referral_reward_on: 'first_visit',
      stamps_enabled: false, stamps_per_card: 10, stamp_reward_kind: 'points', stamp_reward_points: 100, stamp_reward_id: null,
      checkin_enabled: false, checkin_points: 0, desk_earn_enabled: false, cashback_enabled: false, cashback_percent: 5,
      programme_setup_completed_at: null,
    },
    ways: [
      { key: 'points_on_spend', switch: 'points_on_bookings', zero_off: null, fields: ['points_per_currency'] },
      { key: 'points_expiry', switch: null, zero_off: 'points_expiry_months', fields: ['points_expiry_months'] },
      { key: 'welcome_bonus', switch: null, zero_off: 'welcome_bonus_points', fields: ['welcome_bonus_points'] },
      { key: 'birthday_bonus', switch: null, zero_off: 'birthday_bonus_points', fields: ['birthday_bonus_points'] },
      { key: 'referrals', switch: 'referral_enabled', zero_off: null, fields: ['referrer_bonus_points', 'referee_bonus_points', 'referral_reward_on'] },
      { key: 'stamp_card', switch: 'stamps_enabled', zero_off: null, fields: ['stamps_per_card', 'stamp_reward_kind', 'stamp_reward_points', 'stamp_reward_id'] },
      { key: 'check_in', switch: 'checkin_enabled', zero_off: null, fields: ['checkin_points'] },
      { key: 'desk_earn', switch: 'desk_earn_enabled', zero_off: null, fields: [] },
      { key: 'cashback', switch: 'cashback_enabled', zero_off: null, fields: ['cashback_percent'] },
    ],
    fields: {
      points_on_bookings: { type: 'bool', default: true, min: null, max: null, choices: null, when: null },
      points_per_currency: { type: 'decimal', default: 1, min: 0.01, max: 1000, choices: null, when: null },
      points_expiry_months: { type: 'int', default: 24, min: 0, max: 120, choices: null, when: null },
      welcome_bonus_points: { type: 'int', default: 500, min: 0, max: 1000000, choices: null, when: null },
      birthday_bonus_points: { type: 'int', default: 500, min: 0, max: 1000000, choices: null, when: null },
      referral_enabled: { type: 'bool', default: true, min: null, max: null, choices: null, when: null },
      referrer_bonus_points: { type: 'int', default: 250, min: 0, max: 1000000, choices: null, when: null },
      referee_bonus_points: { type: 'int', default: 250, min: 0, max: 1000000, choices: null, when: null },
      referral_reward_on: { type: 'enum', default: 'first_visit', min: null, max: null, choices: ['first_visit', 'signup'], when: null },
      stamps_enabled: { type: 'bool', default: false, min: null, max: null, choices: null, when: null },
      stamps_per_card: { type: 'int', default: 10, min: 2, max: 50, choices: null, when: null },
      stamp_reward_kind: { type: 'enum', default: 'points', min: null, max: null, choices: ['points', 'reward'], when: null },
      stamp_reward_points: { type: 'int', default: 100, min: 1, max: 1000000, choices: null, when: { field: 'stamp_reward_kind', is: 'points' } },
      stamp_reward_id: { type: 'reward', default: null, min: null, max: null, choices: null, when: { field: 'stamp_reward_kind', is: 'reward' } },
      checkin_enabled: { type: 'bool', default: false, min: null, max: null, choices: null, when: null },
      checkin_points: { type: 'int', default: 0, min: 0, max: 100000, choices: null, when: null },
      desk_earn_enabled: { type: 'bool', default: false, min: null, max: null, choices: null, when: null },
      cashback_enabled: { type: 'bool', default: false, min: null, max: null, choices: null, when: null },
      cashback_percent: { type: 'decimal', default: 5, min: 0.1, max: 50, choices: null, when: null },
    },
    catalogue: { tiers: 3, rewards: [{ id: 7, name: 'Free coffee', points_cost: 100 }, { id: 9, name: 'Spa ritual', points_cost: 2500 }], offers: 2, boosts: 1 },
    presets: [presetFixture('beauty', true), presetFixture('hotel_classic', false)],
    setup_done: false,
    can_change: true,
    ...more,
  }
}

export function presetFixture(key: string, recommended: boolean): Preset {
  const beauty = key === 'beauty'
  return {
    key,
    label: beauty ? 'Beauty / Spa — Visit ladder' : 'Hotel — Classic 5-tier',
    description: 'From the server.',
    icon: beauty ? 'sparkles' : 'building-2',
    tier_count: beauty ? 3 : 5,
    tier_names: beauty ? ['Welcome', 'Devotee', 'Inner Circle'] : ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'],
    reward_count: 5,
    sample_rewards: beauty ? ['Brow Tidy', '10 Off Any Service'] : ['Late Checkout', 'Breakfast for Two'],
    welcome_bonus: beauty ? 100 : 500,
    recommended,
    is_current: false,
    recommends: beauty
      ? { points_on_bookings: true, points_per_currency: 10, points_expiry_months: 18, welcome_bonus_points: 100, birthday_bonus_points: 200, referral_enabled: true, referrer_bonus_points: 300, referee_bonus_points: 150, referral_reward_on: 'first_visit', stamps_enabled: true, stamps_per_card: 8, stamp_reward_kind: 'points', stamp_reward_points: 400, checkin_enabled: false, checkin_points: 0, desk_earn_enabled: false, cashback_enabled: false, cashback_percent: 5 }
      : { points_on_bookings: true, points_per_currency: 10, points_expiry_months: 24, welcome_bonus_points: 500, birthday_bonus_points: 500, referral_enabled: true, referrer_bonus_points: 1000, referee_bonus_points: 500, referral_reward_on: 'first_visit', stamps_enabled: false, stamps_per_card: 10, stamp_reward_kind: 'points', stamp_reward_points: 100, checkin_enabled: false, checkin_points: 0, desk_earn_enabled: false, cashback_enabled: false, cashback_percent: 5 },
  }
}
