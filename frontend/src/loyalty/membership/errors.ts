/**
 * The members area's own words for each refusal, by where it happened, under loyalty.membership.<family>.error.<code>
 * (read with lib/errors.ts `refusalKey('loyalty.membership', ERRORS, family, failure)`). A manager's right is checked
 * by the controller (`manager_only`) and, in the server's enforce mode, by the access middleware first (`not_allowed`,
 * `no_capability`): all three read as the same missing right. `invalid` is Laravel's field answer, whose fields a form
 * marks in its own words (membershipMath.ts `*_FIELDS`). The server's sentence is never shown.
 */
const MANAGERS = 'Only an owner or a manager can do this.'
const OFFLINE = 'No connection: nothing was saved. Try again.'
const MARKED = 'Check the fields marked below.'
const GONE = 'This member is not in your programme any more.'
const ERASED = 'This member was deleted. Only their number and points history are kept.'

export const ERRORS: Record<string, Record<string, string>> = {
  load: {
    manager_only: MANAGERS,
    not_allowed: MANAGERS,
    no_capability: MANAGERS,
    network: 'No connection. Check the network and try again.',
    unknown: 'This could not be loaded. Please try again.',
  },
  add: {
    member_limit: 'Your plan’s member limit is reached. An owner can change the plan under Billing in the full admin.',
    no_tier: 'The programme has no tier yet, so no member can join. A manager can add one under Program.',
    invalid: MARKED,
    network: OFFLINE,
    unknown: 'The member could not be added. Please try again.',
  },
  details: {
    already_erased: ERASED,
    not_found: GONE,
    invalid: MARKED,
    network: OFFLINE,
    unknown: 'The details could not be saved. Please try again.',
  },
  tier: {
    manager_only: MANAGERS,
    not_allowed: MANAGERS,
    no_capability: MANAGERS,
    already_erased: ERASED,
    not_found: GONE,
    invalid: MARKED,
    network: OFFLINE,
    unknown: 'The tier could not be changed. Please try again.',
  },
  status: {
    manager_only: MANAGERS,
    not_allowed: MANAGERS,
    no_capability: MANAGERS,
    already_erased: ERASED,
    not_found: GONE,
    network: OFFLINE,
    unknown: 'That did not work. Nothing was changed; please try again.',
  },
  erase: {
    manager_only: MANAGERS,
    not_allowed: MANAGERS,
    no_capability: MANAGERS,
    name_mismatch: 'Type the member’s name exactly as it is shown.',
    already_erased: 'This member was already deleted.',
    not_found: GONE,
    invalid: 'Type the member’s name to confirm.',
    network: 'No connection: nothing was deleted. Try again.',
    unknown: 'The member could not be deleted. Nothing was changed; please try again.',
  },
  card: {
    already_erased: ERASED,
    not_found: GONE,
    network: 'No connection. Check the network and try again.',
    unknown: 'The card could not be loaded. Please try again.',
  },
  welcome: {
    too_soon: 'The welcome email was sent a moment ago. You can send it again in {{minutes}} min.',
    no_email: 'This member has no email address. Add one under Edit details first.',
    email_failed: 'The email could not be sent just now. Please try again in a few minutes.',
    already_erased: ERASED,
    not_found: GONE,
    network: 'No connection: nothing was sent. Try again.',
    unknown: 'The welcome email could not be sent. Please try again.',
  },
  merge: {
    manager_only: MANAGERS,
    not_allowed: MANAGERS,
    no_capability: MANAGERS,
    already_erased: 'One of the two was deleted, so they cannot be merged. The list now shows the pairs as they are.',
    not_found: 'One of the two is no longer in your programme. The list now shows the pairs as they are.',
    invalid: 'Say why the two are one person, in a few words.',
    network: 'No connection: nothing was merged. Try again.',
    unknown: 'The members could not be merged. Nothing was changed; please try again.',
  },
  import: {
    manager_only: MANAGERS,
    not_allowed: MANAGERS,
    no_capability: MANAGERS,
    no_email_column: 'The file has no email column. Columns found: {{columns}}. Name the column with the addresses “email” and try again.',
    no_rows: 'The file has a header row but no members under it.',
    file_empty: 'The file is empty.',
    no_header: 'The file has no header row. The first row must name the columns.',
    file_unreadable: 'The file could not be read. Save it again as CSV (UTF-8) and try again.',
    too_many_rows: 'The file has {{rows}} rows; one import takes at most {{max}}. Split it into smaller files.',
    invalid: 'Choose a CSV file of at most 20 MB.',
    busy: 'This import is being run from another window. The page now shows where it stands.',
    not_found: 'This import is no longer here.',
    network: 'No connection. The import stopped where it was; press Continue to go on.',
    unknown: 'The import stopped. What was imported stays; press Continue to go on.',
  },
  // Release 8: a membership's end date (MembershipValidity on the server).
  validity: {
    manager_only: MANAGERS,
    not_allowed: MANAGERS,
    no_capability: MANAGERS,
    already_erased: ERASED,
    not_found: GONE,
    key_reused: 'Another change was just made. The page now shows the end date as it is; try again if it is not what you wanted.',
    invalid: 'Choose today or a later day.',
    network: OFFLINE,
    unknown: 'The end date could not be saved. Nothing was changed; please try again.',
  },
  export: {
    manager_only: MANAGERS,
    not_allowed: MANAGERS,
    no_capability: MANAGERS,
    network: 'No connection. Check the network and try again.',
    unknown: 'The file could not be made. Please try again.',
  },
}
