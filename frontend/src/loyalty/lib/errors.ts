import type { ApiFailure } from './api'

/**
 * The workspace's own words for each refusal (spec 2026-10-21 §6.4), by where it happened. The bundles hold them under
 * loyalty.<family>.error.<code> (loyaltyLocales.test.ts keeps the English bundle equal to these fallbacks). A code a
 * family does not list reads as `unknown`. The server's sentence is never shown. Program and Rewards keep their own
 * families beside their pages, in the same shape (program/errors.ts, rewards/errors.ts).
 */
export const ERRORS = {
  load: {
    not_found: 'This member is not in your programme any more.',
    network: 'No connection. Check the network and try again.',
    unknown: 'This could not be loaded. Please try again.',
  },
  // The server's own check says not_allowed; the access map, once enforced, says no_capability.
  points: {
    not_allowed: 'Your account may not do this. A manager can change that under Team in the full admin.',
    no_capability: 'Your account may not do this. A manager can change that under Team in the full admin.',
    not_enough_points: 'The member has only {{balance}} points.',
    invalid: 'Check the points and the reason.',
    not_found: 'This member is not in your programme any more.',
    network: 'No connection: nothing was saved. Try again.',
    unknown: 'That did not work. Nothing was saved; please try again.',
  },
  reverse: {
    manager_only: 'Only an owner or a manager can reverse points.',
    not_allowed: 'Only an owner or a manager can reverse points.',
    already_reversed: 'This line was already reversed.',
    cannot_reverse: 'A reversal cannot be reversed.',
    invalid: 'Say why the points are reversed.',
    not_found: 'This line is no longer in the member’s history.',
    network: 'No connection: nothing was saved. Try again.',
    unknown: 'The points could not be reversed. Please try again.',
  },
  requests: {
    wrong_state: 'Someone else already handled this request. The list now shows it as it is.',
    invalid: 'Say why the request is declined.',
    not_found: 'This request no longer exists.',
    network: 'No connection: nothing was saved. Try again.',
    unknown: 'That did not work. Please try again.',
  },
  scan: {
    not_found: 'No member has this card or number.',
    expired: 'This QR code has expired. Ask the member to open their card again.',
    revoked: 'This QR code was replaced by a newer one. Ask the member to open their card again.',
    used_up: 'This QR code was already used. Ask the member to open their card again.',
    inactive: 'This member’s account is switched off.',
    invalid: 'Scan a card or type a member number.',
    network: 'No connection. Try again.',
    unknown: 'The scan did not work. Please try again.',
  },
} as const

export type ErrorFamily = keyof typeof ERRORS

/** The key and English fallback for a refusal in one family of a word map. */
export function refusalKey<M extends Record<string, Record<string, string>>>(prefix: string, words: M, family: keyof M & string, failure: ApiFailure): [string, string] {
  const list = words[family]
  const code = failure.code in list ? failure.code : 'unknown'
  return [`${prefix}.${family}.error.${code}`, list[code] ?? list.unknown]
}

/** The key and English fallback for a refusal of the core families. */
export function errorKey(family: ErrorFamily, failure: ApiFailure): [string, string] {
  return refusalKey('loyalty', ERRORS, family, failure)
}
