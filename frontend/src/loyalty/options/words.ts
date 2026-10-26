/**
 * "Ways to earn"'s words whose keys the code builds at run time (`loyalty.options.<family>.<value>`), with their English
 * fallbacks; loyaltyLocales.test.ts checks every family in all five options.<lang>.json bundles. The server sends the
 * keys (a way, an option, a choice, a preset); the workspace names them. A key without a word here is shown as sent.
 */

/** A way to earn or be rewarded: its card's title (ProgrammeOptions::WAYS). */
export const WAY_WORDS: Record<string, string> = {
  points_on_spend: 'Points on spend',
  points_expiry: 'Points expiry',
  welcome_bonus: 'Welcome bonus',
  birthday_bonus: 'Birthday bonus',
  referrals: 'Referrals',
  stamp_card: 'Stamp card',
  check_in: 'Check-in',
  desk_earn: 'Earn at the desk',
  cashback: 'Cashback credit',
  tier_progress: 'How members move up',
}

/** What each way is, in a line under its title. */
export const WAY_LINE_WORDS: Record<string, string> = {
  points_on_spend: 'Points for completed bookings, by what was spent.',
  points_expiry: 'Unused points run out after a while, which brings members back.',
  welcome_bonus: 'Points for joining.',
  birthday_bonus: 'Points on the member’s birthday.',
  referrals: 'Points for bringing a friend, for both of them.',
  stamp_card: 'A stamp for each visit; a full card gives a reward.',
  check_in: 'Staff check a member in at the desk after a scan.',
  desk_earn: 'Staff add a purchase made at the desk after a scan.',
  cashback: 'Part of what members spend comes back as credit for the desk.',
  tier_progress: 'What takes a member to the next tier. A change moves nobody at once: each member’s tier follows at their next visit or points.',
}

/** An option's field label (ProgrammeOptions::OPTIONS). */
export const FIELD_WORDS: Record<string, string> = {
  points_per_currency: 'Points for each {{money}} spent',
  points_expiry_months: 'Months until points expire',
  welcome_bonus_points: 'Points when they join',
  birthday_bonus_points: 'Points on their birthday',
  referrer_bonus_points: 'Points for the member who refers',
  referee_bonus_points: 'Points for the friend',
  referral_reward_on: 'When they get them',
  stamps_per_card: 'Stamps on a card',
  stamp_reward_kind: 'A full card gives',
  stamp_reward_points: 'Points for a full card',
  stamp_reward_id: 'Reward for a full card',
  checkin_points: 'Points for a check-in',
  cashback_percent: 'Credit back, as a % of the spend',
  tier_progress_by: 'Members move up by',
}

/** A line under a field, only where it prevents a mistake (the card's sentence already says the rest). */
export const HINT_WORDS: Record<string, string> = {
  points_per_currency: 'Higher tiers multiply it by their earn rate.',
  stamps_per_card: 'A change applies to new cards; cards already started keep their number.',
  tier_progress_by: 'A change moves nobody at once: each member’s tier follows at their next visit or points.',
}

/** A choice of an option whose values the server lists. */
export const REFERRAL_ON_WORDS: Record<string, string> = {
  first_visit: 'After the friend’s first visit',
  signup: 'As soon as the friend joins',
}

export const REWARD_KIND_WORDS: Record<string, string> = {
  points: 'Points',
  reward: 'A reward',
}

/** How members move between tiers (release 8, ProgrammeOptions `tier_progress_by`). */
export const PROGRESS_BY_WORDS: Record<string, string> = {
  points: 'Points',
  visits: 'Visits',
  spend: 'Spend',
}

/** Amounts as a sentence holds them: the one/many form is chosen by optionsMath.ts. */
export const AMOUNT_WORDS: Record<string, string> = {
  points_one: '1 point',
  points_many: '{{points}} points',
  months_one: '1 month',
  months_many: '{{months}} months',
}

/** What members get with a way as it stands (optionsMath.ts `sentenceOf`). */
export const SENTENCE_WORDS: Record<string, string> = {
  points_on_spend: 'Members get {{points}} for every {{money}} they spend.',
  points_on_spend_off: 'Bookings earn no points.',
  points_expiry: 'Points expire {{months}} after they are earned.',
  points_expiry_off: 'Points never expire.',
  welcome_bonus: 'New members get {{points}} when they join.',
  welcome_bonus_off: 'New members get no welcome bonus.',
  birthday_bonus: 'Members get {{points}} on their birthday.',
  birthday_bonus_off: 'Members get nothing on their birthday.',
  referrals_first_visit: 'A member who refers a friend gets {{referrer}} and the friend gets {{referee}}, once the friend has made a first visit.',
  referrals_signup: 'A member who refers a friend gets {{referrer}} and the friend gets {{referee}}, as soon as the friend joins.',
  referrals_off: 'Members have no referral link.',
  stamp_card_points: 'Members collect a stamp for each visit, one a day. A card holds {{stamps}} stamps; a full card gives {{points}}.',
  stamp_card_reward: 'Members collect a stamp for each visit, one a day. A card holds {{stamps}} stamps; a full card gives {{reward}}.',
  stamp_card_reward_unset: 'Members collect a stamp for each visit, one a day. A card holds {{stamps}} stamps; a full card gives a reward you choose.',
  stamp_card_off: 'No stamp card.',
  check_in_points: 'Staff check members in at the desk, once a day: each check-in gives {{points}} and counts as a visit.',
  check_in_visit: 'Staff check members in at the desk, once a day: each check-in counts as a visit.',
  check_in_off: 'No check-in at the desk.',
  desk_earn: 'Staff add a purchase at the desk after a scan, and the member earns points for it.',
  desk_earn_off: 'Purchases at the desk earn nothing.',
  cashback: 'Members get {{percent}}% of what they spend back as credit, to use at the desk.',
  cashback_off: 'No cashback credit.',
  tier_progress_points: 'Members move up as they earn points. They see “1,250 points to Gold”.',
  tier_progress_visits: 'Members move up by how often they come: one visit a day counts, whatever they spend. They see “3 more visits to Gold”.',
  tier_progress_spend: 'Members move up by what they spend at their visits. They see “€120 more to Gold”.',
}

/** What stops a field, before sending or from the server's field errors (optionsMath.ts `wayProblems`). */
export const PROBLEM_WORDS: Record<string, string> = {
  whole: 'Enter a whole number from {{min}} to {{max}}.',
  number: 'Enter a number from {{min}} to {{max}}, e.g. 2.5.',
  choice: 'Choose one of the options.',
  reward: 'Choose the reward a full card gives.',
}

/** A starting programme's name (LoyaltyPresetService::PRESETS); the server's label for one not listed. */
export const PRESET_WORDS: Record<string, string> = {
  hotel_classic: 'Hotel, five tiers',
  hotel_lite: 'Hotel, three tiers',
  beauty: 'Beauty and spa',
  restaurant: 'Restaurant and café',
  fitness: 'Fitness',
  medical: 'Clinic',
  simple_two_tier: 'Simple, two tiers',
  education: 'Education',
  professional_services: 'Professional services',
  real_estate: 'Property',
  retail: 'Shop and retail',
  members_club: 'Members’ club',
  events_community: 'Events and community',
}

/** A starting programme in a line; the server's description for one not listed. */
export const PRESET_LINE_WORDS: Record<string, string> = {
  hotel_classic: 'Bronze to Diamond. Points for every stay; higher tiers earn faster.',
  hotel_lite: 'Member, Plus and Elite. Simple, for smaller and boutique hotels.',
  beauty: 'Welcome, Devotee and Inner Circle. Rewards regular visits.',
  restaurant: 'Regular, Loyalist and Insider. Rewards come quickly at small spends.',
  fitness: 'Member, Plus and Pro. Rewards coming in to train.',
  medical: 'Patient and Care Plus. Priority booking; points for bookings start off.',
  simple_two_tier: 'Member and VIP. Easy to run for any small business.',
  education: 'Learner, Scholar and Alumni. Rewards study rather than spend.',
  professional_services: 'Client, Preferred and Partner. Large, rare jobs, where referrals count most.',
  real_estate: 'Client, Preferred and Partner. Rewards referrals and repeat clients.',
  retail: 'Member, Insider and VIP. Frequent small purchases; rewards land early.',
  members_club: 'Member, Regular and Insider. Members move up by how often they come.',
  events_community: 'Newcomer, Regular and Ambassador. Every event and visit counts, with a stamp card.',
}

/** The wizard's steps (optionsMath.ts `STEPS`). */
export const STEP_WORDS: Record<string, string> = {
  business: 'Your business',
  choose: 'Choose',
  configure: 'Configure',
  review: 'Review',
}

/** The page's sections (groups.ts `GROUP_ORDER`). */
export const GROUP_WORDS: Record<string, string> = {
  earn: 'Earn points',
  bonus: 'Bonuses',
  rule: 'Rules',
  more: 'More',
}

/** The families above by the key prefix they are read under. */
export const WORD_FAMILIES: Record<string, Record<string, string>> = {
  group: GROUP_WORDS,
  way: WAY_WORDS,
  way_line: WAY_LINE_WORDS,
  field: FIELD_WORDS,
  hint: HINT_WORDS,
  'choice.referral_reward_on': REFERRAL_ON_WORDS,
  'choice.stamp_reward_kind': REWARD_KIND_WORDS,
  'choice.tier_progress_by': PROGRESS_BY_WORDS,
  amount: AMOUNT_WORDS,
  sentence: SENTENCE_WORDS,
  problem: PROBLEM_WORDS,
  preset: PRESET_WORDS,
  preset_line: PRESET_LINE_WORDS,
  step: STEP_WORDS,
}

/** A choice's family, by the option it belongs to. */
export const CHOICE_WORDS: Record<string, Record<string, string>> = {
  referral_reward_on: REFERRAL_ON_WORDS,
  stamp_reward_kind: REWARD_KIND_WORDS,
  tier_progress_by: PROGRESS_BY_WORDS,
}
