/**
 * "Ways to earn"'s own words for each refusal, by where it happened, under loyalty.options.<family>.error.<code> (read
 * with lib/errors.ts `refusalKey('loyalty.options', ERRORS, family, failure)`). A manager's right is checked by the
 * controller (`manager_only`) and, in the server's enforce mode, by the access middleware first (`not_allowed`,
 * `no_capability`): all three read as the same missing right. `invalid` is Laravel's field answer, whose fields the
 * card marks in its own words (optionsMath.ts `serverProblems`).
 */
const RIGHT = 'Only an owner or a manager can change the programme.'
const OFFLINE = 'No connection: nothing was saved. Try again.'

export const ERRORS: Record<string, Record<string, string>> = {
  load: {
    network: 'No connection. Check the network and try again.',
    unknown: 'The programme’s options could not be loaded. Please try again.',
  },
  save: {
    manager_only: RIGHT,
    not_allowed: RIGHT,
    no_capability: RIGHT,
    invalid: 'Check the fields marked below.',
    network: OFFLINE,
    unknown: 'This could not be saved. Please try again.',
  },
  setup: {
    manager_only: RIGHT,
    not_allowed: RIGHT,
    no_capability: RIGHT,
    invalid: 'Some choices need another look. Check the steps marked and apply again.',
    key_reused: 'This setup changed after it was sent. Apply it again.',
    network: 'No connection: the setup was not applied. Try again; nothing is applied twice.',
    unknown: 'The setup could not be applied. Please try again.',
  },
  skip: {
    manager_only: RIGHT,
    not_allowed: RIGHT,
    no_capability: RIGHT,
    network: 'No connection. Try again.',
    unknown: 'That did not work. Please try again.',
  },
}
