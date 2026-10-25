/**
 * The desk's own words for each refusal, under loyalty.visits.<family>.error.<code> (read with lib/errors.ts
 * `refusalKey('loyalty.visits', ERRORS, family, failure)`). The codes are DeskVisit's (`option_off`, `desk_earn_off`,
 * `amount_required`, `inactive`), the controller's missing right (`not_allowed`, or the access middleware's
 * `no_capability`) and Laravel's field answer (`invalid`). The server's sentence is never shown.
 */
const AWARD_RIGHT = 'Your account may not award points. A manager can allow it under Team in the full admin.'
const OFFLINE = 'No connection: nothing was saved. Try again.'

export const ERRORS: Record<string, Record<string, string>> = {
  load: {
    not_found: 'This member is not in your programme any more.',
    network: 'No connection. Check the network and try again.',
    unknown: 'The stamp card could not be loaded. Please try again.',
  },
  desk: {
    option_off: 'Check-in and earning at the desk are switched off. A manager can switch them on under Ways to earn.',
    desk_earn_off: 'Earning at the desk is switched off. A manager can switch it on under Ways to earn.',
    amount_required: 'Enter the amount of the purchase.',
    inactive: 'This member’s account is switched off.',
    not_allowed: AWARD_RIGHT,
    no_capability: AWARD_RIGHT,
    invalid: 'Check the amount: above 0, at most 1,000,000, in your currency’s units.',
    not_found: 'This member is not in your programme any more.',
    network: OFFLINE,
    unknown: 'That did not work. Nothing was saved; please try again.',
  },
}
