/**
 * The Events area's own words for each refusal, under loyalty.events.<family>.error.<code> (read with lib/errors.ts
 * `refusalKey('loyalty.events', ERRORS, family, failure)`). The codes are the Events services' (EventEditor,
 * EventSignUp, EventCheckIn), the controller's missing right (`not_allowed`, or the access middleware's
 * `no_capability`) and Laravel's field answer (`invalid`). The server's sentence is never shown.
 */
const CHANGE_RIGHT = 'Your account may not change events. A manager can allow “Manage offers” under Team in the full admin.'
const OFFLINE = 'No connection: nothing was saved. Try again.'

export const ERRORS: Record<string, Record<string, string>> = {
  load: {
    not_found: 'This event is not in your programme any more.',
    network: 'No connection. Check the network and try again.',
    unknown: 'The events could not be loaded. Please try again.',
  },
  save: {
    invalid: 'Check the fields marked below.',
    event_ended: 'This event has already ended. Change its times to publish it, or save it as a draft.',
    wrong_state: 'This event was cancelled: it cannot be changed any more.',
    key_reused: 'This was already saved with other details. Close the dialog and try again.',
    not_allowed: CHANGE_RIGHT,
    no_capability: CHANGE_RIGHT,
    not_found: 'This event is not in your programme any more.',
    network: OFFLINE,
    unknown: 'The event could not be saved. Please try again.',
  },
  life: {
    event_ended: 'This event has already ended.',
    wrong_state: 'Someone changed this event meanwhile. The page now shows it as it is.',
    not_a_draft: 'Only a draft can be deleted. Cancel a published event instead.',
    not_allowed: CHANGE_RIGHT,
    no_capability: CHANGE_RIGHT,
    not_found: 'This event is not in your programme any more.',
    network: OFFLINE,
    unknown: 'That did not work. Nothing was changed; please try again.',
  },
  people: {
    sign_up_closed: 'This event does not take sign-ups now.',
    event_full: 'The event is full.',
    tier_not_allowed: 'This event is for other tiers.',
    membership_expired: 'This member’s membership ends before the event.',
    inactive: 'This member’s account is switched off.',
    already_signed_up: 'This member is already signed up.',
    already_in: 'This member has already checked in.',
    not_signed_up: 'This member is not signed up.',
    cancel_closed: 'This event has ended.',
    invalid: 'Choose one of your members.',
    not_found: 'This member or event is not in your programme any more.',
    network: OFFLINE,
    unknown: 'That did not work. Nothing was changed; please try again.',
  },
  check_in: {
    invalid: 'Choose one of your members.',
    not_found: 'This member or event is not in your programme any more.',
    network: OFFLINE,
    unknown: 'The check-in did not go through. Please try again.',
  },
}
