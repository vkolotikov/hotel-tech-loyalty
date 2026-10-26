/**
 * Program's own words for each refusal, by where it happened, under loyalty.program.<family>.error.<code>
 * (read with lib/errors.ts `refusalKey('loyalty.program', ERRORS, family, failure)`). A manager's right is checked by
 * the controller (`manager_only`) and, in the server's enforce mode, by the access middleware first (`not_allowed`,
 * `no_capability`): all three read as the same missing right. `invalid` is Laravel's field answer, whose fields the
 * form marks in its own words (programMath.ts `serverProblems`).
 */
const RIGHT = 'Only an owner or a manager can change the programme.'
const OFFLINE = 'No connection: nothing was saved. Try again.'
const MARKED = 'Check the fields marked below.'

export const ERRORS: Record<string, Record<string, string>> = {
  load: {
    network: 'No connection. Check the network and try again.',
    unknown: 'The programme could not be loaded. Please try again.',
  },
  tier: {
    manager_only: RIGHT,
    not_allowed: RIGHT,
    no_capability: RIGHT,
    not_found: 'This tier is no longer in the programme. The page now shows it as it is.',
    invalid: MARKED,
    network: OFFLINE,
    unknown: 'The tier could not be saved. Please try again.',
  },
  benefit: {
    manager_only: RIGHT,
    not_allowed: RIGHT,
    no_capability: RIGHT,
    not_found: 'This benefit is no longer in the catalogue. The page now shows it as it is.',
    invalid: MARKED,
    network: OFFLINE,
    unknown: 'The benefit could not be saved. Please try again.',
  },
  tier_benefit: {
    manager_only: RIGHT,
    not_allowed: RIGHT,
    no_capability: RIGHT,
    not_found: 'This tier or benefit is no longer in the programme. The page now shows it as it is.',
    invalid: MARKED,
    network: OFFLINE,
    unknown: 'That did not work. Nothing was changed; please try again.',
  },
  boost: {
    manager_only: RIGHT,
    not_allowed: RIGHT,
    no_capability: RIGHT,
    not_found: 'This boost no longer exists. The page now shows the programme as it is.',
    invalid: MARKED,
    network: OFFLINE,
    unknown: 'The boost could not be saved. Please try again.',
  },
  // Release 11: deleting a tier (TierRemoval) or a benefit.
  remove_tier: {
    manager_only: RIGHT,
    not_allowed: RIGHT,
    no_capability: RIGHT,
    not_found: 'This tier is no longer in the programme. The page now shows it as it is.',
    last_tier: 'This is the last tier switched on. Members need a tier, so it cannot be deleted.',
    move_to_required: 'Choose the tier its members move to.',
    move_to_unknown: 'That tier is no longer one to move members to. Choose another one.',
    network: 'No connection: nothing was deleted. Try again.',
    unknown: 'The tier could not be deleted. Nothing was changed; please try again.',
  },
  remove_benefit: {
    manager_only: RIGHT,
    not_allowed: RIGHT,
    no_capability: RIGHT,
    not_found: 'This benefit is no longer in the catalogue. The page now shows it as it is.',
    network: 'No connection: nothing was deleted. Try again.',
    unknown: 'The benefit could not be deleted. Nothing was changed; please try again.',
  },
  // Release 6: "These times are right" for the boosts that ask for their times to be checked.
  times: {
    manager_only: RIGHT,
    not_allowed: RIGHT,
    no_capability: RIGHT,
    not_found: 'One of these boosts is no longer in the programme. The page now shows it as it is; nothing was confirmed.',
    invalid: 'One of these boosts is no longer in the programme. The page now shows it as it is; nothing was confirmed.',
    network: 'No connection: nothing was confirmed. Try again.',
    unknown: 'The times could not be confirmed. Please try again.',
  },
}
