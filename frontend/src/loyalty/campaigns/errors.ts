/**
 * Campaigns' own words for each refusal, by where it happened, under loyalty.campaigns.<family>.error.<code> (read with
 * lib/errors.ts `refusalKey('loyalty.campaigns', ERRORS, family, failure)`). A missing right is the controller's
 * `manager_only` or, in the server's enforce mode, the access middleware's `not_allowed`: both read as the manager's
 * right. `feature_locked` is the plan's (the campaigns routes need it). `invalid` is Laravel's field answer, whose
 * fields the form marks in its own words. Where a press may have reached the server before the connection dropped
 * (Send, Cancel), the words say to look before pressing again.
 */
const MANAGER = 'Only an owner or a manager can work with campaigns.'
const PLAN = 'Your plan does not include email campaigns.'
const OFFLINE = 'No connection: nothing was saved. Try again.'
const MARKED = 'Check the fields marked below.'
const GONE = 'This campaign no longer exists.'

export const ERRORS: Record<string, Record<string, string>> = {
  load: {
    not_found: GONE,
    manager_only: MANAGER,
    not_allowed: MANAGER,
    feature_locked: PLAN,
    network: 'No connection. Check the network and try again.',
    unknown: 'This could not be loaded. Please try again.',
  },
  segment: {
    manager_only: MANAGER,
    not_allowed: MANAGER,
    not_found: 'This segment no longer exists. The list now shows the segments as they are.',
    invalid: MARKED,
    bad_rule: 'A rule cannot be used. It is marked above.',
    network: OFFLINE,
    unknown: 'The segment could not be saved. Please try again.',
  },
  remove_segment: {
    in_use: 'These campaigns still use this segment: {{names}}. It can be deleted once none of them is a draft or sending.',
    manager_only: MANAGER,
    not_allowed: MANAGER,
    not_found: 'This segment no longer exists. The list now shows the segments as they are.',
    network: 'No connection: nothing was deleted. Try again.',
    unknown: 'The segment could not be deleted. Please try again.',
  },
  count: {
    bad_rule: 'Fix the rule marked above to see who matches.',
    manager_only: MANAGER,
    not_allowed: MANAGER,
    network: 'No connection: the count could not be updated.',
    unknown: 'The count could not be updated.',
  },
  create: {
    manager_only: MANAGER,
    not_allowed: MANAGER,
    feature_locked: PLAN,
    network: 'No connection: no campaign was made. Try again.',
    unknown: 'The campaign could not be made. Please try again.',
  },
  save: {
    not_a_draft: 'This campaign is no longer a draft: it was sent meanwhile. The page now shows it as it is.',
    not_editable_here: 'This campaign is edited in the full admin.',
    not_found: GONE,
    invalid: MARKED,
    manager_only: MANAGER,
    not_allowed: MANAGER,
    feature_locked: PLAN,
    network: OFFLINE,
    unknown: 'The draft could not be saved. Please try again.',
  },
  test: {
    incomplete: 'Write a subject and something in the email before testing it.',
    no_email: 'Your account has no email address to send the test to.',
    suppressed: 'Your address bounced or complained before, so it is never emailed and the test cannot reach you.',
    test_failed: 'The test could not be sent. Please try again later.',
    not_found: GONE,
    manager_only: MANAGER,
    not_allowed: MANAGER,
    network: 'No connection: the test was not sent. Try again.',
    unknown: 'The test could not be sent. Please try again.',
  },
  audience: {
    no_audience: 'Choose who receives it first.',
    bad_rule: 'Its segment has a rule that cannot be used. Fix the segment first.',
    not_found: GONE,
    manager_only: MANAGER,
    not_allowed: MANAGER,
    network: 'No connection: who it would reach could not be counted.',
    unknown: 'Who it would reach could not be counted. Please try again.',
  },
  send: {
    already_started: 'This campaign was already started. The page now shows how far it got.',
    changed: 'The campaign changed since this page showed it. Check it, then send again.',
    audience_changed: 'The number of members it would reach is now {{reached}}. Check the number, then send again.',
    incomplete: 'The campaign is not ready to send. The page now shows what it still needs.',
    no_audience: 'Choose who receives it first.',
    bad_rule: 'Its segment has a rule that cannot be used. Fix the segment first.',
    nobody_to_send_to: 'Nobody in this segment can receive it.',
    too_many: 'It would reach more than {{limit}} members, the most one campaign may. Narrow the segment.',
    not_editable_here: 'This campaign is sent from the full admin.',
    not_started: 'The campaign could not be queued. Nothing was sent; please try again.',
    not_found: GONE,
    manager_only: MANAGER,
    not_allowed: MANAGER,
    feature_locked: PLAN,
    network: 'No connection. Reload the page to see whether it started before you press Send again.',
    unknown: 'It may not have started. Reload the page to see its state before you press Send again.',
  },
  cancel: {
    not_sending: 'This campaign is no longer sending. The page now shows it as it is.',
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
}
