/**
 * Cashback credit's own words for each refusal, by where it happened, under loyalty.credit.<family>.error.<code> (read
 * with lib/errors.ts `refusalKey('loyalty.credit', ERRORS, family, failure)`). The server's CreditLedger decides;
 * `credit_short` carries the balance under its lock, so the sentence names it. A right is checked by the controller
 * (`not_allowed`, `manager_only`) and, in the server's enforce mode, by the access middleware first (`no_capability`):
 * all read as the same missing right. The server's sentence is never shown.
 */
const OFFLINE = 'No connection: nothing was saved. Try again.'
const GONE = 'This member is not in your programme any more.'
const ERASED = 'This member was deleted; their credit was forfeited.'
const NO_RIGHT = 'Your account may not do this. A manager can change that under Team in the full admin.'
const MANAGERS = 'Only an owner or a manager can correct credit.'
const BAD_AMOUNT = 'Type an amount the venue’s currency can hold, above zero.'
const BAD_CORRECTION = 'Type an amount the venue’s currency can hold, other than zero.'
const BAD_CURRENCY = 'The venue’s currency is not set. A manager can set it under Card & app.'
const KEY_REUSED = 'This press was already used for something else. Close the dialog and try again.'

export const ERRORS: Record<string, Record<string, string>> = {
  load: {
    not_found: GONE,
    network: 'No connection. Check the network and try again.',
    unknown: 'The credit could not be loaded. Please try again.',
  },
  use: {
    credit_short: 'The member has only {{balance}} in credit.',
    bad_amount: BAD_AMOUNT,
    bad_currency: BAD_CURRENCY,
    already_erased: ERASED,
    key_reused: KEY_REUSED,
    not_allowed: NO_RIGHT,
    no_capability: NO_RIGHT,
    invalid: 'Check the amount.',
    not_found: GONE,
    network: OFFLINE,
    unknown: 'The credit could not be used. Nothing was taken off; please try again.',
  },
  adjust: {
    credit_short: 'Credit cannot go below zero: the member has {{balance}}.',
    bad_amount: BAD_CORRECTION,
    bad_currency: BAD_CURRENCY,
    reason_required: 'Say why the credit is corrected.',
    already_erased: ERASED,
    key_reused: KEY_REUSED,
    manager_only: MANAGERS,
    not_allowed: MANAGERS,
    no_capability: MANAGERS,
    invalid: 'Check the amount and the reason.',
    not_found: GONE,
    network: OFFLINE,
    unknown: 'The credit could not be corrected. Nothing was changed; please try again.',
  },
}
