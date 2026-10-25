/**
 * Places' own words for each refusal, by where it happened, under loyalty.places.<family>.error.<code> (read with
 * lib/errors.ts `refusalKey('loyalty.places', ERRORS, family, failure)`). A manager's right is checked by the controller
 * (`manager_only`) and, in the server's enforce mode, by the access middleware first (`not_allowed`, `no_capability`):
 * all three read as the same missing right. `invalid` is Laravel's field answer, whose fields the dialog marks in its
 * own words (placesMath.ts `serverPlaceProblems`).
 */
const RIGHT = 'Only an owner or a manager can change places.'
const OFFLINE = 'No connection: nothing was saved. Try again.'

export const ERRORS: Record<string, Record<string, string>> = {
  load: {
    network: 'No connection. Check the network and try again.',
    unknown: 'The places could not be loaded. Please try again.',
  },
  place: {
    manager_only: RIGHT,
    not_allowed: RIGHT,
    no_capability: RIGHT,
    name_taken: 'Another place already has this name. Choose another.',
    key_reused: 'This was already sent with other details. Close the dialog and open it again.',
    not_found: 'This place is no longer there. The list now shows the places as they are.',
    invalid: 'Check the fields marked below.',
    network: OFFLINE,
    unknown: 'The place could not be saved. Please try again.',
  },
  remove: {
    manager_only: RIGHT,
    not_allowed: RIGHT,
    no_capability: RIGHT,
    not_found: 'This place is no longer there. The list now shows the places as they are.',
    network: 'No connection: nothing was removed. Try again.',
    unknown: 'The place could not be removed. Please try again.',
  },
  entries: {
    not_found: 'This place is no longer there.',
    invalid: 'Choose a day.',
    network: 'No connection. Check the network and try again.',
    unknown: 'The entries could not be loaded. Please try again.',
  },
}
