/**
 * Push messages' own words for each refusal, by where it happened, under loyalty.push.<family>.error.<code> (read with
 * lib/errors.ts `refusalKey('loyalty.push', ERRORS, family, failure)`). A missing right is the controller's
 * `manager_only` or, in the server's enforce mode, the access middleware's `not_allowed`: both read as the manager's
 * right. `feature_locked` is the plan's (the push routes need `push_notifications`). `invalid` is Laravel's field
 * answer, whose fields the form marks in its own words. Where a press may have reached the server before the
 * connection dropped (Send, Cancel), the words say to look before pressing again.
 */
const MANAGER = 'Only an owner or a manager can work with push messages.'
const PLAN = 'Your plan does not include push messages.'
const OFFLINE = 'No connection: nothing was saved. Try again.'
const GONE = 'This push message no longer exists.'

export const ERRORS: Record<string, Record<string, string>> = {
  load: {
    not_found: GONE,
    manager_only: MANAGER,
    not_allowed: MANAGER,
    feature_locked: PLAN,
    network: 'No connection. Check the network and try again.',
    unknown: 'This could not be loaded. Please try again.',
  },
  create: {
    manager_only: MANAGER,
    not_allowed: MANAGER,
    feature_locked: PLAN,
    network: 'No connection: no message was made. Try again.',
    unknown: 'The message could not be made. Please try again.',
  },
  save: {
    not_a_draft: 'This message is no longer a draft: it was sent meanwhile. The page now shows it as it is.',
    not_found: GONE,
    invalid: 'Check the fields marked below.',
    manager_only: MANAGER,
    not_allowed: MANAGER,
    feature_locked: PLAN,
    network: OFFLINE,
    unknown: 'The draft could not be saved. Please try again.',
  },
  audience: {
    no_audience: 'Choose who receives it first.',
    no_category: 'Choose what kind of message it is first.',
    bad_rule: 'Its segment has a rule that cannot be used. Fix the segment first.',
    not_found: GONE,
    manager_only: MANAGER,
    not_allowed: MANAGER,
    network: 'No connection: who it would reach could not be counted.',
    unknown: 'Who it would reach could not be counted. Please try again.',
  },
  send: {
    already_started: 'This message was already started. The page now shows how far it got.',
    changed: 'The message changed since this page showed it. Check it, then send again.',
    audience_changed: 'The number of members it would reach is now {{reached}}. Check the number, then send again.',
    incomplete: 'The message is not ready to send. The page now shows what it still needs.',
    no_audience: 'Choose who receives it first.',
    no_category: 'Choose what kind of message it is first.',
    bad_rule: 'Its segment has a rule that cannot be used. Fix the segment first.',
    nobody_to_send_to: 'Nobody in this segment can receive it.',
    too_many: 'It would reach more than {{limit}} members, the most one message may. Narrow the segment.',
    not_started: 'The message could not be queued. Nothing was sent; please try again.',
    not_found: GONE,
    manager_only: MANAGER,
    not_allowed: MANAGER,
    feature_locked: PLAN,
    network: 'No connection. Reload the page to see whether it started before you press Send again.',
    unknown: 'It may not have started. Reload the page to see its state before you press Send again.',
  },
  cancel: {
    not_sending: 'This message is no longer sending. The page now shows it as it is.',
    not_found: GONE,
    manager_only: MANAGER,
    not_allowed: MANAGER,
    network: 'No connection: it may still be sending. Try again.',
    unknown: 'It could not be stopped. Please try again.',
  },
  duplicate: {
    not_found: GONE,
    manager_only: MANAGER,
    not_allowed: MANAGER,
    feature_locked: PLAN,
    network: 'No connection: no copy was made. Try again.',
    unknown: 'The copy could not be made. Please try again.',
  },
  remove: {
    not_a_draft: 'Only a draft can be deleted. The page now shows it as it is.',
    not_found: GONE,
    manager_only: MANAGER,
    not_allowed: MANAGER,
    network: 'No connection: nothing was deleted. Try again.',
    unknown: 'The draft could not be deleted. Please try again.',
  },
  // Release 4: send later.
  schedule: {
    already_started: 'This message was already started. The page now shows how far it got.',
    changed: 'The message changed since this page showed it. Check it, then schedule it again.',
    bad_time: 'Choose another time.',
    incomplete: 'The message is not ready to send. The page now shows what it still needs.',
    no_audience: 'Choose who receives it first.',
    no_category: 'Choose what kind of message it is first.',
    bad_rule: 'Its segment has a rule that cannot be used. Fix the segment first.',
    not_found: GONE,
    manager_only: MANAGER,
    not_allowed: MANAGER,
    feature_locked: PLAN,
    network: 'No connection. Reload the page to see whether it was scheduled before you try again.',
    unknown: 'It may not have been scheduled. Reload the page to see its state before you try again.',
  },
  unschedule: {
    not_scheduled: 'It is no longer waiting: it started, or was taken back already. The page now shows it as it is.',
    not_found: GONE,
    manager_only: MANAGER,
    not_allowed: MANAGER,
    network: 'No connection: it is still scheduled. Try again.',
    unknown: 'It could not be taken back. Please try again.',
  },
}
