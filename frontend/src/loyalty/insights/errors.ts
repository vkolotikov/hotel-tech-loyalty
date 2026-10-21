/**
 * Insights' own words for each refusal, under loyalty.insights.<family>.error.<code> (read with lib/errors.ts
 * `refusalKey('loyalty.insights', ERRORS, family, failure)`). The server's own check says `not_allowed`; the access map,
 * once enforced, says `no_capability`: both are the same missing right. `invalid` is a period or a number of days the
 * server does not take, which the page never sends.
 */
const RIGHT = 'Insights are for owners, managers and staff who may see analytics. A manager can change that under Team in the full admin.'
const OFFLINE = 'No connection. Check the network and try again.'

export const ERRORS: Record<string, Record<string, string>> = {
  load: {
    not_allowed: RIGHT,
    no_capability: RIGHT,
    invalid: 'This period cannot be shown. Choose another one.',
    network: OFFLINE,
    unknown: 'Insights could not be loaded. Please try again.',
  },
  at_risk: {
    not_allowed: RIGHT,
    no_capability: RIGHT,
    invalid: 'Choose from 7 to 365 days.',
    network: OFFLINE,
    unknown: 'The list could not be loaded. Please try again.',
  },
}
