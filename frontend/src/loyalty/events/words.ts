import type { EventPhase, EventsTab } from './types'

/**
 * The Events area's words whose keys the code builds at run time (`loyalty.events.<family>.<value>`), with their
 * English fallbacks; loyaltyLocales.test.ts checks every family in all five events.<lang>.json bundles, the English
 * equal to these.
 */

export const TAB_WORDS: Record<EventsTab, string> = {
  upcoming: 'Upcoming',
  past: 'Past',
  drafts: 'Drafts',
}

export const PHASE_WORDS: Record<EventPhase, string> = {
  draft: 'Draft',
  upcoming: 'Published',
  on_now: 'On now',
  ended: 'Ended',
  cancelled: 'Cancelled',
}

/** What stops the dialog before anything is sent (eventsMath.ts `formProblems`), and the server's field errors. */
export const PROBLEM_WORDS: Record<string, string> = {
  title: 'Give the event a name.',
  date: 'Choose the day.',
  start: 'Choose when it starts.',
  end: 'Choose when it ends.',
  ends_at: 'The end must be after the start. For an event past midnight, tick “Ends on a later day”.',
  too_long: 'An event lasts at most 14 days.',
  place_id: 'Choose one of your places.',
  location: 'Say where, in at most 200 characters.',
  description: 'At most 2,000 characters.',
  tier_ids: 'Choose at least one tier.',
  points: 'Points: a whole number from 0 to 100,000.',
  capacity: 'Places: a whole number from 1 to 100,000, or leave it empty for no limit.',
  walk_ins: 'With sign-up off, walk-ins must be welcome — otherwise nobody can come.',
}

/** What a check-in by name said (eventsMath.ts `checkInSentence`), by AccessDecision's reason. */
export const REASON_WORDS: Record<string, string> = {
  welcome: 'Checked in: {{name}}',
  already_in: '{{name}} was checked in at {{time}}',
  member_erased: 'No access: this member was deleted.',
  member_off: 'No access: {{name}}’s membership is switched off.',
  expired: 'No access: the membership expired on {{date}}.',
  place_off: 'No access: this place is switched off.',
  tier_not_allowed: 'No access: for {{tiers}} only — {{name}} is {{tier}}.',
  event_not_open: 'No access: check-in for this event is not open now.',
  event_full: 'No access: the event is full.',
  not_signed_up: 'No access: {{name}} did not sign up, and walk-ins are off.',
  unknown: 'No access.',
}

/** A person's line on the event's page (eventsMath.ts `personState`). */
export const PERSON_WORDS = {
  in: 'Checked in {{time}}',
  walk_in: 'Walk-in · {{time}}',
  signed_up: 'Signed up',
  cancelled: 'Cancelled',
} as const

/**
 * Phrases with a number that must agree with it, as [one, other] — i18next picks the form by `count` with the
 * language's own plural rule from `<key>_one`, `_few`, `_many` and `_other` (every bundle carries all four; English
 * repeats its plural); `{{n}}` is the number as the language groups it ("1,500", "1 500").
 */
export const COUNTED = {
  signed_up: ['{{n}} signed up', '{{n}} signed up'],
  places_left: ['{{n}} place left', '{{n}} places left'],
  checked_in: ['{{n}} checked in', '{{n}} checked in'],
  walk_ins: ['{{n}} walk-in', '{{n}} walk-ins'],
  points_plus: ['+{{n}} point', '+{{n}} points'],
  places: ['{{n}} place', '{{n}} places'],
  members: ['{{n}} member', '{{n}} members'],
} as const satisfies Record<string, readonly [string, string]>

export type CountedKey = keyof typeof COUNTED

/** The four plural forms of every counted phrase, as the bundles hold them. */
export const COUNTED_FORMS: Record<string, string> = Object.fromEntries(
  Object.entries(COUNTED).flatMap(([key, [one, other]]) => [[`${key}_one`, one], [`${key}_few`, other], [`${key}_many`, other], [`${key}_other`, other]]),
)

export const WORD_FAMILIES: Record<string, Record<string, string>> = {
  tab: TAB_WORDS,
  phase: PHASE_WORDS,
  problem: PROBLEM_WORDS,
  reason: REASON_WORDS,
  person: PERSON_WORDS,
  count: COUNTED_FORMS,
}
