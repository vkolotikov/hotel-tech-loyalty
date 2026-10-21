/**
 * Rewards' own words for each refusal, by where it happened, under loyalty.rewards.<family>.error.<code>
 * (read with lib/errors.ts `refusalKey('loyalty.rewards', ERRORS, family, failure)`). A missing right is the
 * controller's `not_allowed` (with `need`) or, in the server's enforce mode, the access middleware's `not_allowed` /
 * `no_capability`: all read as the same missing right. `invalid` is Laravel's field answer, whose fields the form
 * marks in its own words.
 */
const OFFERS_RIGHT = 'Your account may not change rewards or offers. A manager can allow it under Team in the full admin.'
const REDEEM_RIGHT = 'Your account may not handle redemptions. A manager can allow it under Team in the full admin.'
const OFFLINE = 'No connection: nothing was saved. Try again.'
const MARKED = 'Check the fields marked below.'

export const ERRORS: Record<string, Record<string, string>> = {
  load: {
    network: 'No connection. Check the network and try again.',
    unknown: 'This could not be loaded. Please try again.',
  },
  reward: {
    not_allowed: OFFERS_RIGHT,
    no_capability: OFFERS_RIGHT,
    not_found: 'This reward is no longer in the catalogue. The list now shows it as it is.',
    invalid: MARKED,
    network: OFFLINE,
    unknown: 'The reward could not be saved. Please try again.',
  },
  offer: {
    not_allowed: OFFERS_RIGHT,
    no_capability: OFFERS_RIGHT,
    not_found: 'This offer no longer exists. The list now shows the offers as they are.',
    invalid: MARKED,
    network: OFFLINE,
    unknown: 'The offer could not be saved. Please try again.',
  },
  redemption: {
    not_allowed: REDEEM_RIGHT,
    no_capability: REDEEM_RIGHT,
    wrong_state: 'Someone else already handled this redemption. The list now shows it as it is.',
    not_found: 'This redemption no longer exists. The list now shows it as it is.',
    network: OFFLINE,
    unknown: 'That did not work. Nothing was changed; please try again.',
  },
}
