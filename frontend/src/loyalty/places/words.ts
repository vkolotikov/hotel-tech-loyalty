/**
 * Places' words whose keys the code builds at run time (`loyalty.places.<family>.<code>`), with their English
 * fallbacks; loyaltyLocales.test.ts checks every family in all five places.<lang>.json bundles, the English equal to
 * these. A code without a word here reads as the family's `unknown`.
 */

/**
 * Why a member was or was not let in (AccessVerdict's reasons), in a few words, as an entries list shows each scan.
 * Short and free of facts (no date, no tier names), so they read the same in any list; the scan screen's band says the
 * fuller sentence with the scan's own facts (scan/doorWords.ts).
 */
export const REASON_WORDS: Record<string, string> = {
  welcome: 'Let in',
  member_erased: 'Member deleted',
  member_off: 'Membership switched off',
  expired: 'Membership expired',
  place_off: 'Place switched off',
  tier_not_allowed: 'Tier not let in here',
  event_not_open: 'Event not open',
  event_full: 'Event full',
  not_signed_up: 'Not signed up',
  unknown: 'Not let in',
}

/** Why a scanned code named nobody (CardLookup's refusals): an entry without a member is always one of these. */
export const REFUSAL_WORDS: Record<string, string> = {
  not_found: 'No member has this card or number',
  expired: 'QR code had expired',
  revoked: 'QR code had been replaced',
  used_up: 'QR code already used',
  inactive: 'Card switched off',
  unknown: 'Code not recognised',
}

/** What is wrong with a field of the place dialog (placesMath.ts `placeProblems`, and the server's answer). */
export const PROBLEM_WORDS: Record<string, string> = {
  name: 'Give the place a name.',
  name_long: 'At most 80 characters.',
  name_taken: 'Another place already has this name.',
  admits: 'Choose who may enter.',
  tiers: 'Tick at least one tier.',
  description: 'At most 300 characters.',
}

export const WORD_FAMILIES = {
  reason: REASON_WORDS,
  refusal: REFUSAL_WORDS,
  problem: PROBLEM_WORDS,
}
