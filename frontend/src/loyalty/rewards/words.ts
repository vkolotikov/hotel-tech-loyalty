/**
 * Rewards' words whose keys the code builds at run time (`loyalty.rewards.<family>.<value>`), with their English
 * fallbacks; loyaltyLocales.test.ts checks every family in all five rewards.<lang>.json bundles. The server sends the
 * values (its option lists, the states); the workspace names them. A value without a word here is shown as sent.
 */

/** The page's tabs (rewardsMath.ts `REWARD_TABS`). */
export const TAB_WORDS: Record<string, string> = {
  catalogue: 'Catalogue',
  redemptions: 'Redemptions',
  offers: 'Offers',
  referrals: 'Referrals',
}

/** A redemption's state (RewardRedemption::STATUS_*). */
export const REDEMPTION_STATE_WORDS: Record<string, string> = {
  pending: 'Pending',
  fulfilled: 'Fulfilled',
  cancelled: 'Cancelled',
}

/** The redemptions list's filter (RedemptionController::TABS). */
export const REDEMPTION_FILTER_WORDS: Record<string, string> = {
  pending: 'Pending',
  done: 'Done',
  all: 'All',
}

/** An offer's state, worked out by the server against the venue's today (OfferController::state). */
export const OFFER_STATE_WORDS: Record<string, string> = {
  live: 'Running',
  upcoming: 'Upcoming',
  ended: 'Ended',
  off: 'Switched off',
}

/** An offer's type (LoyaltyForms::OFFER_TYPES). */
export const OFFER_TYPE_WORDS: Record<string, string> = {
  discount: 'Discount',
  points_multiplier: 'Points multiplier',
  free_night: 'Free night',
  upgrade: 'Upgrade',
  bonus_points: 'Bonus points',
  cashback: 'Cashback',
  fixed_amount: 'Amount off',
}

/** An offer's value as a sentence, for the types whose value has one meaning (rewardsMath.ts `offerValue`). */
export const OFFER_VALUE_WORDS: Record<string, string> = {
  discount: '{{value}}% off',
  fixed_amount: '{{value}} off',
  points_multiplier: '×{{value}} points',
  bonus_points: '{{value}} bonus points',
}

/** A reward's typed discount (LoyaltyForms::REWARD_DISCOUNT_TYPES). */
export const DISCOUNT_TYPE_WORDS: Record<string, string> = {
  percent_discount: 'Percentage off',
  fixed_amount: 'Amount off',
}

/** A reward's discount as a sentence (rewardsMath.ts `rewardDiscount`). */
export const DISCOUNT_PHRASE_WORDS: Record<string, string> = {
  percent_discount: '{{amount}}% off',
  fixed_amount: '{{amount}} off',
}

/** What a discount applies to (LoyaltyForms::appliesTo). */
export const APPLIES_TO_WORDS: Record<string, string> = {
  all: 'Every booking',
  services: 'Services only',
  stays: 'Stays only',
}

/** A referral's state. */
export const REFERRAL_STATE_WORDS: Record<string, string> = {
  pending: 'Pending',
  qualified: 'Qualified',
  rewarded: 'Rewarded',
}

/** What stops the reward form, before sending or from the server's field errors (rewardsMath.ts `rewardProblems`). */
export const REWARD_PROBLEM_WORDS: Record<string, string> = {
  name: 'Give the reward a name, up to 191 characters.',
  description: 'Check the description.',
  terms: 'Check the terms.',
  category: 'Keep the category to 60 characters.',
  points_cost: 'Enter a whole number of points from 1 to 1,000,000.',
  stock: 'Enter a whole number from 0 to 1,000,000, or leave it empty for no limit.',
  per_member_limit: 'Enter a whole number from 1 to 1,000, or leave it empty for no limit.',
  discount_type: 'Choose a kind of discount, or none.',
  discount_value: 'Enter a discount from 0.01 to 100,000.',
  percent_over: 'A percentage discount cannot be more than 100.',
  applies_to: 'Choose what the discount applies to.',
  expires_at: 'Choose a date and time, or leave it empty.',
}

/** What stops the offer form (rewardsMath.ts `offerProblems`). */
export const OFFER_PROBLEM_WORDS: Record<string, string> = {
  title: 'Give the offer a title, up to 191 characters.',
  description: 'Describe the offer: members read this.',
  type: 'Choose the kind of offer.',
  value: 'Enter a value from 0 to 999,999.99.',
  code: 'A code has 4 to 24 letters, digits or hyphens, or leave it empty.',
  code_taken: 'Another offer already has this code. Choose another one.',
  applies_to: 'Choose what the offer applies to.',
  tier_ids: 'A chosen tier is no longer in the programme. Choose the tiers again.',
  start_date: 'Choose the first day.',
  end_date: 'Choose the last day.',
  order: 'The offer must end after the day it starts.',
  usage_limit: 'Enter a whole number, 1 or more, or leave it empty for no limit.',
  per_member_limit: 'Enter a whole number, 1 or more, or leave it empty for no limit.',
}

/** What stops a picture before it is sent (rewardsMath.ts `pictureProblem`). */
export const PICTURE_PROBLEM_WORDS: Record<string, string> = {
  type: 'Use a JPEG, PNG or WebP picture.',
  size: 'This picture is larger than {{mb}} MB. Choose a smaller one.',
}

/** The families above by the key prefix they are read under. */
export const WORD_FAMILIES: Record<string, Record<string, string>> = {
  tab: TAB_WORDS,
  redemption_state: REDEMPTION_STATE_WORDS,
  redemption_filter: REDEMPTION_FILTER_WORDS,
  offer_state: OFFER_STATE_WORDS,
  offer_type: OFFER_TYPE_WORDS,
  offer_value: OFFER_VALUE_WORDS,
  discount_type: DISCOUNT_TYPE_WORDS,
  discount_phrase: DISCOUNT_PHRASE_WORDS,
  applies_to: APPLIES_TO_WORDS,
  referral_state: REFERRAL_STATE_WORDS,
  'reward.problem': REWARD_PROBLEM_WORDS,
  'offer.problem': OFFER_PROBLEM_WORDS,
  'picture.problem': PICTURE_PROBLEM_WORDS,
}
