/**
 * Push messages' words whose keys the code builds at run time (`loyalty.push.<family>.<value>`), with their English
 * fallbacks; i18n/loyaltyLocales.test.ts checks every family in all five push.<lang>.json bundles. The server sends
 * the values (a message's status, its category, the reasons it gives, how each member's push went); the workspace
 * names them. A value without a word here is shown as sent.
 */

/** A message's status (PushMessage::STATUS_*). */
export const STATUS_WORDS: Record<string, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  sending: 'Sending',
  sent: 'Sent',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

/** A message's kind: the member's own switches in the app (NotificationService::CATEGORIES). */
export const CATEGORY_WORDS: Record<string, string> = {
  offers: 'Offers',
  points: 'Points',
  tier: 'Tier news',
  stays: 'Visits and bookings',
}

/** What each kind is for, as the member's switch in the app covers it. */
export const CATEGORY_HINT_WORDS: Record<string, string> = {
  offers: 'Special offers, rewards and deals.',
  points: 'Points earned, bonuses and points that will expire.',
  tier: 'Tier changes and tier benefits.',
  stays: 'Visits, stays and bookings.',
}

/** Why a member of the segment will not get it (PushAudience's buckets). */
export const NOT_REACHED_WORDS: Record<string, string> = {
  push_off: '{{number}} switched push notifications off',
  no_device: '{{number}} have no phone with the app',
  opted_out: '{{number}} switched off this kind of message',
}

/** Why Send cannot be pressed yet (pushMath.ts `sendBlockers`). */
export const BLOCKER_WORDS: Record<string, string> = {
  unsaved: 'Save your changes first.',
  title: 'Write a title.',
  body: 'Write the message.',
  category: 'Choose what kind of message it is.',
  no_segment: 'Choose who receives it.',
  segment_gone: 'Its segment no longer exists. Choose another.',
  segment_problem: 'Its segment has a rule that cannot be used. Fix the segment first.',
}

/** What stops the draft from being saved (pushMath.ts `draftProblems`, `serverProblems`). */
export const PROBLEM_WORDS: Record<string, string> = {
  name: 'Give the message a name, up to {{max}} characters.',
  title_long: 'Keep the title to {{max}} characters.',
  body_long: 'Keep the message to {{max}} characters.',
  category: 'Choose one of the kinds below.',
  segment_gone: 'That segment no longer exists. Choose another.',
}

/** How a title or a message fits on a phone (pushMath.ts `lengthGuide`). */
export const GUIDE_WORDS: Record<string, string> = {
  fits: '{{chars}} of about {{guide}} characters that show in full',
  may_cut: '{{chars}} characters: phones may cut it after about {{guide}}',
  too_long: '{{chars}} characters: at most {{max}} can be saved',
}

/** How each member's push went (push_message_deliveries.status). */
export const OUTCOME_WORDS: Record<string, string> = {
  sent: 'Pushed',
  failed: 'Not delivered',
  inbox_only: 'Inbox only',
  skipped: 'Passed over',
  pending: 'Under way',
}

/** What each outcome means, under its number. */
export const OUTCOME_HINT_WORDS: Record<string, string> = {
  sent: 'The phone service took the push.',
  failed: 'The phone could not be reached, for example the app was removed. It is still in their inbox.',
  inbox_only: 'They switched push off after it started. It is in their inbox in the app.',
  skipped: 'They switched this kind of message off, or their account was switched off, after it started.',
  pending: 'They were being sent to when sending stopped. They are not sent to again.',
}

/** The families above by the key prefix they are read under. */
export const WORD_FAMILIES: Record<string, Record<string, string>> = {
  status: STATUS_WORDS,
  category: CATEGORY_WORDS,
  category_hint: CATEGORY_HINT_WORDS,
  not_reached: NOT_REACHED_WORDS,
  blocker: BLOCKER_WORDS,
  problem: PROBLEM_WORDS,
  guide: GUIDE_WORDS,
  outcome: OUTCOME_WORDS,
  outcome_hint: OUTCOME_HINT_WORDS,
}
