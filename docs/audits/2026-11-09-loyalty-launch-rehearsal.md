# Loyalty launch rehearsal — 9 November 2026

The core web journey has been exercised against a real, fully migrated PostgreSQL 18 database with an isolated organisation. Core web sign-off still needs the production runtime and backup observations below. Device/provider acceptance gates enabling those optional features; they can stay on hold for a web pilot. A clean organisation status page or configured credential is not delivery proof.

## Changes from the rehearsal

- Staff sign-in and recovery inputs now have explicit accessible labels, stable IDs and appropriate autofill hints.
- The member bootstrap adds optional `capabilities.wallets.apple/google` flags, using this organisation's plan, provider setup and the existing pass eligibility rule. The web portal hides unavailable wallet actions. Missing flags on older servers hide the actions conservatively. Issuance still performs its existing approval/signing checks; no secret is returned.
- `php artisan loyalty:launch-audit` reports safe configuration and existing scheduler/queue/media observations, read-only by default. No credential values, sender address, bucket name or exception text is returned. `--queue-probe` explicitly queues one harmless job at most once per 15 minutes. A processed probe proves one job crossed the shared queue/cache boundary; it does not establish continuous worker monitoring.
- Repeatable real-backend rehearsal entry points and instructions live in [frontend/e2e/LAUNCH-REHEARSAL.md](../../frontend/e2e/LAUNCH-REHEARSAL.md). They refuse a non-local database, capture mail, block provider HTTP requests and keep generated credentials outside Git.

## Evidence

| Check | Observation |
| --- | --- |
| Full scoped SQLite PHP sweep | 80 scopes: 7,538 passed, 25 skipped, zero failures before the wallet/audit additions; affected scopes rechecked afterwards |
| PostgreSQL 18 critical suites | 1,330 passed; one existing `ReferralLinkTest::test_no_referral_code_means_no_link` failure deliberately conflicts with production's NOT NULL schema |
| Wallet follow-up | SQLite Member + Wallet: 383 passed; PostgreSQL Member/Portal + Wallet: 322 passed; bootstrap regression: 47 passed |
| Diagnostic command | Five tests pass on SQLite and PostgreSQL; default queues nothing, explicit probe is bounded, sync cannot imitate an async worker |
| Static analysis | Larastan clean with 2 GB memory; initial default-memory run exhausted memory |
| Frontend before final release artifact | TypeScript clean; 454 files / 6,721 tests passed before the three new wallet tests; affected Login/Home/WalletButtons tests: 29 passed; lint baseline passed (1,398 existing diagnostics) |
| Native member compatibility | Typecheck with the updated shared type through a read-only compiler overlay; 3 files / 41 tests passed in the apps checkout, no native release |
| Exact release artifact | 2,369 scoped PHP tests (2,042 required release tests plus 327 affected tests), 457 Vitest files / 6,733 tests, TypeScript, lint baseline and Larastan passed; fresh production build and all 72 real-backend browser checks passed |
| Real backend journey | 72 checks: registration, 500 welcome points, server-defined level upgrade, idempotent award, reward claim/fulfilment, benefit approval/completion, reader/member permission refusals, manual lookup, reversal, deactivate/reactivate, completed-day Insights, consent and captured immediate/scheduled email campaigns, real queue probe acknowledgement, password recovery/revoked old session, 390/1440 px rendering; no unexpected server failures or JavaScript errors |
| Actual email | One authorised workstation SMTP test to the owner's designated inbox, marker `HEXA-LAUNCH-20261109-EMAIL-01`; accepted at 08:02:11 UTC and owner confirmed inbox arrival. This proves that SMTP path, not the Cloud queue path or inbox authentication headers |
| Production organisation status | Owner's 11:03:25 Riga reading: zero campaign failures, delayed email campaigns and delayed loyalty updates; wallet updates **Not verified**, zero issued updates. No platform observations were included |
| Production platform observations | Owner ran the deployed diagnostic at 09:45:26 and 09:46:31 UTC. Scheduler heartbeat ages 21/27 seconds; shared cache and queue use the database. The same harmless probe was queued and processed at 09:45:26; the second reading has zero ready jobs and zero failed jobs. SMTP configuration is present with From domain `hotel-tech.ai`. Media recovery remains unobserved. This proves that job ran, not continuous monitoring or Cloud email delivery |
| Production media follow-up | Owner ran `media:check-recovery`; at 09:47:42 UTC the fresh status is **attention**, with no leftover rehearsal marker. Storage did not report versioning `Enabled`. Policy and actual recovery acceptance remain open; see the [prepared plan](2026-11-09-media-recovery-plan.md) |

Private logs, screenshots and fixture data remain in task directories under `C:/wamp64/tmp/loyalty-launch-*`, outside Git. Do not publish private logs or fixture files. Release-artifact results and production content verification are recorded in the current handoff.

## Production checks still required

1. The owner supplied the production scheduler/shared-cache/queue observations above; no repeat probe is needed for this rehearsal. A controlled production email campaign to the designated test inbox and its confirmed receipt are still needed to establish the Cloud delivery path; the earlier receipt covers workstation SMTP. Authenticated browser automation was stopped by URL verification, so the agent could not inspect Cloud configuration directly.
2. Verify actual tenant Twilio credentials/sender and one SMS to the already authorised owner-controlled phone. No SMS was sent in this rehearsal. Keep unavailable channels on hold until configured. A member needs the relevant consent before a campaign send.
3. Accept member/staff push on real devices with the released native builds and their APNs/FCM configuration. An inbox record does not prove device delivery.
4. Accept Apple/Google pass issuance, add, update and deactivation on physical devices with approved issuer credentials. Uploaded data alone does not establish issuer approval. The owner reports no issued cards; wallet status remains unverified. Accept the Windows/NFC reader with actual hardware; no smart-card reader was detected on this workstation.
5. Confirm production Cloud database backups/retention and execute the approved [30-day media recovery plan](2026-11-09-media-recovery-plan.md). Fresh production versioning status is **attention**. The owner could not locate resource details and requested the agent inspect them; browser/computer access is now unavailable and reconnection was requested. No provider settings have been changed. Cached versioning status alone does not prove restoration.
6. DNS observations: `hotel-tech.ai` (the test From domain) has one SPF and one DMARC record, default DKIM published, DMARC `p=none` without a reporting address. `hexa-tech.uk` has two DMARC records and needs one valid policy if used as a sending domain. No DNS change was made; provider/DNS access is external to this checkout. Receipt alone does not verify SPF/DKIM alignment.

The full desktop/member-app designers, per-customer SMTP/domain self-service and expanded Places functionality remain on hold as previously agreed. These checks do not release native apps or enable unconfigured providers.

## Release and rollback

No migrations or existing endpoint removals are introduced. Deploy by the source-patch recipe in `docs/landing-page-builder.md` §6, preserving concurrent work on main; verify fresh asset content and protected API responses. Roll back the source patch and rebuild through the same recipe if sign-in, bootstrap or wallet eligibility regresses. Never roll back by resetting main over another release. The diagnostic command does not change tenant configuration; a probe expires from shared cache after 15 minutes.
