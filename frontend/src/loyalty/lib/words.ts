import type { RequestState, RequestTab } from './types'

/**
 * The words whose keys the code builds at run time (`loyalty.requests.state.${state}`), with their English fallbacks.
 * src/i18n/localeCompleteness.test.ts sees only literal keys, so loyaltyLocales.test.ts checks these families: every
 * one in all five bundles, and the English bundle equal to the fallbacks here.
 */
export const REQUEST_STATE_WORDS: Record<RequestState, string> = {
  pending: 'Waiting',
  eligible: 'Waiting',
  approved: 'Approved',
  fulfilled: 'Done',
  declined: 'Declined',
  cancelled: 'Cancelled by the member',
}

export const REQUEST_TAB_WORDS: Record<RequestTab, string> = { waiting: 'Waiting', approved: 'Approved', done: 'Done' }

/** A ledger line's kind (member/memberMath.ts `lineType`). */
export const LINE_TYPE_WORDS = {
  earn: 'Earned',
  bonus: 'Bonus',
  adjust: 'Adjustment',
  redeem: 'Redeemed',
  expire: 'Expired',
  reverse: 'Reversal',
  referral: 'Referral',
  other: 'Other',
} as const

/** What stops the Points dialog before anything is sent (member/memberMath.ts `pointsProblem`). */
export const POINTS_PROBLEM_WORDS = {
  points: 'Enter a whole number of points, 1 or more.',
  too_many: 'At most 100,000 points at a time.',
  over_balance: 'The member has only {{balance}} points.',
  reason: 'Say why, in a few words. It shows in the member’s history.',
} as const

/** The families above by the key prefix they are read under. */
export const WORD_FAMILIES: Record<string, Record<string, string>> = {
  'requests.state': REQUEST_STATE_WORDS,
  'requests.tab': REQUEST_TAB_WORDS,
  'history.type': LINE_TYPE_WORDS,
  'member.problem': POINTS_PROBLEM_WORDS,
}
