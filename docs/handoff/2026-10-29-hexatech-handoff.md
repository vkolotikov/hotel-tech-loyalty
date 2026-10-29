# HexaTech handoff — 29 October 2026

Read this first, then `2026-10-28-hexatech-handoff.md` for previous milestones and
`2026-10-27-hexatech-handoff.md` for the full environment and history. Root AGENTS.md and CLAUDE.md still apply.

## Latest follow-up: FDS Cards UK wallet draft and confirmed email receipt

The owner confirmed **FDS Cards UK** as the first wallet organisation and confirmed the controlled email arrived
in the **inbox**. No second email was sent. Created Google LoyaltyClass
`3388000000023129907.hexatech_fds_cards_uk_loyalty` at **17:55 Europe/Riga** in **draft** state; create/read-back
200 and the existing builder GenericClass's before/after response hash is unchanged. No member objects created.
The existing public FDS SVG logo was visually inspected and used in the draft; final image sizing and device
review remain. A draft class cannot issue objects, so do not activate its configuration prematurely.

Chrome DevTools now opens the live app, but its current account belongs to **Forrest Glamp**, not FDS Cards UK;
it is not a platform operator. No settings changed. A separate isolated Chrome context `fds-wallet-setup` is open
on `https://app.hexa-tech.uk/login`; the owner was asked to sign in with the FDS Cards UK admin account. At this
checkpoint the sign-in is pending. Verify the live identity before reading/writing its settings; never reuse the
local FDS ID 2 as a production ID. Preserve the existing other-organisation session. Windows `sky` still fails
initialization with `os error 3`, but browser automation works.

The private `fds-google-class-result.json` and reviewable `fds-google-loyalty-class-draft.json` sit in
`E:/Hexa-Tech-launch-20261029/`. No HexaTech database wallet row, application source or build changed. Report:
`docs/audits/2026-10-29-wallet-email-preflight.md`. Production and the source-patch baseline remain unchanged.

## Earlier follow-up: existing wallet credentials and controlled email

Owner clarified **card builder** = `C:/wamp64/www/card-builder`, and authorized a test to
`info@fds-cards.co.uk`. One message was accepted by SMTP at **15:13:21 UTC**, from `noreply@hotel-tech.ai`,
subject `HexaTech email test - HEXA-LAUNCH-20261029-01`. Receipt was confirmed in the later follow-up; this exercised local
SMTP and the suppression listener, not production campaign workers. Do not resend blindly: the private helper
has an exclusive attempt marker.

Existing Apple Pass Type ID certificate `pass.co.uk.fds-cards.digitalcard` is valid through **29 September 2027**;
password/key/team match. The actual HexaTech generator's synthetic pass verified its manifest and signature
chain to Apple's root. Google OAuth and issuer/class reads returned 200 for **FDS Cards LTD**; its existing class
is generic and there are no loyalty classes. Reuse the accounts, create a separate LoyaltyClass after identifying
the intended production organisation. Owner was asked whether the first setup is for **FDS Cards UK** (present
locally; do not assume local ID 2 is its production ID). No wallet configuration or provider pass/class was written.

**41 wallet tests / 254 assertions pass.** Real credentials exposed remaining wallet work: Apple emits transparent
1px artwork and no update web service; Google signs initial objects but has no balance/tier update writer. Do not
promise branded, automatically updating wallets or device acceptance yet. Connected Chrome remains unavailable
for production settings; only an empty automation tab is exposed. No secrets were printed or committed.

Report: `docs/audits/2026-10-29-wallet-email-preflight.md`; private sanitized results and helpers:
`E:/Hexa-Tech-launch-20261029/`. No application changes/deploy; production and next patch baseline below remain.

## Current release: in-app operational status

Production **9945e24bf0691735cb312e6f2ebe6826d2467f98**, live content verified **29 October, 15:53 Europe/Riga**.
Source branch `feature/launch-operations-20261029`; next source-patch baseline:
**48b9efce7b02a96e8e05d47693ffce327eae0712**. Do not use later documentation-only commits.
Previous production is `6cee65865f61635e08bba65432c0dceb854e889c`.

Owner scope: mobile web + PC now, native apps later; email campaigns priority, payments/SMS deferred acceptance,
wallets useful pending setup, ACR122U candidate. Failure reporting is inside the app, not email alerts.
New `/system-status` (Full admin → System; also linked from Loyalty Settings) exposes tenant-scoped campaign
failures and delayed loyalty effects to managers. Verified platform operators additionally see scheduler and queue
observations. No payload/secret exposure, cross-tenant data, retry writers or alert emails. Missing observations
show unverified/unavailable, not healthy; the app cannot monitor its own complete outage. USB help now states
that ACR122U requires a PC/SC desktop connector; no connector or physical-reader acceptance is claimed.

34 selected source paths passed parity; no migrations. Isolated artifact: **69 PHP tests / 3,116 assertions**,
**5,766 frontend tests / 399 files**, TypeScript, lint regression gate and fresh build pass. The first cold artifact
run hit the existing fixedInBlur filesystem scan's 5-second timeout; the complete rerun with 30 seconds passed
unchanged assertions. Built Chrome status-page refresh/error/retry/navigation checks, six language/viewport
views and **130 existing Settings/Scan checks** passed; desktop and 320px renders inspected. Existing lint/build
warnings remain documented. Live entry `index-CDjfqwMZ.js`, status `SystemStatus-HdTYnJgv.js`; endpoint 401,
new content/reader guidance, health 200, unchanged landing kit and retired CSS 404 verified.

Report: `docs/audits/2026-10-29-launch-operations.md`; evidence beside it. Private helpers and browser-regression
results: `E:/Hexa-Tech-launch-20261029/`. No live customer emails or other customer mutations were performed.
The temporary deployment worktree and preview on port 5175 have been removed; its node_modules junction was
removed first. The existing source Vite server on port 5173 and unrelated user files/worktrees remain untouched.
`MailIdentityService` already uses the business name + organisation email/override as Reply-To; actual From stays
on the platform domain. Per-customer authenticated From domains require a separate verification integration.

External gates remain: Cloud backup/restore, workers/scheduler/cache, media recovery, sender/DNS and controlled
email delivery, wallet accounts/certificates + devices, physical reader/card acceptance. User's Chrome is open,
but both browser plugins see only an empty automation tab and computer-use initialization fails with
`failed to write kernel assets ... (os error 3)` after reset. No Cloud/SiteGround configuration was inspected or
changed. No SmartCardReader/ACR122/NFC/contactless device was present in the workstation's device inventory.
Do not call this a fully accepted public launch. The later follow-up above records the authorized email test
and verified existing wallet credentials; production configuration and phone acceptance are still pending.

## Previous release: public-launch hardening

Production **6cee65865f61635e08bba65432c0dceb854e889c**, live content verified **29 October, 15:08 Europe/Riga**.
Source branch `feature/public-launch-hardening-20261029`; deployed source and **next source-patch baseline**:
**a3896179c27f1205bc3139b14f2b9952f347ba94**. Do not use later documentation/evidence commits.
Production parent `16788ad8cad9ecf0886c28c2ecd0997f40a725d9`; 412 explicit source paths passed parity,
including whole application source parity. Build artifacts and their deletions were committed only in the isolated deploy checkout.

Report: `docs/audits/2026-10-29-public-launch-remediation.md`; machine totals and final render/live evidence sit beside it.
Approved audit A01–A24 are corrected: tenant/type-bound identity and recovery, owner invariants, integration-origin
and settings permissions, atomic browser sessions, points/reward replay and cancellation, durable refund recovery,
campaign concurrency/consent, tier catch-up, checkout totals/currency/quote binding, safe public errors and UI defects.
Independent review added durable visit/reversal recovery, shared locks, historical Insights currency, canonical card
metadata and whole-currency-unit refund validation. Existing routes/features and desktop/mobile designs remain.

Final artifact: **7,212 PHP tests / 46,371 assertions / 76 scopes / zero failures or skips**, covering all 584 test files;
**5,761 frontend tests / 398 files**, TypeScript, lint regression gate and fresh build passed. **737 browser checks / 28 scripts**
passed against the built SPA; final desktop and 320px renders inspected. Fresh PostgreSQL 18 ran **227 migrations**;
independent-process identity/owner/refund/reward races passed. Composer and npm audits: **zero advisories**.
The lint baseline still records 1,393 legacy diagnostics; this is not a zero-warning claim.

Build/test runtime: Node 22.12+ within Node 22, Node 24, or Node 26+; verified Node 24.15.0. Vitest 5 excludes Node 23/25.
Vite 8 retains the previous browser targets. Main JS is 318.34 KB / 96.94 KB gzip; shared Loyalty 1,356.86 KB / 361.29 KB gzip,
with separate page chunks. Browser runner: `frontend/e2e/README.md`.

Live entry `index-CUzztHZW.js`, Loyalty `LoyaltyApp-CVi2FsKr.js` / `LoyaltyApp-yTdAox3L.css`.
New session/page/style markers, five authentication refusals, health 200, landing kit and retired CSS 404 verified.
No live customer messages, bookings or financial transactions were created in testing.

**Public launch still needs external acceptance:** provider sandbox/callback delivery, sender/domain readiness,
physical camera/NFC/wallet/push, production queue/scheduler/shared-cache/monitoring and restore rehearsal.
Historical fallback currencies/uncertain financial outcomes require read-only reconciliation before any repair.
Read `docs/refund-operations.md`: all new migrations precede new workers; retain refund/visit journals on rollback
and pause refund mutation if reverting to old source that ignores unresolved operations. Production/staging access
permissions now enforce regardless of a legacy `ADMIN_ACCESS_MODE=report` value.

Private logs, original failures and clean reruns: `E:/Hexa-Tech-hardening-20261029/`. User PDF/ZIP/Alexa assets preserved.
Source and deploy histories are separate by design; feature builds were not committed.
The temporary deploy checkout and its preview server were removed after live verification; its node_modules junction
was removed first. The private PostgreSQL instance on port 55439 is stopped, with its data/evidence retained.
The working application's Vite server on port 5173 remains available. Final source/handoff is pushed to the feature branch.

## Earlier public-launch audit — review only, followed by remediation above

Before remediation, the audit recommended **holding the public launch**. Full report:
`docs/audits/2026-10-29-public-launch-audit.md`, with platform, Loyalty, booking and UI appendices,
reproduction files and a machine-readable verification summary. Nine high-priority findings cover
identity/session/ownership, integration destinations, points and refunds; other configuration/UI issues
and unverified operational gates are listed separately. No product improvements or deployment were made during that audit.

Audit source `b13381c795d2c5b66e4c9aa1650b97b1c61f2ed5`, branch `audit/public-launch-20261029`.
Existing scoped PHP runs: **7,070 passed / 1 failed / 7 skipped / 45,437 assertions**. The failure is the
preexisting untracked Alexa static directory's missing reserved slug; skips require PostgreSQL.
Frontend **5,730 passed**, TypeScript/build passed, **718 browser fixture checks** passed. Whole-app lint
and dependency scans have findings. Twenty additional isolated probes establish defects, not fixes.
Private artifacts: `E:/Hexa-Tech-audit-20261029/`. At audit time, production and the source baseline were still the mobile release below.

## Previous release: dedicated Loyalty mobile web

Production **16788ad8cad9ecf0886c28c2ecd0997f40a725d9**, live content verified **29 October, 12:22 Europe/Riga**.
Feature `feature/loyalty-mobile-20261029`; deployed source and **next source-patch baseline**:
**e4f43246f5ec0195cbb36c50c861afe744437790**. Do not use later documentation/evidence commits.
Production parent `ce1f55e0f`; final source patch `60916b106`; 240 explicitly allowed paths with whole-source parity.
Report: `docs/loyalty-redesign/22-MOBILE-WEB-REPORT.md`.

The connected plugin supplied all 32 MH/MM/MR/MS/MA mobile design contexts. Below 768px the workspace now has
Home/Members/Scan/Requests/More navigation, compact Home summaries, separate member and request details,
full-screen member forms and review sheets. More preserves secondary tools; Settings collapses supporting links.
Desktop layouts, APIs, routes, permissions, full admin and the continuous door scanner remain available.

The API supports one membership-level filter, so the mobile sheet follows that contract. There is no staff
reward-claim creation endpoint: reward details explain member-app claiming and open existing claims. No synthetic
writer, inferred eligibility or consent update was added. Actual organisation, balances and rules replace demo data.

Final artifact: **5,730 frontend tests / 394 files**, **133 PHP tests / 1,391 assertions**, TypeScript,
full Loyalty/shared-footer ESLint and fresh build passed. Compiled Chrome: **203 interaction checks**,
**60 style views / 30 routes**, **70 narrow/short locale-theme views**, plus mobile touch-emulation navigation.
No runtime errors or overflow. QR decoding uses the real decoder with a fixture MediaStream; NFC/USB transport is
simulated. Browser writes are intercepted; live checks are read-only. No backend/migration/dependency changes.

Private helpers/logs: `E:/Hexa-Tech-release/mobile-*`, `logs/mobile-*`. Evidence and exact geometry are in
`docs/loyalty-redesign/evidence/mobile-web/`. Temporary artifact `E:/Hexa-Tech-release/mobile-web` and preview
PID 38500 were removed after live verification. Original Vite PID 1992 and unrelated user files are preserved.

Live entry `index-wkLcRp-m.js`, Loyalty `LoyaltyApp-DA0ULxos.js` / `LoyaltyApp-Ddu--NOf.css`. Mobile and existing
section markers, safe-area styles, three font files and currency/Overview/members/requests/rewards authentication
responses passed. The public landing kit retained its stylesheet; retired CSS stayed 404. See `live-verification.json`.

## Previous production release: Guided setup and Settings

Production **ce1f55e0f349ee5cb236b63ac6e48704c6d3dd4d**, live content verified **29 October, 11:03 Europe/Riga**.
Feature `feature/loyalty-settings-setup-20261029`; deployed feature source and **next source-patch baseline**:
**43382945207c44ae6a6ce952272121e32e6a1d10**. Do not use a later documentation/evidence commit.
Isolated artifact parent **8f7c18159**, final source patch **56c9049de**, 152 explicitly allowed paths;
whole-source parity passed. Report: `docs/loyalty-redesign/21-SETTINGS-SETUP-REPORT.md`.

Exact connected Figma PG-07 `92:3958`, ST-01 `208:7104`, ST-02 `210:7325` were inspected and compared with browser
renders. Guided setup keeps its real four-step editor, server options, current tiers, idempotent Apply and Skip,
with a progress banner, bounded live rule preview, compact reference presets and leave confirmation.
Selecting the current Review step retains the retry key. No unsupported persistent-draft service was invented.

New `/loyalty/settings` has staged language/theme preferences, Save/Discard and the existing manager-only
currency API/dry run/warnings. It shares the frame's live theme state; drafts reset with tenant/staff/capability
scope. Existing quick preferences remain, with All settings opening the new page and dismissing the popup.
Get started, Guide, Import and Duplicates now share the Overview frame, typography and controls. All regular
Loyalty routes use that frame; continuous door mode remains outside it. Content/full-admin defaults are retained.

Final artifact: **5,717 frontend tests in 394 files**, **69 PHP tests / 719 assertions** (Currency/Options/Setup/
Start/Access/Gate/Import/Duplicates filter), TypeScript, full Loyalty/shared-footer ESLint and fresh build passed.
Compiled Chrome: **79 setup/settings checks**, **60 desktop/mobile style views across 30 routes/tabs**, no runtime
errors. Six widths, five languages, dark/light/Auto, actual draft values, currency failures/retry/confirmation,
staff restrictions and setup idempotency were checked. Browser writes are intercepted fixtures; live checks are
read-only content and authentication checks. No backend, migration, dependency or production-data changes.

Live entry `index-CKJuCZ7B.js`, Loyalty `LoyaltyApp-DVccFo2K.js` / `LoyaltyApp-CTQS2Qab.css`. New/existing markers,
responsive styles, three fonts, currency/options/start authentication (401), public landing kit and retired CSS
(404) passed. Evidence: `docs/loyalty-redesign/evidence/settings-setup/`.

Private helpers/logs: `E:/Hexa-Tech-release/settings-setup-*`, `settings-style-review.cjs`, `settings-assets*` and
`logs/settings-setup-*`. Temporary artifact `E:/Hexa-Tech-release/settings-setup` and preview PID 38140 are removed
after verification. Original Vite PID 1992 and the user's unrelated untracked files are preserved. Feature-branch
build outputs were not committed. Deployment still follows the recipe and standing authorization described below.

## Previous production release: compact Insights membership layout

Production **8f7c18159e6ae6d082c7f0db7706592cbdb1fbbb**, live content verified **29 October, 09:55 Europe/Riga**.
Feature `feature/insights-layout-20261029`; deployed source and **next source-patch baseline**:
**de39dc9a9e5c26898a13821dd68554f113c0cb7d**. Do not use the later documentation/evidence commit.
Isolated artifact parent **59a6bda89**, source patch **b314325b8**, 34 explicitly allowed paths; whole-source parity passed.
Read `docs/loyalty-redesign/20-INSIGHTS-LAYOUT-REPORT.md` for the precise scope and evidence.

The owner supplied a screenshot of an excessively tall Membership levels card. Re-inspected exact Figma IN-01
`136:6541`. The card now displays populated levels compactly beside its donut, puts empty levels in a native
keyboard-operable disclosure, caps long lists with keyboard scrolling and stacks cleanly on narrow screens.
The adjacent activity chart no longer stretches with the tier list. Counts, percentages, server order/color
association and unassigned members are retained. Two new strings are translated into all five languages.
No backend, API, migration, dependency or data-definition changes. Filters, CSV, charts and detailed reports remain.

Final artifact: **5,704 frontend tests in 394 files**, **33 PHP tests / 276 assertions** (scoped Insights filter),
TypeScript, full Loyalty ESLint and fresh Vite/postbuild passed. Compiled Chrome: **48 layout + 59 existing
interaction/state checks**, no runtime errors. Seven widths, five languages, both themes, the screenshot's
179/3/2 out of 184 distribution, 30 populated tiers, long names, empty and unassigned membership were exercised.
Final compiled desktop and mobile renders were visually compared to Figma. Browser APIs are intercepted local
fixtures; live verification is read-only content and authentication checks, not authenticated production data.

Live entry `index-hJ5Z0xdJ.js`, Loyalty `LoyaltyApp-CKwz0Hzw.js` / `LoyaltyApp-B7Gq2D31.css`.
New and existing feature markers, responsive styles, three local font payloads, three API authentication checks,
public landing kit and retired CSS 404 passed. Evidence: `docs/loyalty-redesign/evidence/insights-layout/`.

Private helpers/logs: `E:/Hexa-Tech-release/insights-layout-*` and `logs/insights-layout-*`.
The temporary release worktree and its own preview server are removed after verification; the original Vite
PID 1992 and user untracked files are preserved. No feature-branch build outputs are committed.

Deployment still follows the source-patch recipe from `docs/landing-page-builder.md` §6. Use PHP 8.4.20,
`XDEBUG_MODE=off`, `-d max_execution_time=0`; never junction vendor. Foreground scoped PHP runs only.
The owner's standing instruction to deploy completed verified work without asking remains in CLAUDE.md.
