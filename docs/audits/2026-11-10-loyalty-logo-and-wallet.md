# Loyalty logo setup and Wallet account inspection — 10 November 2026

Owner: restore the impossible logo setup step, then inspect and configure the Wallet accounts through the signed-in
browser on the owner's PC. Existing credentials must stay private.

## Logo setup

Root cause: putting the disconnected app designers on hold also hid LookTab's working logo uploader. SetupProgress
still required company_logo and the checklist opened the old app tab, so that step had no usable action.

LogoPanel now exposes the existing uploader on the main Card & app page and the setup bookmark ?tab=app. The former
LookTab uses the same extracted LogoField. The app designers retain their On hold status. Uploads use the existing
multipart app-look/logo endpoint, manager gate, validation, media ownership and AppLook::setLogo writer. No API
contract, schema or provider credential changes. The uploader is available without the wallet plan feature.

Successful upload updates the saved image, invalidates the setup checklist and scoped Overview summary, and offers
Back to setup. Invalid files preserve the stored logo. Copy is translated in all five app bundles.

Regression coverage: the new AppPage test failed against the old hidden uploader before the fix. TypeScript, all
6,834 frontend tests, lint regression gate (1,383 existing diagnostics) and the ten AppLook/Start PHP tests passed.
The compiled real-backend journey is frontend/e2e/loyalty-logo.mjs, using the existing isolated PostgreSQL rehearsal
and private fixture. It checks image HTTP delivery/decoding as well as saved state and checklist completion.

The image check exposed a rehearsal-only setup error: SESSION_DRIVER=database named a sessions table this app does
not have. The helper now stores web sessions in its isolated storage directory with the file driver. Database cache
and queue stay as before. The production session configuration is unchanged.

Final artifact, live release and image acceptance evidence are recorded in the 10 November handoff: production
1d1e2fa6f / Cloud 1158, feature source baseline d3631e622. All 17 compiled browser checks passed, including image
delivery and decoding. Public content/access checks and the signed-in Russian uploader were verified live on the
owner's PC. The existing saved logo displayed correctly; production branding was not changed during verification.

## Wallet observations on the owner's PC

The normal Chrome session was inspected with the computer-use skill. The owner handled authentication. Earlier
attempts against a blank/occluded browser window failed URL verification; opening the actual Console page resolved
that issue. An initial Staff login could not read Wallet settings; the owner then signed into the owner account.

Google Pay & Wallet Console, FDS Cards LTD:

- Issuer 3388000000023129907 exists, with loyalty class hexatech_fds_cards_uk_loyalty marked Active.
- Publishing request: In review; issuer remains in Demo mode. Onboarding checklist is 3/3 complete. The Console
  states production publication must wait for approval. An Active class does not establish publishing access.
- The existing fds-cards-wallet service account has Developer access. There are no separately listed test accounts.

Apple Developer, FDS Cards ltd:

- Active organisation membership; team HNWSAQ5CQ9; renewal 30 April 2027.
- Registered Pass Type ID pass.co.uk.fds-cards.digitalcard matches the portal.
- Existing FDScards wallet certificate is a Pass Type ID certificate, expiring 29 September 2027.

The signed-in portal labels the organisation Kolotikovs and holds the matching FDS Cards settings: Apple identifiers,
Google issuer/class and all three uploaded files (Apple p12, WWDR, Google service-account JSON). Its readiness lists
only switched_off for each provider. A blank saved certificate-password flag is not an error by itself; this check
found no certificate_password refusal. Private key, password and JSON contents were not opened or printed.

Wallet issuance remains switched off. Provider-console metadata and uploaded files are not physical acceptance.
Apple still needs controlled iPhone add/update/deactivate/QR validation; Google needs publishing approval and the
Android acceptance journey. No certificate/key was replaced, no new account/permission was created, no customer
pass was issued, and no support message was sent during this inspection. Automatic shared-issuer onboarding across
other organisations is not implemented by the logo fix.
