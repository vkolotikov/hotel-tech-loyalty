# Launch operations follow-up — 29 October 2026

Owner's scope: mobile web and PC now; native apps later. Email campaigns are a priority; payments and SMS
are deferred acceptance items, with existing functionality preserved. Wallets are optional pending provider setup.
ACR122U is a candidate reader, not a verified browser-compatible device. Operational failures should appear
inside the application rather than generating notification emails.

## Implemented

`/system-status`, under Full admin → System, with a manager link from Loyalty → Settings. Five languages,
desktop/mobile layout, manual refresh and 60-second polling while open. A 15-second request timeout and visible
retry state prevent a failed refresh from displaying old green results as current observations.

The read-only API counts only the caller's organisation's email campaigns with failures in the last 30 days,
campaigns without progress for 15 minutes, and visit/reversal work pending for 15 minutes. A verified platform
operator additionally sees scheduler heartbeat age, unresolved scheduled-command failures, failed queue entries,
and unreserved database jobs available for over five minutes. A skipped command does not clear its prior failure.
An empty queue does not prove worker liveness. Missing checks are unavailable, never healthy. Redis/SQS queue
backlog observation is not implemented; those drivers show unverified rather than a fabricated zero.

No job payloads, recipient data, provider exceptions, credentials or other tenants' records enter the response.
Organisation ownership alone does not grant platform visibility. There are no retry writers, customer messages,
or alert emails in this feature. Existing safe recovery processes remain the writers. This view is not an
independent outage monitor and cannot report while the application is unavailable.

USB reader help now explicitly distinguishes compatible HID devices from ACR122U's PC/SC transport. No claim of
physical-reader acceptance or a shipped desktop connector is made.

## Sender addresses

Verified in source: `MailIdentityService` already uses the business name and a configured Reply-To, falling back
to `organizations.email`. The From address stays on the platform's sending domain. A registered tenant email does
not authenticate its domain for sending. Per-customer authenticated From domains remain a separate integration.
See `docs/EMAIL_DELIVERABILITY.md`; its August DNS evidence is historical, not a fresh production verification.

## Verification and release

Local scoped PHP checks: **69 passed / 3,116 assertions**, including tenant isolation, manager/member access,
operator provenance, scheduler recovery, delayed jobs and unavailable-check behavior. TypeScript passes;
frontend **5,766 tests / 399 files** pass. The lint regression gate retains its 1,393 legacy diagnostics.
Local Chrome fixtures cover seven checks, refresh/failure/retry, destinations and six viewport/language views;
desktop 1440 and mobile 320 screenshots were visually inspected, with no horizontal overflow or runtime errors.
The isolated deployment artifact also passes **69 PHP tests / 3,116 assertions**, **5,766 frontend tests**,
TypeScript and a fresh Vite/postbuild. Its first cold frontend run timed out at 5 seconds in the existing
filesystem-wide `fixedInBlur` scan; the full rerun with a 30-second execution allowance passed without changing
an assertion or source rule. Built Chrome repeats the status-page checks and passes **130 existing Settings/Scan
checks**, with no runtime errors. The built 1440 screenshot was visually inspected; its pixels match the source
render. Existing build warnings about external kit fonts, CSS import order and large chunks remain.
Production **9945e24bf0691735cb312e6f2ebe6826d2467f98** is live, content verified at **2026-10-29 13:53:46 UTC**
(15:53 Europe/Riga). Next source-patch baseline: **48b9efce7b02a96e8e05d47693ffce327eae0712**.
The 34-path allowlist and whole application source passed parity before deployment. Live entry is
`index-CDjfqwMZ.js`; `SystemStatus-HdTYnJgv.js` contains the endpoint and new copy;
`LoyaltyApp-D-Z9VC46.js` contains the reader guidance. The API refuses unauthenticated access with 401;
health is 200, the public landing kit remains unchanged, and retired CSS remains 404.
See `2026-10-29-launch-operations-evidence/live-verification.json`. Authenticated production observations
remain unverified because the owner's existing browser session is unavailable to the connected tools.

## External acceptance still open

- Existing Chrome session could not be accessed: both browser tools exposed only an empty automation tab;
  the computer-use runtime failed with `failed to write kernel assets ... (os error 3)` even after a reset.
  Laravel Cloud backup retention, restore rehearsal, production worker/scheduler/shared-cache configuration,
  uploaded-file backups and SiteGround sender/DNS state remain unverified. No changes were made in either service.
- Follow-up: owner designated `info@fds-cards.co.uk`; one local SMTP test was accepted at 15:13:21 UTC.
  The owner confirmed inbox receipt. The production campaign/worker path remains unverified. See
  `2026-10-29-wallet-email-preflight.md`; no customer broadcast was sent.
- Need physical ACR122U/card type and OS testing; native PC/SC requires a trusted desktop connector.
  The workstation currently reports no connected SmartCardReader/ACR122/NFC/contactless device.
- Follow-up verified the existing card-builder Apple certificate and Google issuer credentials; no new accounts
  are needed on this evidence. Created a dedicated draft LoyaltyClass for the owner's selected FDS Cards UK;
  it cannot issue passes yet. Production login is verified (org 19, Kolotikovs, default FDS Cards brand) and public
  wallet identifiers and all three credential uploads are now verified, with passes OFF. The owner completed the
  uploads after Chrome's file-access check blocked automation; all temporary credential copies were removed.
  branded artwork/update implementation and real iOS/Android save-and-scan acceptance remain open. Details are
  in the wallet/email preflight report. Do not paste secrets in chat.
- A database backup alone does not establish uploaded-media recovery; restore testing must use an isolated target.

Rollback: previous production source and assets can be redeployed. This follow-up adds no migration or writer.
Do not remove the durable journals from the preceding hardening release.
