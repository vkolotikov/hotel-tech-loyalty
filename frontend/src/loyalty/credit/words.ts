import type { CreditLineKind, CreditMode, CreditProblem } from './creditMath'

/**
 * Cashback credit's words whose keys the code builds at run time (`loyalty.credit.<family>.<value>`), with their English
 * fallbacks; i18n/loyaltyLocales.test.ts checks every family in all five credit.<lang>.json bundles.
 */

/** A line's kind (creditMath.ts `lineKind`). */
export const LINE_WORDS: Record<CreditLineKind, string> = {
  earn_appointment: 'Cashback on an appointment',
  earn_stay: 'Cashback on a stay',
  earn_purchase: 'Cashback on a purchase',
  earn: 'Cashback',
  spend: 'Used at the desk',
  reverse: 'Cashback taken back (refunded or cancelled)',
  merge: 'Moved at a merge of two memberships',
  forfeit: 'Forfeited when the member was deleted',
  adjust: 'Correction',
  other: 'Other',
}

/** What stops Use credit before sending (creditMath.ts `creditProblem`). */
export const USE_PROBLEM_WORDS: Record<CreditProblem, string> = {
  amount: 'Type an amount above zero.',
  decimals: 'The venue’s currency does not take that many decimals.',
  too_large: 'That is more than one step may take off.',
  over_balance: 'The member has only {{balance}} in credit.',
  below_zero: 'Credit cannot go below zero.',
  reason: 'Say why.',
}

/** What stops Adjust before sending (creditMath.ts `creditProblem`). */
export const ADJUST_PROBLEM_WORDS: Record<CreditProblem, string> = {
  amount: 'Type an amount other than zero: with a minus sign to take credit off.',
  decimals: 'The venue’s currency does not take that many decimals.',
  too_large: 'That is more than one correction may move.',
  over_balance: 'The member has only {{balance}} in credit.',
  below_zero: 'Credit cannot go below zero: the member has {{balance}}.',
  reason: 'Say why the credit is corrected.',
}

/** What a finished step says (creditMath.ts `doneMessage`). */
export const DONE_WORDS: Record<CreditMode, string> = {
  use: 'Took {{amount}} off. Credit now: {{balance}}.',
  adjust: 'Corrected by {{amount}}. Credit now: {{balance}}.',
}

export const PROBLEM_WORDS: Record<CreditMode, Record<CreditProblem, string>> = { use: USE_PROBLEM_WORDS, adjust: ADJUST_PROBLEM_WORDS }

export const WORD_FAMILIES: Record<string, Record<string, string>> = {
  line: LINE_WORDS,
  'use.problem': USE_PROBLEM_WORDS,
  'adjust.problem': ADJUST_PROBLEM_WORDS,
  done: DONE_WORDS,
}
