/**
 * Program's words whose keys the code builds at run time (`loyalty.program.<family>.<value>`), with their English
 * fallbacks; loyaltyLocales.test.ts checks every family in all five program.<lang>.json bundles. The server sends the
 * values (its option lists, a boost's state); the workspace names them. A value without a word here is shown as sent.
 */

/** A boost's state, worked out by the server against its own now (ProgramController::boostState). */
export const BOOST_STATE_WORDS: Record<string, string> = {
  live: 'Live',
  upcoming: 'Upcoming',
  ended: 'Ended',
  off: 'Switched off',
}

/** A benefit's category (LoyaltyForms::BENEFIT_CATEGORIES). */
export const CATEGORY_WORDS: Record<string, string> = {
  accommodation: 'Accommodation',
  dining: 'Dining',
  wellness: 'Wellness',
  transport: 'Transport',
  recognition: 'Recognition',
  points: 'Points',
  access: 'Access',
  discount: 'Discount',
  other: 'Other',
}

/** How a benefit is given (LoyaltyForms::FULFILLMENT_MODES). */
export const FULFILLMENT_WORDS: Record<string, string> = {
  automatic: 'Automatic',
  staff_approved: 'Approved by staff',
  pms_linked: 'Linked to the booking system',
  voucher: 'Voucher',
  on_request: 'On request',
}

/** A tier benefit's kind of value (DiscountService::VALUE_TYPES). */
export const VALUE_TYPE_WORDS: Record<string, string> = {
  text: 'Wording only',
  percent_discount: 'Percentage discount',
  fixed_amount: 'Fixed amount off',
  points_multiplier: 'Points multiplier',
  free_item: 'Free item',
}

/** A typed value as a member would read it (programMath.ts `typedValue`). */
export const VALUE_PHRASE_WORDS: Record<string, string> = {
  percent_discount: '{{amount}}% off',
  fixed_amount: '{{amount}} off',
  points_multiplier: '×{{amount}} points',
}

/** What a discount applies to (LoyaltyForms::appliesTo). */
export const APPLIES_TO_WORDS: Record<string, string> = {
  all: 'Every booking',
  services: 'Services only',
  stays: 'Stays only',
}

/** What it takes to reach a tier (programMath.ts `thresholds`). */
export const THRESHOLD_WORDS: Record<string, string> = {
  points: 'Points to reach',
  nights: 'Nights to reach',
  stays: 'Stays to reach',
  spend: 'Spend to reach',
  visits: 'Visits to reach',
}

/** What stops the tier form, before sending or from the server's field errors (programMath.ts `tierProblems`). */
export const TIER_PROBLEM_WORDS: Record<string, string> = {
  name: 'Give the tier a name.',
  color: 'Write the colour as # and six hex digits, e.g. #c9a227, or leave it empty.',
  min_points: 'Enter a whole number of points from 0 to 10,000,000.',
  earn_rate: 'Enter an earn rate from 0 to 99.99, e.g. 1.5.',
  description: 'Check the description.',
  min_visits: 'Enter a whole number of visits from 0 to 100,000, or leave it empty.',
  min_spend: 'Enter an amount from 0 to 100,000,000, e.g. 250, or leave it empty.',
}

/** What stops the benefit form (programMath.ts `benefitProblems`). */
export const BENEFIT_PROBLEM_WORDS: Record<string, string> = {
  name: 'Give the benefit a name.',
  code: 'Give the benefit a short code, up to 50 characters.',
  code_taken: 'Another benefit already has this code. Choose another one.',
  category: 'Choose a category.',
  fulfillment_mode: 'Choose how the benefit is given.',
  description: 'Check the description.',
}

/** What stops giving a tier a benefit (programMath.ts `tierBenefitProblems`). */
export const TIER_BENEFIT_PROBLEM_WORDS: Record<string, string> = {
  benefit_id: 'Choose a benefit from the catalogue.',
  value: 'Keep the wording to 255 characters.',
  value_type: 'Choose what kind of value this is.',
  value_amount: 'Enter an amount from 0 to 1,000,000.',
  percent_over: 'A percentage discount cannot be more than 100.',
  multiplier_under: 'A points multiplier must be at least 1.',
  applies_to: 'Choose what the value applies to.',
}

/** What stops the boost form (programMath.ts `boostProblems`). */
export const BOOST_PROBLEM_WORDS: Record<string, string> = {
  name: 'Give the boost a name, up to 120 characters.',
  description: 'Keep the description to 500 characters.',
  multiplier: 'Enter a multiplier from 1 to 10, e.g. 2 or 1.5.',
  starts_at: 'Choose when the boost starts.',
  ends_at: 'Choose when the boost ends.',
  order: 'The boost must end after it starts.',
  days_of_week: 'Check the weekdays.',
  tier_ids: 'A chosen tier is no longer in the programme. Choose the tiers again.',
}

/** The families above by the key prefix they are read under. */
export const WORD_FAMILIES: Record<string, Record<string, string>> = {
  boost_state: BOOST_STATE_WORDS,
  category: CATEGORY_WORDS,
  fulfillment_mode: FULFILLMENT_WORDS,
  value_type: VALUE_TYPE_WORDS,
  value_phrase: VALUE_PHRASE_WORDS,
  applies_to: APPLIES_TO_WORDS,
  threshold: THRESHOLD_WORDS,
  'tier.problem': TIER_PROBLEM_WORDS,
  'benefit.problem': BENEFIT_PROBLEM_WORDS,
  'tier_benefit.problem': TIER_BENEFIT_PROBLEM_WORDS,
  'boost.problem': BOOST_PROBLEM_WORDS,
}
