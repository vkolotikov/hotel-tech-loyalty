# Production acceptance — 29 October 2026

Owner requested completing the remaining work possible with Laravel Cloud and Loyalty open in Chrome.
This report distinguishes live observations, verified fixes and acceptance still requiring access/devices/budget.

**30 October follow-up:** the owner confirmed the production queued email arrived in the inbox and approved
up to US$5 for the restore rehearsal. The separate cluster was restored, its data checked read-only, and the
temporary cluster deleted. Production remained attached to its original cluster. See
`2026-10-30-restore-rehearsal.md` for results, the important actual-database-name finding, and remaining limits.

## Live infrastructure observations

The Chrome extension now exposes the owner's real session (Chrome Design profile). Laravel Cloud's
`fds-cards-ltd / hotel-tech-loyalty / main` is connected to `vkolotikov/hotel-tech-loyalty:main`.
The Loyalty browser session is the owner of organisation 19, Kolotikovs (FDS Cards and Hexa Academy).
No platform-operator permission was granted to this account.

At 17:52 UTC, production reported:

- Database queue, retry-after **660 seconds**. Two existing worker processes handle `default` and `ai`,
  each timeout 600 seconds; scheduler is enabled on the worker cluster.
- Default and shared cache both **database**. Session driver is file; the app currently has one replica
  with autoscaling disabled. Revisit session storage before adding replicas.
- Heartbeat **17:52:04 UTC**, 29 seconds before observation. No queued or failed jobs.
- Harmless jobs 34 and 35 (nonexistent campaign ID, empty recipient list) were queued on default/ai,
  both consumed, with zero failed jobs. No campaign/member was changed by these probes.
- No overdue scheduled email campaign at the preflight observation.
- Object storage is DigitalOcean S3 disk `do`, bucket `hotel-tech-assets`; its versioning GET returned
  **not enabled**. Durable storage is confirmed; deleted/overwritten-object recovery is not.

Cloud Resources confirms **seven days of point-in-time recovery** on the `hotel_tech_loyalty` Postgres 18
cluster (1.1 GB observed). It contains `main` and the separate `hexa_seo` database. The restore dialog says
restoration creates a **new cluster**, and showed a window beginning 22 October 17:53 UTC. At this initial
checkpoint no restore, database replacement or resource purchase had been performed. The subsequent
authorized rehearsal is recorded in the 30 October follow-up.
Provider reference: [Laravel Cloud backup strategies](https://laravel.com/blog/creating-backup-strategies-in-serverless-postgres-with-laravel-cloud).

## Defects found and corrected

1. **Scheduled command reporting was never registered.** Production had zero `ScheduledTaskFinished`
   listeners and no real command outcomes, despite current heartbeat rows. The observers lived in
   `AppServiceProvider`, which this app does not register. A dedicated `ScheduleServiceProvider` is now
   explicitly registered. Successful/failed/skipped outcomes are recorded; background spawn is not reported
   as completion. Heartbeat keeps its independent single record. Exception text and command arguments are
   excluded from stored diagnostics. Recording failure never stops application tasks.
2. **Missing task observations could look healthy.** In-app status now shows `unobserved` when there is
   no recent non-heartbeat outcome, instead of treating an empty failure count as proof of working reporting.
3. **The legacy full-admin campaign send bypassed `CampaignStart`.** Its existing HTML and explicit-member
   interface now shares the conditional draft claim, eligible-audience calculation, cap and queue-failure
   recovery. Another tenant's recipients, invalid rules, duplicate member IDs and duplicate send requests are
   handled safely. Counts now mean eligible recipients, rather than members the transport will skip.
4. **Legacy test mail could report a suppressed message as sent and expose SMTP errors.** Suppressed tests
   are refused explicitly; transport failures return a safe message and log only the exception class.
5. **Campaign defaults exceeded the shared SMTP relay's published limits.** Production used 2,000 per
   organisation and 6,000 platform-wide per clock hour, with neither environment override set. The new
   conservative defaults are **100 per organisation / 100 platform-wide per clock hour**. Larger sends
   wait for the next hourly budget. Transactional mail remains exempt. This allows headroom even across
   adjacent clock buckets; it is not a guarantee covering other apps sharing the same relay. Increase
   only after confirming the actual provider plan and total usage, or moving to a suitable bulk-mail relay.
   SiteGround publishes [400–800 emails/hour depending on plan](https://www.siteground.com/kb/acceptable-use-sitegrounds-email-service).

Existing UI layouts, routes, wallet configuration, business rules and booking cancellation behavior remain.
No migration is required.

## Controlled email and sender checks

Exactly one production queued test was requested through the live application mailer:
**HexaTech production queue test - HEXA-LAUNCH-PROD-20261029-01**, to **info@fds-cards.co.uk**,
from configured **noreply@hotel-tech.ai**, job 36. The job was consumed, failed-job count remained zero,
and the address was not suppressed. A durable attempt marker prevents blind resends.
The owner subsequently confirmed inbox receipt. This exercises the actual production worker and SMTP transport, not a
customer campaign or the marketing unsubscribe path.

The matching member (207) has marketing consent off. That preference was preserved; no campaign was
broadcast and no member was opted into marketing for testing. Campaign consent/footer/delivery behavior is
covered by automated tests, separately from this controlled production transport check.

Public DNS reads confirm one SPF record, a resolving DKIM key and one monitoring-mode DMARC record for
the actual sender domain `hotel-tech.ai`. Authentication success in received headers is not inferred from
DNS alone. `hexa-tech.uk` still has two DMARC TXT records; it is not the current outbound From domain.
No SiteGround or DigitalOcean console tab is exposed in this connected Chrome profile. DNS settings,
mail quotas, bounce/complaint provider feedback and media recovery policy have not been changed.

## Verification and release

Source regression checks include a real isolated scheduler invocation (success, nonzero exit, exception,
skip), background completion, diagnostic redaction, tenant limits, suppression, stale campaign starts,
queue failure, deduplicated recipients and oversized audiences.

PostgreSQL source verification: **44 passed / 414 assertions**, on the existing private migrated test
database. Port 55439 was occupied by the user's unrelated dry-ice application; it was not touched. The
HexaTech private cluster was started on **55440**, and its data directory was verified before testing.

The broad initial SQLite run had seven certificate-fixture failures because OPENSSL_CONF was omitted;
all wallet/durable-file cases passed after supplying the pinned PHP OpenSSL configuration. New test
fixtures were corrected to include production's required started_at and explicit result ordering.
These were test-environment/fixture corrections, not ignored production failures.

Isolated artifact: **911 SQLite tests / 7,089 assertions passed**, with one PostgreSQL-only test skipped
there. The PostgreSQL run passed **45 tests / 427 assertions**, including that independent-process reward
race. After the pacing-default change, **161 relevant mail/campaign tests / 743 assertions** passed again.
Frontend: **5,766 tests / 399 files**, TypeScript, lint regression gate and fresh Vite/postbuild passed.
The existing 1,393 lint diagnostics and known build warnings remain; no new frontend source was changed.
All 13 explicitly allowed source paths matched the source branch in the artifact checkout.

Production push: **414dfbef83d0de54eb23e3b7b732e4542ca681f8**, Cloud deployment **1097**.
Source branch `feature/production-acceptance-20261029`; next source-patch baseline
**12fd2c5fda28c43b3e61ef1fa4fef69b09575502**; later docs-only commits are not the baseline.

Live verified at **18:23 UTC / 20:23 Europe/Riga**: Cloud reports deployed; all four checked backend file
SHA-256 hashes match the artifact; the reporter has exactly one registered completion listener; both
campaign limits are 100; `loyalty:send-scheduled` has a real success record at 18:23:04 UTC. Failed jobs
remain zero. The authenticated organisation's status page reloads with zero campaign failures/delays and
zero delayed loyalty effects. Public health is 200, member authentication is 401, the landing kit remains
correct and retired CSS stays 404. Unchanged frontend entry `index-C1_GFlwU.js` and portal chunk
`PortalApp-B2gWMIZ6.js` retain the earlier booking-copy fix and all booking actions.

At **18:25:22 UTC**, the next real five-minute cycle also showed successful PMS sync, PMS retry,
appointment reminders, loyalty visit-effect recovery and scheduled campaigns; no failed queue jobs.
The refreshed live portal had **zero browser console errors**. No task was manually run against customers.

The private PostgreSQL cluster on 55440 was stopped after testing. Its data was retained; the unrelated
dry-ice PostgreSQL on 55439 was untouched. Restore review is prepared in the browser as
`hotel_tech_loyalty_restore_20261029`, point **29 October 17:53:07 UTC**, with no application attached.
The owner subsequently approved the **US$5 maximum** temporary-resource budget and confirmed the new
production email arrived. The restore was submitted, verified and removed; see the 30 October report.
The isolated deployment checkout and its node_modules junction were removed after live verification;
the original source dependencies, Vite server and unrelated user files were preserved.

## Remaining acceptance

- Restore rehearsal completed on 30 October under the owner's US$5 authorization; the temporary cluster
  was removed. See the follow-up report for the limited verification scope and billing visibility.
- Establish and test recovery for object storage (versioning and/or a separate backup), with an agreed
  retention/cost policy. Database PITR does not restore DigitalOcean object contents.
- Inbox receipt is confirmed; inspect sender authentication/hosting quota before
  increasing campaign volume. Resolve duplicate hexa-tech.uk DMARC through its DNS account when available.
- Wallets remain off: uploaded credentials are accepted, but branded artwork, automatic balance updates,
  Google class publication and real iOS/Android save-and-scan acceptance remain separate wallet work.
- ACR122U needs its PC/SC desktop connector and a physical card/reader trial. Mobile camera/browser
  acceptance requires actual iOS/Android devices. Native apps, payments and SMS remain deferred by owner.

No claim of complete public-launch acceptance is made while these gates remain open.
