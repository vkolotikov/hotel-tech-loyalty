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
Final built-artifact checks and deployment evidence will be recorded below after verification.

## External acceptance still open

- Existing Chrome session could not be accessed: both browser tools exposed only an empty automation tab;
  the computer-use runtime failed with `failed to write kernel assets ... (os error 3)` even after a reset.
  Laravel Cloud backup retention, restore rehearsal, production worker/scheduler/shared-cache configuration,
  uploaded-file backups and SiteGround sender/DNS state remain unverified. No changes were made in either service.
- Need a controlled recipient explicitly designated for a test campaign. No live emails were sent.
- Need physical ACR122U/card type and OS testing; native PC/SC requires a trusted desktop connector.
- Wallet acceptance requires the organisation's Apple pass certificate/team/pass-type identifiers and/or Google
  Wallet issuer/service-account setup, plus a real iOS/Android save-and-scan test. Do not paste secrets in chat.
- A database backup alone does not establish uploaded-media recovery; restore testing must use an isolated target.

Rollback: previous production source and assets can be redeployed. This follow-up adds no migration or writer.
Do not remove the durable journals from the preceding hardening release.
