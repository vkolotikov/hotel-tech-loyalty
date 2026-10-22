/**
 * SMS campaigns' words whose keys the code builds at run time (`loyalty.sms.<family>.<value>`), with their English
 * fallbacks; i18n/loyaltyLocales.test.ts checks every family in all five sms.<lang>.json bundles. The server sends the
 * values (a campaign's status, the reasons it gives, how each member's SMS went, Twilio's error codes); the workspace
 * names them. A value without a word here is shown as sent, or in a general sentence.
 */

/** A campaign's status (SmsMessage::STATUS_*). */
export const STATUS_WORDS: Record<string, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  sending: 'Sending',
  sent: 'Sent',
  failed: 'Failed',
  cancelled: 'Cancelled',
}

/** Why a member of the segment will not get it (SmsAudience's buckets). */
export const NOT_REACHED_WORDS: Record<string, string> = {
  no_consent: '{{number}} have not turned on offers by SMS',
  no_phone: '{{number}} have no phone number',
  bad_phone: '{{number}} have a number without its country code (it must start with + and the country code)',
  same_phone: '{{number}} share a number with another member it reaches, who gets the one SMS',
}

/** Why Send cannot be pressed yet (smsMath.ts `sendBlockers`). */
export const BLOCKER_WORDS: Record<string, string> = {
  twilio: 'Set up the venue’s Twilio account first.',
  unsaved: 'Save your changes first.',
  body: 'Write the text.',
  no_segment: 'Choose who receives it.',
  segment_gone: 'Its segment no longer exists. Choose another.',
  segment_problem: 'Its segment has a rule that cannot be used. Fix the segment first.',
}

/** What stops the draft from being saved (smsMath.ts `draftProblems`, `serverProblems`). */
export const PROBLEM_WORDS: Record<string, string> = {
  name: 'Give the campaign a name, up to {{max}} characters.',
  body_long: 'Keep the text to {{max}} characters.',
  segment_gone: 'That segment no longer exists. Choose another.',
}

/** The Twilio settings, as Settings → Integrations names them. */
export const SETTING_WORDS: Record<string, string> = {
  account_sid: 'Twilio Account SID',
  auth_token: 'Twilio Auth Token',
  phone_number: 'Twilio Phone Number',
}

/** What is wrong with a setting (smsMath.ts `twilioSteps`). */
export const SETTING_STATE_WORDS: Record<string, string> = {
  missing: '{{setting}}: not set yet',
  wrong: '{{setting}}: not in a form Twilio takes',
}

/** The alphabet a text is sent in (SmsText). */
export const ENCODING_WORDS: Record<string, string> = {
  gsm7: 'Standard SMS alphabet',
  ucs2: 'Unicode',
}

/** How each member's SMS went (sms_campaign_deliveries.status). */
export const OUTCOME_WORDS: Record<string, string> = {
  sent: 'Sent',
  failed: 'Not sent',
  skipped: 'Passed over',
  pending: 'Under way',
}

/** What each outcome means, under its number. */
export const OUTCOME_HINT_WORDS: Record<string, string> = {
  sent: 'Twilio took the SMS. Delivery to the phone is the network’s.',
  failed: 'Twilio refused the SMS for that number, or could not be reached. The reasons are below.',
  skipped: 'They turned SMS off, lost their number or were switched off after it started.',
  pending: 'They were being sent to when sending stopped. They are not sent to again.',
}

/** Twilio's error codes the workspace explains (a member's SMS, a test, or the account itself). */
export const TWILIO_WORDS: Record<string, string> = {
  20003: 'Twilio refused the Account SID or the Auth Token. Check them in Settings → Integrations.',
  20005: 'The Twilio account is not active. Check it in Twilio.',
  21211: 'The number is not a valid phone number.',
  21408: 'Sending to this country is not switched on in Twilio (Messaging, Geo permissions).',
  21606: 'The venue’s Twilio number cannot send SMS. Check the number in Twilio.',
  21608: 'A Twilio trial account sends only to numbers verified in Twilio.',
  21610: 'The number replied STOP to the venue’s Twilio number. Their SMS consent is now off.',
  21612: 'Twilio cannot send from the venue’s number to this number.',
  21614: 'The number cannot receive SMS (it is not a mobile number).',
  21617: 'The text is too long for one message.',
}

/** Why a failure happened, when it is not one of Twilio's codes. */
export const FAILURE_WORDS: Record<string, string> = {
  unreachable: 'Twilio could not be reached.',
  not_ready: 'The venue’s Twilio account is not set up.',
  job_failed: 'Sending stopped after repeated errors.',
  other: 'Twilio refused it ({{reason}}).',
}

/** The families above by the key prefix they are read under. */
export const WORD_FAMILIES: Record<string, Record<string, string>> = {
  status: STATUS_WORDS,
  not_reached: NOT_REACHED_WORDS,
  blocker: BLOCKER_WORDS,
  problem: PROBLEM_WORDS,
  setting: SETTING_WORDS,
  setting_state: SETTING_STATE_WORDS,
  encoding: ENCODING_WORDS,
  outcome: OUTCOME_WORDS,
  outcome_hint: OUTCOME_HINT_WORDS,
  twilio: TWILIO_WORDS,
  failure: FAILURE_WORDS,
}
