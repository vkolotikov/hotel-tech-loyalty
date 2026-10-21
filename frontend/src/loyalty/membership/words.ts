/**
 * The members area's words whose keys the code builds at run time (`loyalty.membership.<family>.<value>`), with their
 * English fallbacks; i18n/loyaltyLocales.test.ts checks every family in all five membership.<lang>.json bundles. The
 * server sends the codes (a reason two members match, a row's problem, a batch's state, the columns an import takes);
 * the workspace names them. A value without a word here reads as the family's `other` where it has one.
 */

/** An item of a member's More menu (membershipMath.ts `moreItems`). */
export const MORE_WORDS: Record<string, string> = {
  welcome: 'Resend the welcome email',
  tier: 'Change tier',
  deactivate: 'Deactivate',
  reactivate: 'Reactivate',
  erase: 'Delete member',
}

/** What stops Add member, before sending or from the server's field errors (membershipMath.ts `enrolProblems`). */
export const ENROL_PROBLEM_WORDS: Record<string, string> = {
  name: 'Write the member’s name.',
  email: 'Write an email address, e.g. name@example.com.',
  email_taken: 'This email is already in use. Look for the member in the list, or use another address.',
  phone: 'Keep the phone number to 20 characters.',
}

/** What stops Edit details (membershipMath.ts `detailsProblems`). */
export const DETAILS_PROBLEM_WORDS: Record<string, string> = {
  name: 'Write the member’s name.',
  email: 'Write an email address, e.g. name@example.com.',
  email_taken: 'This email is already in use by another account. Use another address.',
  phone: 'Keep the phone number to 20 characters.',
  language: 'Choose one of the languages offered.',
  nationality: 'Keep the nationality to 100 characters.',
  date_of_birth: 'Choose a date of birth that is not in the future.',
}

/** What stops Change tier (membershipMath.ts `tierProblems`). */
export const TIER_PROBLEM_WORDS: Record<string, string> = {
  tier_id: 'Choose one of the programme’s tiers.',
  keep_until: 'Choose a day after today, or leave it empty.',
}

/** What the Delete dialog lists as going (membershipMath.ts `ERASE_GOES`). */
export const ERASE_GOES_WORDS: Record<string, string> = {
  name: 'The name',
  email: 'The email address',
  phone: 'The phone number',
  birthday: 'The date of birth',
  push: 'The app’s push notifications',
  cards: 'Their cards and QR codes',
  sign_in: 'Their sign-in to the app and the portal',
}

/** What the Delete dialog lists as staying (membershipMath.ts `ERASE_STAYS`). */
export const ERASE_STAYS_WORDS: Record<string, string> = {
  number: 'The member number',
  history: 'The points history, bookings and redemptions, so the figures still add up',
}

/** Why two members look like one person (DuplicatesController). */
export const REASON_WORDS: Record<string, string> = {
  same_email: 'Same email',
  same_phone: 'Same phone',
}

/** What moves to the kept member (membershipMath.ts `MERGE_MOVES`). */
export const MERGE_MOVES_WORDS: Record<string, string> = {
  history: 'The points history and the points, added to the kept member’s',
  bookings: 'Bookings of stays and services',
  redemptions: 'Reward redemptions',
  referrals: 'Referrals, made and received',
  requests: 'Benefit requests',
  cards: 'Cards and QR codes',
  messages: 'Notifications, reviews and campaign emails',
  guests: 'The link to the guest record in the CRM',
}

/** A row an import did not take (ImportProblems on the server). */
export const IMPORT_PROBLEM_WORDS: Record<string, string> = {
  no_email: 'No email address in this row.',
  no_name: 'No name in this row.',
  bad_email: 'The email address is not valid.',
  repeated: 'The same address is on line {{line}}.',
  already_member: 'Already a member.',
  unknown_tier: 'There is no tier called “{{tier}}”.',
  member_limit: 'Over the plan’s member limit.',
  not_created: 'The member could not be created.',
  unreadable: 'This row could not be read: it has more values than the file has columns.',
  other: 'This row was not imported.',
}

/** A row's fate in the problems list. */
export const IMPORT_KIND_WORDS: Record<string, string> = {
  skipped: 'Passed over',
  refused: 'Refused',
}

/** A batch's state (MemberImportBatch). */
export const IMPORT_STATE_WORDS: Record<string, string> = {
  pending: 'Ready to import',
  running: 'Importing',
  completed: 'Done',
  cancelled: 'Stopped',
  failed: 'Failed',
}

/** The columns an import understands (MemberImportService's aliases, sent by the server). */
export const COLUMN_WORDS: Record<string, string> = {
  name: 'Name',
  first_name: 'First name',
  last_name: 'Last name',
  email: 'Email',
  phone: 'Phone',
  tier_name: 'Tier',
  points: 'Points',
  lifetime_points: 'Lifetime points',
  joined_at: 'Joined',
  date_of_birth: 'Date of birth',
  marketing_consent: 'Marketing consent',
  external_id: 'Customer number',
}

/** The families above by the key prefix they are read under. */
export const WORD_FAMILIES: Record<string, Record<string, string>> = {
  more: MORE_WORDS,
  'add.problem': ENROL_PROBLEM_WORDS,
  'details.problem': DETAILS_PROBLEM_WORDS,
  'tier.problem': TIER_PROBLEM_WORDS,
  'erase.goes': ERASE_GOES_WORDS,
  'erase.stays': ERASE_STAYS_WORDS,
  'duplicates.reason': REASON_WORDS,
  'merge.moves': MERGE_MOVES_WORDS,
  'import.problem': IMPORT_PROBLEM_WORDS,
  'import.kind': IMPORT_KIND_WORDS,
  'import.state': IMPORT_STATE_WORDS,
  'import.column': COLUMN_WORDS,
}

/** The key and English of a word of a family, or of the family's `other` (or the value itself) for one it lacks. */
export function wordOf(family: string, value: string): [string, string] {
  const list = WORD_FAMILIES[family] ?? {}
  if (value in list) return [`loyalty.membership.${family}.${value}`, list[value]]
  if ('other' in list) return [`loyalty.membership.${family}.other`, list.other]
  return [`loyalty.membership.${family}.${value}`, value]
}
