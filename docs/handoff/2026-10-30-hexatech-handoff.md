# HexaTech handoff — 30 October 2026

Read this first, then `2026-10-29-hexatech-handoff.md` for the latest application releases and
`2026-10-27-hexatech-handoff.md` for the full environment. AGENTS.md and CLAUDE.md still apply.

## Latest release: wallet updates, media monitoring and reader preview

Owner: "do all improvements what you can do". Deployed **f0c30c7398fa73c33fa3b2ef6d971664ef51d2aa**,
Cloud **1098**, 30 October about 18:49 UTC. Feature `feature/launch-completion-20261030`.
**Next source-patch baseline: b32aefe5aa888f3a48f9610ea08307c5adb877b1.** Later docs commits are not the baseline.

Wallet update tables/protocol, Apple APNs and Google PATCH retries, strict credentials/class preflight,
owned-logo artwork, atomic download nonces and certificate replacement fix shipped. Operations now observes
tenant wallet failures and platform media versioning. Added read-only media observation and explicit isolated
version recovery tooling. Windows ACR122U helper reads/copies UID into existing Scan/Link fields; unsigned preview,
zero readers detected on this workstation. Runbook: `docs/wallet-and-media-operations.md`.

Artifact checks: **145 PHP tests / 3,876 assertions**, **30 PostgreSQL tests / 234 assertions**, **5,766 frontend
tests / 399 files**, TypeScript, lint regression gate and build. Built card/scan **133 checks** and multilingual
responsive operations scenarios pass; desktop/mobile renders inspected. Existing 1,393 lint diagnostics and
build/docblock warnings remain. Full source parity passed; main received the isolated source patch and fresh build.
Live content, download checksum, wallet authentication, health, portal auth, booking-copy preservation and landing
checks passed **18:49:56 UTC**; entry `index-Df7w7ZXT.js`.
Live runtime **18:55:12 UTC**: database `hotel_loyalty`, **228 migrations**, zero wallet passes/registrations,
zero queued/failed jobs; heartbeat **18:55:04**. FDS off, Apple preflight passes, Google class approved, wallet
command exit 0. The media observation was populated and correctly says attention (versioning remains off).
Automatic wallet cycles succeeded **18:50:17** and **18:55:15 UTC**; zero latest failed scheduled tasks at
18:55:46. The production console was exited after inspection. Deployment worktree and its node_modules junction
were removed after testing; private proof files remain outside it.

Dedicated Google loyalty class is now **approved**, existing Card Builder generic class unchanged. Google issuer
publishing access is **In review** in the signed-in console. No member objects created. Existing Apple certificate
identity/expiry/signature and real Apple-root verification pass. FDS wallets remain OFF pending issuer approval
and actual iPhone/Android save, artwork, update and scan tests.

Media inventory: **208 current objects / 201,923,289 bytes**, versioning disabled. Lifecycle read **AccessDenied**
with the app's existing credentials. No storage settings/costs/copies changed. Awaiting owner access to DigitalOcean
for a reviewed retention policy and subsequent recovery rehearsal. SiteGround is signed out; owner was asked to
sign in to fix duplicate DMARC on **both hexa-tech.uk and fds-cards.co.uk**. Actual sender is hotel-tech.ai and the
confirmed email receipt stands. Received headers, hosting quota/feedback and actual device tests remain pending.

Report: `docs/audits/2026-10-30-launch-completion.md`; evidence beside it. Private artifacts:
`E:/Hexa-Tech-completion-20261030/`. Private PostgreSQL **55440** and task preview/Vite processes have been stopped.
Port **55439**, unrelated user browser tabs and untracked PDF/ZIP/Alexa assets were untouched.

Browser: use native CUA on Chrome window **3147704**, refreshed by inventory. The task has separate Cloud, Google
Wallet and SiteGround tabs beside the user's existing tabs. Google is signed in; SiteGround is not. Browser extension
host remains unavailable. AX can lag one action: verify navigation/focus visually. In an xterm console use `paste`,
then Return, and inspect the later screenshot; an editable terminal may still belong to a disconnected restored
session, so select Start new session first. Do not use the system clipboard directly or print credentials.

## Earlier today: database restore rehearsal completed and cleaned up

Owner approved **up to US$5** for restoring `hotel_tech_loyalty` to the disposable
`hotel_tech_loyalty_restore_20261029`, verifying the databases, and deleting the copy. The restore point was
**29 October 17:53:07 UTC**. Restore completed before a browser interruption; verification/cleanup completed
on 30 October. **Do not recreate or try to delete this resource again: it is gone.**

At **09:44:58 UTC**, read-only encrypted database connections verified:

- `hotel_loyalty`: 185 public tables, 227 migrations, 485 members, 2,582 bookings, 45 organisations,
  99 points transactions, 23 rewards, 8 NFC cards and 15 service bookings.
- `hexa_seo`: 62 public tables/migrations, 16 sites, 4,088 keywords and one user.
- `main`: empty public schema. This is not where the loyalty records live.
- No invalid public indexes or unvalidated public constraints. Client TLSv1.3 independently confirmed.

**Important recovery detail:** the Cloud UI lists source database `main` attached to the loyalty environment,
but the live application query confirmed **`current_database() = hotel_loyalty`**. Preserve/check that actual
database-name override during any future recovery; blindly choosing restored `main` would select an empty
database. No source configuration or attachment changed this session.

All three restored databases remained unattached; no application/worker/scheduler ran against the copy.
The exact test cluster was deleted and absent from Cloud's database inventory by **09:51:28 UTC**. The
original cluster and its loyalty/SEO environment attachments remained. Credentials were used only in memory
and cleared. The standalone probe is private at `E:/Hexa-Tech-restore-20261030/check.php` (no credentials).

At **09:54:40 UTC**, live read-only checks found 487 members, 2,585 bookings, 227 migrations, **zero queued
or failed jobs**, and a heartbeat from **09:54:04 UTC**. Public health/authentication, booking-copy markers,
booking actions, landing kit and retired CSS checks passed at 09:50:56 UTC. Cloud console closed afterward.

Cloud's usage page updates hourly and did not separately list the removed cluster; the exact final charge
is not verified. No further resource was created. This was a database restore/inventory check, not an
application failover, timed RTO, row-by-row comparison or object-storage recovery.

Report: `docs/audits/2026-10-30-restore-rehearsal.md`.
Evidence: `docs/audits/2026-10-30-restore-evidence/` (sanitized JSON and screenshots).

## Production email accepted

Owner confirmed **inbox receipt** at `info@fds-cards.co.uk` of
`HexaTech production queue test - HEXA-LAUNCH-PROD-20261029-01`. No resend is needed; retain attempt marker
`ops:mail:HEXA-LAUNCH-PROD-20261029-01`. No marketing consent, campaigns or customer data changed.

## Restore-rehearsal release state (superseded by the release above)

No application source, build, migration, production setting or deployment changed this session.
Production remains **414dfbef83d0de54eb23e3b7b732e4542ca681f8**, Cloud **1097**.
Feature branch: `feature/production-acceptance-20261029`.
Next source-patch baseline remains **12fd2c5fda28c43b3e61ef1fa4fef69b09575502**, not a later docs commit.

Remaining acceptance: media backup/recovery; sender headers/quota/feedback and duplicate hexa-tech.uk DMARC;
wallet artwork/automatic updates/Google publication/device save-and-scan; ACR122U PC/SC connector and actual
reader test; actual iOS/Android browser checks. Wallets remain OFF; their uploaded credentials remain accepted.
Native apps, payments and SMS remain deferred. Database restoration and email inbox receipt are no longer
pending user approvals.

## Earlier browser recovery notes

The browser extension host currently reports unavailable. Chrome DevTools exposes a separate blank profile,
not the owner's signed-in Cloud session; do not ask the owner to sign into it again. The owner brought their
existing **Laravel Cloud - Google Chrome / Design** window forward, and native computer-use access worked.
Current window id was **854530**; refresh inventory before reuse. The normal FDS Card Builder window is
**3147704** and was left alone. Maximizing the Cloud window resolved an off-screen capture error.

Native accessibility state can lag one call behind an action and sometimes reports stale address-bar focus;
confirm editable focus visually when necessary. Read secret-bearing AX into memory with `emit:false`, never
print it. No credential was saved to disk. The extra automation browser can be left alone; use the signed-in
Cloud window. Production Cloud inspection console was closed after read-only checks.

Private HexaTech PostgreSQL on port **55440** remains stopped. Port **55439** belongs to the unrelated dry-ice
application and must not be touched. Preserve existing Vite and untracked user PDF/ZIP/Alexa assets.
