/**
 * The scan screen's words whose keys the code builds at run time (`loyalty.door.<family>.<word>`, verdict.ts), with
 * their English fallbacks. doorWords.test.ts holds every family in all five door.<lang>.json bundles, the English equal
 * to these (loyaltyLocales.test.ts reads an area's words from `<area>/words.ts`, and the door's live in scan/).
 *
 * One copy of the verdict's sentences: these. They need the scan's own facts — the end date, the tiers let in and the
 * member's own, the event's opening time — so the scan says them. The short words of an entries list ("Membership
 * expired") are the places' (`places/words.ts`, read through `placesMath.entryWords`), which "Today here" uses too.
 */

/** The band's first line. */
export const HEADLINE_WORDS = {
  welcome: 'Welcome',
  no_access: 'No access',
  card_unknown: 'Card not recognised',
  trouble: 'Try again',
  choose_again: 'Choose again',
} as const

/** Why a member was not let in (AccessVerdict's reasons), and why a code named nobody. */
export const REASON_WORDS = {
  member_erased: 'This member was deleted.',
  member_off: 'This membership is switched off.',
  expired: 'Membership expired on {{date}}.',
  expired_plain: 'This membership has expired.',
  place_off: '{{place}} is switched off.',
  place_off_plain: 'This place is switched off.',
  tier_not_allowed: '{{tiers}} only — {{name}} is {{tier}}.',
  tier_not_allowed_no_tier: '{{tiers}} only — {{name}} has no tier.',
  tier_not_allowed_none: 'No tier is let in here yet.',
  event_not_open: 'Check-in is not open for this event now.',
  event_opens: 'Check-in opens at {{time}}.',
  event_ended: 'This event has ended.',
  event_cancelled: 'This event was cancelled.',
  event_draft: 'This event is not published yet.',
  event_full: 'The event is full.',
  not_signed_up: 'Not signed up for this event.',
  other: 'Not let in here.',
  card_off: 'This card was switched off.',
  gone_place: 'This place no longer exists. Choose another place, or the desk.',
  gone_event: 'This event no longer exists. Choose another event, or the desk.',
} as const

/** The amber band's warning: let in, and the membership ends soon. */
export const WARNING_WORDS = {
  ends_today: 'Membership ends today.',
  ends_tomorrow: 'Membership ends tomorrow.',
  ends_in: 'Membership ends in {{days}} days.',
} as const

/** What an event's check-in says beside the welcome. */
export const FACT_WORDS = {
  checked_in: 'Checked in',
  signed_up: 'Signed up',
  walk_in: 'Walk-in',
  already_in: 'Already checked in at {{time}}',
  already_in_on: 'Already checked in on {{date}} at {{time}}',
  points: '+{{points}} points',
  points_one: '+1 point',
} as const

/** The membership's end date under the member's name (the verdict and the desk's card). */
export const VALIDITY_WORDS = {
  until: 'Valid until {{date}}',
  ending: 'Valid until {{date}} — ends in {{days}} days',
  ending_tomorrow: 'Valid until {{date}} — ends tomorrow',
  ending_today: 'Valid until today',
  ended: 'Membership ended on {{date}}',
} as const

export const WORD_FAMILIES: Record<string, Record<string, string>> = {
  headline: HEADLINE_WORDS,
  reason: REASON_WORDS,
  warning: WARNING_WORDS,
  fact: FACT_WORDS,
  validity: VALIDITY_WORDS,
}
