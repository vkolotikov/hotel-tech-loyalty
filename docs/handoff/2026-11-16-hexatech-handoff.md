# HexaTech handoff — 16 November 2026 (Content launch)

Previous state: [14 November, Time Planner](2026-11-14-hexatech-handoff.md) and [13 November, booking and Content](2026-11-13-hexatech-handoff.md). Their booking, promotion, payment, Time Planner and security rules remain in force. This release preserves all incoming production work.

## What is live

The accepted Content launch audit repairs F01–F17, the shared panel/full composer and retained drafts, queued AI with reconnect/progress/cancel/retry, current model compatibility and allowance checks, media upload/reuse/ordered attachments, complete-post approval, structured Brand/Strategy, planning zone and purchased locations, searchable Guide, own-brand mentions/media comments, personal off-default collaboration emails, campaigns and filtered CSV/ICS. Publishing remains manual: Copy/Open channel/obtain media, then explicitly Save and mark published or Mark published.

The final loading follow-up fixes the real1024px live issue: Content rail stays within the viewport, navigation scrolls independently and footer menus remain unclipped; platform filters reserve a scrollable strip and figures have their own row. Shared-frame navScroll is opt-in, false by default for siblings.

## Source and deployment

Reviewed original feature8bd8f162 (baseline99e004ee); all7 whole-branch findings closed by one fix wave/scoped re-review. Task11 initial93e2fb27 was supplemented by the independently reviewed count fix d3430ab8c633264b41c54c0bc0b541ab48fcf0b3; no open Critical/Important findings remain. Production source patch1c95c79e onto013d05e7, initial build2b4ed33a; final follow-up source351b3c1dd2a018fec2b5d176e6406ba861775f9d, build00e4de78e4e472b55340c5eaef7cb9ac38685537. Main is deployed through the separate-worktree source-patch recipe, never a feature merge. Cloud rebuilds assets: verify content.

The original235-path patch had233 exact feature blobs and two preserved-main compositions. The unchanged booking helper was renamed to avoid Windows casing ambiguity, with exactly two import updates. Each follow-up14-path patch has13 exact blobs and a composed historical handoff; backend/dependency blobs unchanged. The final four-path desktop correction has three exact blobs and the same historical-handoff composition. Latest source-patch baseline for Content:d3430ab8c633264b41c54c0bc0b541ab48fcf0b3 (later source-branch changes are documentation).

## Verification

Exact final artifact: TypeScript forced build, 491 Vitest files/7273 tests; lint regression passes with1381 inherited diagnostics; npm audit0;260 canonical and 290 large-count assertions/60 cases (five locales, both themes,390/1024/1440, keyboard/touch and600px/slim rails), original110 browser checks; three required Landing SQLite scopes2069 tests/12909 assertions. Fresh production build passed asset parity/no QA markers/no public admin shell or stats.

The first integrated release also passed seven full scoped backend gates on SQLite and fresh migrated PostgreSQL18 with UTC sessions, all71 changed PHP app paths on PHPStan, locked Composer install/audit0, and all8 CI jobs. Those backend/dependency trees remain unchanged by the layout follow-up. Read the report for per-gate counts, documented skips and retained failed/interrupted attempts.

Live content: /spa/assets/index-_xYuyRgF.js → /spa/assets/ContentApp-OmO6Ta2S.js. All six cold Plan runs pass (same tenant, DPR1;1440/1024/390 twice each),0 browser/API errors/document overflow; footer remains reachable. This is a small lab sample. Bootstrap/settings/media/locations/campaigns/inbox/plan succeed; unauthenticated routes401; absent work ID404 demonstrates migrated table read. Landing kit exact64577bytes/0rp-markers, retired/private files404, sibling entry routes200.

## Operating notes

- The checked account has unnamedUTC planning time. A manager chooses the correct zone in Content settings; saving is explicit and shared venue consequences are explained. No zone was inferred or changed during live checks.
- Live media capability is20971520bytes (20MiB), not20,000,000. Collaboration emails remain off until each person opts in.
- No paid provider/output-quality call, real external email, production upload/post write or automatic network publication was performed. Local real-controller/database/queue/log-mail tests cover those paths with provider transport faked. Cloud worker-console health was unavailable; do not describe this as a live queue-delivery smoke test.
- Reload existing Content/admin tabs after deployment before saving. Manual publishing, at-most-once email attempts, best-effort ledger insertion and non-destructive orphan-image retention are deliberate limits.
- Final loading matrices pass fully: canonical260 and large-count290,30runs each. Desktop and phone filters reserve stable rows; the Ruling22 deferral was revoked and repaired under Ruling23. Conditional wheel checks do not run when the wider desktop strip fits all platforms; native Tab visibility checks remain. No assertion was weakened.
- Detailed report, F01–F17 coverage and all23 rulings: [launch report](../audits/2026-11-16-content-launch.md). Runbook: [Content](../content-workspace.md). Local private evidence: E:/Hexa-Tech-content-launch-evidence-20261113; never publish local-session.json or environment files.
- The original C:/wamp64/www/Hexa-Tech working files and branch were left untouched. The named Content source branch is retained; only this plan’s verified temporary release worktrees/helpers/SDD directory are cleaned after archiving.

## Final code CI

All eight jobs on code release00e4de78 passed: PostgreSQL18 (only documented known failures allowed), three SQLite
shards, Larastan, Node24/26 and the dependency audit. [Pipeline](https://github.com/vkolotikov/hotel-tech-loyalty/actions/runs/43848030732).
Later handoff/report commits are documentation only; application and generated-asset trees remain identical to00e4de78.

## Stay-promotion controls follow-up

Owner's screenshots requested a modern date calendar and readable status selection. Source branch
`feature/promo-controls-20261116` starts at production `4d14e377b`; the original C: checkout and owner assets are
untouched. Changes are confined to the stay-promotion admin page, its new date-field component/scoped stylesheet,
the existing browser journey and these two documents. Dates retain native input validation and their existing
API strings; no campaign, pricing, checkout, payment or database writer changed.

The calendar supports month/year jumps, keyboard days, leap dates, minimum bounds, Clear/Today, editable booking
times and Escape without closing the editor. Glass/Light controls and status-option contrast, 390px/1440px fit,
and the existing create/duplicate/filter/pause/archive/stale-save flow pass in the browser. Initial mobile
auto-scroll dismissal was reproduced and fixed by repositioning the popup; screenshot review also removed its
redundant title and fixed the editor's existing hard-coded dark background in Clean light.

Source verification: TypeScript, focused ESLint and all 491 Vitest files / 7,275 tests pass. Private browser
screenshots/fixture results: `C:/wamp64/tmp/promo-browser-20261116/`. Release artifact and live receipts follow
after the required source-patch gates; this paragraph alone is not a production-deployment claim.

## Booking confirmation and payment recovery follow-up

Owner requested investigation and repairs for a paid checkout's failed reservation. Live read-only audit lookup
identified the unique reservation-ID conflict and a completed authorisation cancellation. Work is on
`fix/booking-recovery-20261116`, based on production `455818e40`; the original C: checkout is untouched. Changes
repair the checkout/import race, explicit public group/replay success and stale/unsafe payment recovery states.
No historical production reservation or payment is changed. See the [report](../audits/2026-11-16-booking-confirmation-recovery.md)
and [journey runbook](../booking-journey.md#confirmation-and-released-payment-recovery--16-november-2026).

Independent review found terminal reload, aged unknown payment, inactive/cached/group-follower replay and
duplicate imported receipt edge cases; regressions reproduce them and all four Important findings are closed.
The final public replay guard runs before acknowledgement/capture and takes no booking-row locks. Legacy
engine widget response assertions are unchanged; recovery metadata requires the explicit version flag.

Final source code `715bf3ccc498c933c65667bad3816c061dcd6032`; separate source-patch artifact `a44e2f33d`
has exact whole-source parity over the explicit 15-path allowlist, physical vendor and a fresh production build.
Artifact gates: Booking/Stripe/Widget/member-portal SQLite 1,173 passed/6,812 assertions/13 existing skips;
three required Landing SQLite scopes 2,069 passed/12,909 assertions; PostgreSQL 18: 148 passed/1,407 assertions;
TypeScript forced build; 491 Vitest files/7,275 tests; lint regression with 1,381 inherited diagnostics; Larastan
all three changed app paths; 18 browser scenarios; desktop/phone screenshot review. The initial unrestricted
Vitest runs timed out in whole-tree filesystem scans; the full rerun with two workers passes at unchanged
timeouts. Initial PostgreSQL trace expectation was extended to include the exact new reservation advisory keys
after the unchanged room/hold sequence. No failing gate is waived.

The fresh build publishes 515 identical assets, keeps shell/stats out of the docroot and contains no booking
fixture markers. Private evidence prefix: `C:/wamp64/tmp/booking-recovery-`; PostgreSQL port 54616 is stopped and
its disposable data retained. This candidate is ready for deployment; live receipts follow after verification.

The initial candidate was not pushed: the pre-push guard detected production advance to `130872409` (the
separate lead-form reply release). Its source and handoff section below are preserved. A new source-patch
candidate on that production baseline must pass combined gates before deployment.

## ForRest campaign form fulfilment

Source branch `codex/forrest-bf-autoreply-20261116` adds optional lead-form automatic email replies, off by default.
The owner's campaign request authorises an EARLYFOR20 email to the people opting in through the ForRest popup.
No campaign or recipient is seeded. A manager must explicitly configure a form and request any catch-up.

The shared public submission writer reserves a durable, unique form/address delivery after successful CRM intake;
after-response sending and a minute recovery sweep claim each attempt once. Consent, expiry, tenant/brand ownership,
marketing opt-out, provider suppression and shared hourly budgets are checked. Unknown SMTP outcomes never retry
automatically. One-click marketing opt-out leaves booking/password mail available. Other forms retain their existing
behaviour. Advanced configuration is API-only in this release; [runbook](../lead-form-auto-replies.md).

Feature checks: 15 new tests / 57 assertions pass on SQLite and a fresh migrated PostgreSQL 18 database with UTC
sessions, using the actual array mail transport and a real failing transport. The earlier PostgreSQL fixture collisions
were corrected without changing application behaviour. The scoped LeadForm/AdminAccess gate passed 141 tests before
the final two operator tests were added. Release-artifact gates and live controlled delivery must precede activation;
this section records source work, not a production-send claim.

## Combined booking recovery release candidate

The booking fix now preserves production `130872409fdb6946d34588b4b3d2cf657d3b567e`, including the form-reply
source, migration and handoff above. Source `151eda59f4a3a47131ed1c72c52b222b28b5d297` and the isolated artifact
`f159d1eed` have exact whole-source parity for the 15 booking patch paths. Booking application blobs remain
identical to the reviewed `715bf3ccc`.

Combined artifact reruns pass: Booking/Stripe/Widget/member-portal plus LeadForm/AdminAccess SQLite 1,316 tests /
12,667 assertions / 13 inherited skips; required Landing scopes 2,069 / 12,909; fully migrated PostgreSQL 18
booking scopes 148 / 1,407; forced TypeScript; all 491 Vitest files / 7,275 tests with two workers; lint regression;
three application paths on Larastan; 18 rendered-Blade browser scenarios; fresh production build and all 515
published asset hashes. Local PostgreSQL and the earlier fixture preview are stopped. Private final rerun logs
use `C:/wamp64/tmp/booking-recovery-latest-*`. Live deployment receipts follow on the retained source branch.

## Booking recovery production receipt

Production `caea7a659bd76087a2b05e067bf12f34fad27f4e` shipped through the separate source-patch branch
`deploy/booking-recovery-latest-20261116` from `130872409`. The original candidate was never pushed. All 15
source paths match retained feature `ee9365e86424a2aac3c0c4bf35044ad93ec69a8e`; generated assets were built only
in the deploy worktree. Production's unchanged SPA serves `index-CXgdchRt.js` / `BookingPromotions-CP4fhNFz.js`.

At `2026-11-16T17:18:21Z`, all 38 live content/protection checks pass. Both `loyalty.hotel-tech.ai` and
`app.hexa-tech.uk` serve booking release `2026-11-16.1`, versioned recovery, retained attempted/terminal receipts,
explicit availability review and venue-contact guards. Promotion calendar strings remain present, admin API
access is protected, shell/stats remain private, the landing host refuses the documented retired stylesheet,
and the Academy kit stylesheet has no retired markers. The initial private retired-asset check's typo and host
scope were corrected against the repository before recording the passing receipt.

No historical PMS reservation, payment, campaign setting, email recipient or financial transaction was changed
by the live checks. The reported authorisation had already been cancelled. Staff must review its historical
PMS reservation separately before collecting another payment. PostgreSQL and the fixture preview are stopped;
the clean, verified temporary deployment worktree was removed after unlinking only its dependency junction.
The source worktree and private evidence are retained; the original C: checkout and owner assets are untouched.

Release CI: all eight jobs pass, including the full PostgreSQL gate (no failures beyond its recorded baseline),
three SQLite shards, Larastan, both Node 24/26 builds and the dependency audit. [Pipeline](https://github.com/vkolotikov/hotel-tech-loyalty/actions/runs/43915898910).
Private final CI receipt: `C:/wamp64/tmp/booking-recovery-ci-20261116.json`. Later source-branch commits record
these receipts only; application code remains identical to the reviewed and deployed fix.
