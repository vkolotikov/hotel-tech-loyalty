# HexaTech handoff — 13 November 2026 (stay promotions)

Previous state: `2026-11-12-hexatech-handoff.md`. Work started from `99e004ee` on `feature/booking-promotions` in the main `hotel-tech-loyalty` repository. The owner clarified that Forrest uses the main portal, that discounts must exclude additional services, and that admins must manage campaign dates, then approved building the improvement.

## Delivered source

See `docs/booking-promotions.md` for operation, exact date boundaries, pricing, credential setup and the Forrest campaign checklist.

- Manager-only Stay promotions page under Bookings: drafts, editing with revision checks, duplication, pause/archive, booking windows in the venue zone, independent eligible stay dates, excluded nights, room restrictions and lifetime use figures.
- Shared stay pricing for percentage, fixed amount and an actual verified second night free. Full-price extras, no stacking, better eligible member discount, tenant/brand scoping and server-owned totals.
- Optional promo entry in the public widget and member portal, localized member errors in all five portal languages, and clear invalid-code correction before payment.
- Immutable quote snapshots, exact room allocations, capped payment extension, zero-total checkout, one use per multi-room hold, and campaign-aware payment webhook recovery through the existing booking writer.
- Smoobu receives the discounted accommodation amount and unchanged extras. Stored price elements retain the discount after PMS refreshes.
- Optional Smoobu HMAC signing with encrypted organisation/brand secrets and fresh signed request bytes on retries. Existing no-secret API-key connections retain their authentication.

The feature defaults off per organisation. Forrest's codes and dates are not seeded or enabled. This avoids guessing its campaign booking window or which December 31 nights to exclude. Other venues retain existing member stay prices while the flag is off; old accepted holds retain their pricing scope.

## Development environment

Linux cloud workspace. PHP 8.5.12 ran in the `booking-promotion-php` Docker container, with `gd`, `zip`, `intl` and `pdo_pgsql`; Composer vendor is local to the checkout. Node 24.22.1, frontend dependencies from the lock file. Test PostgreSQL 17 runs in `booking-promotion-pg`, migrated from every migration. No production keys were loaded or used. Browser checks use Playwright Chromium and intercepted local API fixtures; screenshots and detailed logs live in the session's `/workspace/scratch` and are not repository artifacts.

## Checks and release

- The complete release-artifact PHP run finished across all 82 scoped runs: **7,765 passed, 25 skipped, 0 failed**. Every scope exited successfully.
- Regressions: Booking, Unit/Booking, Smoobu, Unit/Support, Settings and AdminAccess: 1,161 passed, 6 skipped. Member/Portal: 307 passed. The expanded zero-total confirmation and brand-isolation cases also passed on SQLite and PostgreSQL.
- New feature/admin/Smoobu signed-request cases on a fully migrated PostgreSQL database: 17 passed. Unit promotion rules: 6 passed (included in Unit/Booking above).
- Frontend: all 7,180 tests in 481 files passed; typecheck and production build passed. Lint baseline reports no new diagnostics. Larastan reports no errors. Selected codes remain removable when a fresh quote finds the venue has disabled promotions.
- Browser on the compiled SPA and actual rendered Blade widget: admin creation, date/exclusion/room controls, duplication, enable switch, invalid-code correction, full-price extras, displayed total, desktop and mobile layouts passed.
- Earlier broad verification covered every PHP test scope on SQLite; its Settings encrypted-key assertion was updated for the new secret, and the affected Settings, CRM and CRM workspace suites then passed. A frontend navigation icon collision was corrected to a unique icon. Neither failure is accepted as a baseline.

The release artifact was built in a separate worktree from `origin/main`, with an explicit source list and parity checks, a fresh production build and repeated frontend/browser checks. Feature-branch generated assets were restored and not committed. Publishing must verify the served bundle by content. No campaign activation is part of this release.

## Activation still requires venue details

Confirm the exact booking-open and booking-close times, excluded stay-night years, room eligibility and the agreed minimum nights for the percentage offers. Enter and test any required Smoobu signing secret securely through settings, verify nightly rates and make a controlled Stripe/Smoobu booking with the venue before publishing the campaigns. No live customer booking, payment, email or campaign activation was performed during development.

## Booking journey improvements (later on 13 November)

The owner requested the remaining booking improvements, design and journey review, promo enablement and deployment. Work started from the first promotion release, `a487b2f`, on `feature/booking-journey-improvements`. See `docs/booking-journey.md` for the exact scope, findings, fixes and launch procedure.

The public checkout now handles all buttons and duplicate clicks, bounded card-form retry, uncertain payments, lost confirmation replies, real bank-return verification, expiring quotes, pre-payment contact snapshots and pay-at-venue special requests. Multi-room guest counts are allocated once. Calendar selection and room/extra cards work with the keyboard, calendar updates retain focus, and sold-out departure editing works. Confirmation shows a server-verified booking summary and reference. Admin campaigns gain launch status, guest-page access, search/filtering, quick status changes, sticky actions, visible save errors and inactive-room handling.

Forrest's actual iframe was located on `forrestglamp.lv`: public booking identifier `j2Zr6S7OxWbuAp0YhdcgJvUnoBYAsCmr`. The targeted activation migration enables promo entry only for that organisation and prepares missing codes as drafts. It does not guess campaign windows or overwrite existing campaigns. Other organisations retain their existing switches.

Source verification: 1,249 booking/payment/member/widget/access regressions passed (13 skipped), all 7,181 frontend tests passed, lint had no new diagnostics and the production build passed. Later focused inactive-room and activation checks passed on SQLite and PostgreSQL. Thirteen actual-Blade browser scenarios passed; the existing admin browser check passed at desktop and mobile widths. The release artifact repeats required checks and gets a fresh build. No live card charge, customer reservation or customer message is part of the tests.

An asynchronous question for exact Forrest booking times and excluded stay dates/years remains unanswered. Promo entry can be enabled while those campaigns remain drafts. Their publication still requires that business input; it is not an implementation or permission blocker for deploying this release.

Release artifact: all 82 scoped PHP runs exited successfully, 7,779 passed and 25 skipped. The final 13-case public-checkout file, including its added webhook-recovery case, also passed on SQLite and PostgreSQL. PostgreSQL's larger booking/concurrency selection passed 72 cases before that final added case. All 7,181 frontend tests, lint, typecheck, production build and Larastan passed in the deployment worktree. Guest browser scenarios (13), promo-widget checks and admin CRUD/search/status/stale-editor checks passed on the compiled release. Source parity covers 17 explicit files.

Before rollout, Forrest's live public search found nine available rooms for 7–9 December 2026. A quote returned EUR 240 accommodation plus EUR 30 extras, total EUR 270; the extra matched its full catalogue calculation. Promo entry was still false before the migration. These live checks created only a temporary quote hold, no reservation, PaymentIntent, card charge or customer message. Deployment and activation verification are recorded in the follow-up once the served content changes.

The booking-journey artifact was pushed as `23059257fb45b8a3d738e50b2ad24f50b1094604`. Its CI dependency audit caught a Laravel concurrency-output advisory published at 18:54 UTC during the release (`CVE-2026-128083`, `GHSA-63hm-g96r-2m2q`). The follow-up updates only the framework package from 13.39.0 to the fixed 13.40.0; it does not suppress the audit. Required artifact checks and served-content verification are repeated before the rollout is considered complete.

The security artifact passed all 82 scoped PHP runs: **7,780 passed, 25 skipped, 0 failed**. All 936 Booking and Member/Portal cases passed on PostgreSQL 17. All 7,181 frontend tests, typecheck, fresh production build and Larastan passed. The rebuilt frontend is byte-identical to the previous local artifact because no frontend source changed. Composer validation and the PHP/root/SPA production/SPA development dependency audits passed with no advisories. The actual-Blade 13-case guest scenarios, compiled admin scenarios and promotion-widget scenarios passed again. Source parity covers the five explicit follow-up paths; no unrelated source or generated feature-branch assets are shipped.

The initial journey release was verified live by its new admin chunk, public recovery/calendar code and Forrest configuration (`promotions_enabled: true`, `payment_enabled: true`, no currency mismatch or mock mode). A fresh live quote retained EUR 240 accommodation plus EUR 30 extras, total EUR 270, with the extra at its full catalogue price. All three codes returned `promotion_inactive` and no hold token. Actual public desktop/mobile browser walkthroughs passed date search, room selection, draft-code correction, quote creation and client-side contact validation, stopping before payment. Their network guard allowed only read requests and quote creation; no PaymentIntent, reservation, email or card charge was created. Temporary quote holds expire automatically.

The security follow-up carries HTML metadata `booking-release=2026-11-13.2` so its live verification cannot accidentally accept the first journey release. The hosted preflight on the feature source (`43491421113`) passed the dependency audit, all three SQLite shards, both Node versions and Larastan; the full PostgreSQL 18 job was still running when this note was written. Final deployment and CI status are appended after rollout.


---

## Earlier Content pre-launch audit

Historical audit status below predates the completion work; the final Content release record supersedes it.

# Handoff — 13 November 2026

## Content pre-launch audit, no product deployment

Owner requested a deep review of `https://app.hexa-tech.uk/content` before public launch, covering functionality, design and missing features. Audit branch: `audit/content-prelaunch-20261113`, based on source `d38eec69a33dd3cdaf472305ce68ffde54aaae8a`. No application code or production data was changed and no deploy was performed. See [the full audit](../audits/2026-11-13-content-prelaunch.md) and its evidence directory.

**Verdict: hold public launch.** Seventeen confirmed findings are grouped into four P1 and thirteen P2 issues. P1: expired tenant owners bypass subscription enforcement; second-precision revisions allow lost saves and approval of unseen words; an in-flight AI response overwrites a later human save/publication; and a late Create callback can erase a different brand's newer draft. P2 covers pending/unsaved edits, old-brand placeholder rows, publication goals, queued AI allowance/date enforcement, non-atomic AI writes and production varchar errors, stored provider-error disclosure, time-zone disagreement, inactive team seats, phone focus, document language and Plan layout shifts. Further source-only/product decisions concern the invite quota race, Pro's location promise, visual approvals and synchronous AI request latency.

Validation on pinned PHP 8.5.12: existing Content/ContentCalendar feature + unit suites **541 passed / 3,524 assertions on SQLite**, and **541 / 3,524 on PostgreSQL 18.3** built from all migrations. TypeScript passes; Content/shared-workspace Vitest **1,284 tests / 131 files** pass. Private PostgreSQL audit reproduction run **34 checks / 221 assertions** (12 audit cases, 22 inherited module cases) confirms current unsafe behaviors; do not misread these passing proofs as repaired product tests. Seven actual-React deferred-response browser cases reproduce with zero page errors. The PostgreSQL brief-length proof used real column constraints and production-like autocommit behavior in the disposable database.

All six live Content areas were inspected, plus real post controls, Generate configuration, Help/settings, language changes, signed-out protection, 1440px and 390px views. No real AI generation, email or social message was sent. The live owner session is restored to FDS Cards, English, Light, Week on `/content`, no post panel. Chrome DevTools' native language interaction stalled; the browser was recovered through its DOM control and the restored state was verified. A brief native-computer fallback could not inspect the minimized audit windows; no native app state was changed.

Observed live: bootstrap uses UTC/no explicit venue zone while the clock banner resolves Europe/Riga from the location. Manual styled phone focus escapes behind the post panel. UI translation changes do not update html lang. Two Plan traces at 1440×1000, unthrottled/CPU1x: LCP 928/881ms and CLS0.30/0.30. English Strategy's Lighthouse snapshot scored Accessibility100/BestPractices100; this does not clear the manual accessibility findings.

Private fixtures/logs/data remain in `E:/Hexa-Tech-audit-content-20261113/`. Owned Vite fixture port5187 and isolated PostgreSQL port54513 are stopped; no customer database was used. Curated screenshots and metadata are in `docs/audits/2026-11-13-content-prelaunch-evidence/`. Unrelated owner PDFs/videos/logos/plugin ZIPs and `public/alexa-skill-assets/` remain untouched.

Fetched `origin/main` during review: `99e004ee2a776cc191e6fba41813f0f15bb234c0`. The cited Content/subscription/team/package files match it; shared main-only differences were unrelated CRM functionality. This audit does not establish that SHA as the exact deployed build and does not replace the source-patch deployment recipe or establish a new code-release baseline. For the preceding production receipts, setup and CRM email history, read [11 November's handoff](2026-11-11-hexatech-handoff.md), including its 12 November appendices.

Next work is implementation of the audited repairs, followed by the complete source-patch release checks and the remaining safe real-provider/queue/billing acceptance journeys listed in the audit. No repairs have yet been shipped from this audit branch.

## Content launch final-review repair, feature source only

The implementation branch `feature/content-launch-20261113` in `E:/Hexa-Tech-content-launch-20261113`
received the combined final-review fixes I1-I3 and M1-M4 after `7a5751220b92cc915a421c936d88325522614f0b`:
legacy version/repeat queue continuation, pending Duplicate draft retention, viewed-revision checks on both manual
mark actions, exact optional-total image accounting, clean retained planning-zone refresh, normalized export refusal
observation, and model-specific query types. The current Content runbook documents the contracts. Mark ready and
Mark published now require the complete viewed `updated_at`; stale authorized requests return 409 without mutation.

Validation receipts and per-finding dispositions are in `.superpowers/sdd/2026-11-13-content-launch/final-fix-report.md`
and the owned external evidence directory. These are source-readiness receipts, not production deployment evidence.
The root executor owns the scoped rereview, isolated source-patch integration with newer main, artifact gates,
deployment and live checks. No provider, real mail or production data was used in this repair wave.

## Content loading follow-up, feature source only (16 November 2026)

The released dense Plan exposed a remaining F17 gap at 1024 x 900: the document stretched the sidebar to
1400px, moved its footer below the viewport, and late platform chips moved the existing filter controls. The narrow
follow-up keeps Content's rail within the viewport, scrolls navigation separately from footer menus, reserves a
horizontal platform strip independently of the other controls, and gives translated figures their own header row.
The shared frame's `navScroll` overflow/title fallback is optional and enabled by Content only; sibling defaults
are pinned by compatibility tests. All platforms remain reachable through keyboard focus, horizontal wheel and touch.

Actual-component local browser evidence: all 270 layout checks across five locales, both themes and three widths
passed, including short full/slim rails and unclipped footer menus. Delayed-data CLS is zero at 1024 and 1440;
390px ranges from 0.000129 to 0.000178. The original combined 110 draft/work/collaboration/campaign checks also pass
unchanged. Source readiness, exact reproduction/fixture assumptions, commands and failed resource-limited attempts
are recorded in the ignored `.superpowers/sdd/2026-11-13-content-launch/task-11-report.md`.

This is feature-source verification only. The root executor owns the fresh scoped review, current-main source patch,
artifact checks/build, deployment and authenticated live confirmation. No production operation, provider call or
customer message was performed by the layout implementer.

### Large-count loading repair (16 November 2026, feature source only)

The retained12345-count French phone case exposed another20px loading shift in the wrapping figures sentence.
Plan now draws the same full localized labels and values as compact definition pairs (two columns on phones,
four otherwise). A broader count matrix also exposed Key dates wrapping below a large EN/RU phone backlog;
its phone control row is now present before the count arrives. No guessed header height or clipped values.

Fresh source browser evidence: canonical270/270; large-count280/300 across30 cases, with all30 new
header/downstream/value checks and all80 phone checks passing, phone CLS0, no runtime errors. The20 failures
are the explicitly retained Minor desktop horizontal Status/Unscheduled shift25.515625px at1024/1440 across
five locales/both themes; no vertical geometry changes. Large mode is `CONTENT_LAYOUT_COUNTS=large` on the
same layout runner. Detailed source/static receipts and intermediate RED/invalid attempts are appended to
`.superpowers/sdd/2026-11-13-content-launch/task-11-report.md`. Original110 is unchanged; root owns its fresh
integrated-artifact repeat, full frontend/build, scoped rereview, deployment and live checks. No production action.
