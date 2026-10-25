/**
 * The desk's and the stamp card's words whose keys the code builds at run time (`loyalty.visits.<family>.<value>`),
 * with their English fallbacks; loyaltyLocales.test.ts checks every family in all five visits.<lang>.json bundles.
 */

/** The desk's answer, sentence by sentence (visitsMath.ts `deskSentences`). */
export const SAID_WORDS = {
  already_today: 'Already checked in today',
  checked_in: 'Checked in',
  checkin_points: '+{{points}} check-in points',
  purchase_points: '+{{points}} points',
  stamp: '+1 stamp — {{have}} of {{needed}}',
  stamp_had: 'Today’s stamp is already on the card',
  card_points: 'Card complete! +{{points}} points',
  card_reward: 'Card complete! Free reward: {{reward}}',
  credit: '+{{amount}} credit',
} as const

export type SaidKey = keyof typeof SAID_WORDS

/** A stamp's visit (StampCards::SOURCES). A source without a word here is shown as sent. */
export const SOURCE_WORDS: Record<string, string> = {
  appointment: 'Appointment',
  stay: 'Stay',
  check_in: 'Check-in',
  purchase: 'Purchase',
}

/** What a completed card gave (visitsMath.ts `givenSentence`). */
export const GIVEN_WORDS = {
  points: '+{{points}} points',
  reward: 'Free reward: {{reward}}',
} as const

/** What a full card gives now (visitsMath.ts `rewardSentence`). */
export const GIVES_WORDS = {
  points: 'A full card gives {{points}} points.',
  reward: 'A full card gives a free {{reward}}.',
} as const

/** Why Add a purchase does not send yet (visitsMath.ts `amountProblem`). */
export const PROBLEM_WORDS = {
  amount: 'Enter the amount of the purchase, above 0.',
  too_much: 'The amount can be at most {{max}}.',
  decimals: 'The amount has at most two decimals.',
  whole: 'Amounts in {{currency}} are whole numbers.',
} as const

export const WORD_FAMILIES: Record<string, Record<string, string>> = {
  said: SAID_WORDS,
  source: SOURCE_WORDS,
  given: GIVEN_WORDS,
  gives: GIVES_WORDS,
  problem: PROBLEM_WORDS,
}
