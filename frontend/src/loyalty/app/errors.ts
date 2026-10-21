/**
 * Card & app's own words for each refusal, by where it happened, under loyalty.app.<family>.error.<code> (read with
 * lib/errors.ts `refusalKey('loyalty.app', ERRORS, family, failure)`). The page is a manager's: the controllers say
 * `manager_only`, the access middleware in enforce mode `not_allowed` / `no_capability`; a plan without wallet passes
 * is the feature gate's `feature_locked`. `invalid` is Laravel's field answer, whose fields the form marks in its own
 * words; for an upload it means the file was missing or too large.
 */
const MANAGER = 'Only an owner or a manager can change the card and the app.'
const NO_WALLET = 'Your plan does not include wallet passes.'
const OFFLINE = 'No connection: nothing was saved. Try again.'

export const ERRORS: Record<string, Record<string, string>> = {
  load: {
    manager_only: MANAGER,
    not_allowed: MANAGER,
    no_capability: MANAGER,
    feature_locked: NO_WALLET,
    network: 'No connection. Check the network and try again.',
    unknown: 'This could not be loaded. Please try again.',
  },
  wallet: {
    manager_only: MANAGER,
    not_allowed: MANAGER,
    no_capability: MANAGER,
    feature_locked: NO_WALLET,
    invalid: 'Check the fields marked below.',
    network: OFFLINE,
    unknown: 'The wallet pass could not be saved. Please try again.',
  },
  upload: {
    manager_only: MANAGER,
    not_allowed: MANAGER,
    no_capability: MANAGER,
    feature_locked: NO_WALLET,
    not_pkcs12: 'This is not a .p12 certificate. Export the Pass Type ID certificate from your Apple Developer account as .p12.',
    cert_unreadable: 'The certificate does not open with this password. Check the password; if it is right, export the certificate again.',
    not_certificate: 'This is not a certificate. Use Apple’s WWDR certificate, as .cer or .pem.',
    not_json: 'This is not a JSON file. Use the key file Google gave you for the service account.',
    not_service_account: 'This JSON is not a service account key: it needs the account’s email and private key.',
    invalid: 'Choose the file again; it can be up to 200 KB.',
    network: 'No connection: nothing was uploaded. Try again.',
    unknown: 'The file could not be uploaded. Please try again.',
  },
  look: {
    manager_only: MANAGER,
    not_allowed: MANAGER,
    no_capability: MANAGER,
    invalid: 'Check the fields marked below.',
    network: OFFLINE,
    unknown: 'The look could not be saved. Please try again.',
  },
  logo: {
    manager_only: MANAGER,
    not_allowed: MANAGER,
    no_capability: MANAGER,
    invalid: 'Use a JPEG, PNG or WebP picture up to {{mb}} MB and {{edge}} pixels on its longest side.',
    network: 'No connection: nothing was uploaded. Try again.',
    unknown: 'The logo could not be uploaded. Please try again.',
  },
}
