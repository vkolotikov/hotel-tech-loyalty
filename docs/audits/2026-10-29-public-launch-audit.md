# Public-launch audit — 29 October 2026

**Recommendation: hold the public launch.** The application has substantial working functionality and unusually broad regression coverage, but the review reproduced defects in tenant identity, account recovery, ownership, refunds and loyalty balances. These require correction before public onboarding. This is a review, not an implementation or deployment: no application code, dependency, migration, production setting or live customer record was changed.

Audit target: source `b13381c795d2c5b66e4c9aa1650b97b1c61f2ed5`, on `audit/public-launch-20261029`; fetched production reference `origin/main` was `16788ad8cad9ecf0886c28c2ecd0997f40a725d9`. The latest handoff records that deployment as the mobile release. Source parity was checked; generated artifacts and handoff/evidence differ. The next deployment's source-patch baseline remains `e4f43246f5ec0195cbb36c50c861afe744437790`. This audit does not authorize a new production deployment.

The review combined route/configuration and writer tracing, all existing PHP feature/unit scopes, the complete frontend suite, a production bundle build, browser interactions, dependency scans and isolated defect reproductions. Three parallel reviewers covered Loyalty, Booking/Portal/Appointments and platform security, followed by an independent review of the strongest findings.

## 1. Fix before public launch

P1 means a high-priority launch blocker for the affected feature. Preconditions matter: these are not claims that every normal transaction fails or that a production compromise occurred. Detailed sources, reproduction steps and acceptance recommendations are in the linked appendices.

| ID | Finding and demonstrated consequence | Required correction | Evidence |
|---|---|---|---|
| A01 | **SaaS login can authenticate the wrong tenant.** With the same email in local organization A and a valid SaaS identity for B, fallback login reused A's user, changed A's password and returned A's identity/token. Valid SaaS credentials are required; this is not arbitrary takeover by entering an email. | Resolve verified identity by immutable subject and organization/type; never update another tenant's password. Cover staff/member and multiple-organization email collisions in login, invitation and recovery. | Full login endpoint with isolated SaaS HTTP fixture; `AuthController.php:416,430,441`. [Platform report](2026-10-29-public-launch/platform.md). |
| A02 | **Smoobu integration tests accept arbitrary server destinations.** Tenant-configured base URLs can target internal/arbitrary hosts. If a platform fallback key is configured, the request forwards it. A transport mock confirmed the outgoing destination/header; no real credential or internal service was contacted. | Pin approved API origins, constrain outbound destinations and remove platform-key fallback from tenant-controlled endpoints. | Endpoint + mocked transport; `SettingsController.php:724,776,783,787`. [Platform report](2026-10-29-public-launch/platform.md). |
| A03 | **Re-inviting the sole owner can remove ownership.** A manager re-invited the current owner's email with role Manager; the organization was left with zero active owners, even with access enforcement enabled. | Separate invitation/resend from role changes; apply the same transactional last-owner invariant to every writer. | Real endpoint, fake mail; `TeamController.php:224–245`. [Platform report](2026-10-29-public-launch/platform.md). |
| A04 | **Password recovery does not invalidate existing sessions.** After a successful code reset, the old bearer token still accessed `auth/me`; default token expiration is unlimited. | Revoke prior sessions on recovery and define claim/activation policy. Regression: old token must receive 401. | Real reset/token endpoint; `AuthController.php:2458–2475`, `config/sanctum.php:45`. [Platform report](2026-10-29-public-launch/platform.md). |
| A05 | **Logout/account changes do not synchronize other open tabs.** Tab A kept a member profile visible and its UI/in-memory state remained signed in after logout in B. After B signed in as another user, A retained the old in-memory identity while API requests would read the new shared token. | Broadcast identity changes; clear cached queries and sensitive state in every tab before binding another identity. Test logout, expiry, account switching and open dialogs. | Actual browser/auth store; `authStore.ts:108–149`, `lib/api.ts:34–35`. [Browser evidence](2026-10-29-public-launch/browser-and-quality.md). This is stale-data/session confusion, not a demonstrated server tenant-scope bypass. |
| A06 | **Reward reversal followed by cancellation refunds points twice.** Starting at 1,500, redeem 500, reverse that debit, then cancel the pending reward: current/lifetime/qualifying totals become 2,000. | Coordinate ledger reversal and redemption state; distinguish an already-reversed debit from missing legacy history. Preserve earned/qualifying totals. | Two desired-invariant regression failures; `RedemptionActions.php:80–95`, `MemberLedger.php:64–85`. [Loyalty L1](2026-10-29-public-launch/loyalty.md). |
| A07 | **Brand-restricted reward cancellation corrupts qualification and stock.** A staff member restricted to brand B cancels an organization-wide brand A redemption through the normal workspace URL. Current balance is restored, but lifetime/qualifying points rise by 500 and stock is not returned. | Decide the cross-brand policy, then load the owning debit/reward consistently under explicit tenant constraints or reject before any mutation. | Normal `brand_id=all` plus real brand assignment; `RedemptionActions.php:75,82–95`. [Loyalty L2](2026-10-29-public-launch/loyalty.md). Conditional on multi-brand/restricted staff. |
| A08 | **Pending/failed card refunds are recorded as completed.** Returned Stripe refund objects with `pending` or `failed` status produced completed-refund amounts/status in Appointments; the cancellation helper shares the problem. | Persist the provider refund lifecycle, reserve pending amounts, reconcile success/failure idempotently and display the actual outcome. | Mocked provider + real HTTP/helper probes; `Appointments/Money/AppointmentMoney.php:165–176`, `ServiceBookingRefund.php:70–91`. [Booking B1](2026-10-29-public-launch/booking-portal.md). |
| A09 | **An unknown refund outcome can lead to an unintended additional refund.** If a provider accepts €25 but the reply is lost, the UI reports failure. Editing the retry to €30 creates a different provider key; the app records €30 while the provider may have returned €55. | Persist an operation before calling the provider; preserve its identity during an unknown outcome and reconcile before a new amount is allowed. | Transport failure simulated; no live money moved. `AppointmentMoney.php:163–168`, `RefundForm.tsx:49–56`. [Booking B2](2026-10-29-public-launch/booking-portal.md). |

Stripe distinguishes pending, failed and completed refunds; creating a refund is not itself proof of completed repayment. The provider lifecycle supports A08's expected behavior. [Stripe refund object](https://docs.stripe.com/api/refunds/object), [refund lifecycle](https://docs.stripe.com/refunds).

## 2. Other functional corrections

These are P2 unless noted. Resolve them before offering the affected configurations, even if a narrower pilot temporarily excludes those features.

| ID | Observed issue | Recommended result / acceptance check |
|---|---|---|
| A10 | Managers can create missing integration settings despite owner-only policy; a missing `twilio_auth_token` is stored as `general`, permitting later manager writes. | A fixed key/permission registry must govern create and update, irrespective of seed rows or mutable DB grouping. [Platform report](2026-10-29-public-launch/platform.md). |
| A11 | Replaying a committed 150-point deduction from a starting balance of 200 returns insufficient-points 422 instead of the original success. Both controller and service check balance before replay lookup. | Same operation/key returns its committed result; genuinely new operations still validate under lock. [Loyalty L3](2026-10-29-public-launch/loyalty.md). |
| A12 | Award replay preserves the correct balance but inserts two member inbox notifications. | Side effects must be keyed to the committed transaction; one operation produces one notice. [Loyalty L4](2026-10-29-public-launch/loyalty.md). |
| A13 | A brand-restricted manager sees a history line with Reverse enabled, but the writer returns 404. | Displayed capability and writer policy must agree. [Loyalty L5](2026-10-29-public-launch/loyalty.md). |
| A14 | In a non-windowed/lifetime programme, a tier hold expired four days earlier is skipped by reassessment and can remain indefinitely without other member activity. | Reconcile all unprocessed expirations, including after downtime/restores; add a recovery command. [Loyalty L6](2026-10-29-public-launch/loyalty.md). |
| A15 | Cancelled email campaign status is overwritten with Sent when its final in-progress chunk finishes. | Conditional completion must preserve Cancelled. Finishing the current chunk is already documented behavior and is not the defect. P2/P3 operational consistency. [Loyalty L7](2026-10-29-public-launch/loyalty.md). |
| A16 | A two-recipient email chunk sends both messages when only one hourly send remains. A 100-recipient chunk can exceed the remaining limit by up to 99 with one worker. | Restrict processing to the available allowance and resume the remainder correctly. [Loyalty L8](2026-10-29-public-launch/loyalty.md). |
| A17 | Stay checkout reads `quote.total` while the API returns `gross_total`; its fallback also ignores extra multipliers and combination rooms. Exact renderer: €205 sidebar versus €230 payment; combination €5 versus €430. | Use one authoritative quote and line-item contract. No incorrect server charge was demonstrated. [Booking B3](2026-10-29-public-launch/booking-portal.md). |
| A18 | PMS sync marks a booking checked-in by arrival date, denying cancellation at 09:00 despite a configured 15:00 deadline. | Use actual check-in state and venue-time cancellation rules. [Booking B4](2026-10-29-public-launch/booking-portal.md). |
| A19 | Stay admin totals/refund hints label non-EUR amounts as euros. | Carry booking currency through every formatter, KPI and refund field; preserve historic currency. Source-confirmed, non-EUR UI not simulated. [Booking B5](2026-10-29-public-launch/booking-portal.md). |
| A20 | “Any staff” service booking can choose differently priced staff again after card authorization if the original staff member becomes busy. Confirmation then rejects the amount. | Pin staff/price in a short-lived quote/hold and provide safe reprice/authorization recovery. Source/runbook-confirmed concurrency scenario; not newly reproduced end to end. [Booking B6](2026-10-29-public-launch/booking-portal.md). |
| A21 | Public booking failure responses can include raw database/provider exception text. | Stable public errors with a reference ID; detailed diagnostics only in private logs. Source-confirmed; no production error induced. [Booking B7](2026-10-29-public-launch/booking-portal.md). |
| A22 | Dismissing the industry mismatch banner throws “Rendered fewer hooks than expected.” | Keep hooks before early returns; test display, dismissal, hydration and Industry settings navigation. Actual component browser reproduction; an app boundary may show fallback instead of the isolated root's blank result. [UI report](2026-10-29-public-launch/additional-ui.md). |
| A23 | Chat conversation loading→loaded logs a React lifecycle invariant error because hooks follow an early return. | Split loaded content or make hook order unconditional; test delayed load and conversation switching. The transcript still rendered in the probe; a fatal chat crash was not demonstrated. [UI report](2026-10-29-public-launch/additional-ui.md). |
| A24 | Engagement's “Open CRM card” links to `/guest/:id`; the router defines `/guests/:id`, with unmatched routes falling back to Home. | Use the canonical route helper and add navigation coverage for a linked guest. Source: `EngagementDrawer.tsx:437`, `App.tsx:375,432`; no matching web redirect found. |

## 3. Dependencies and release quality

Fresh production dependency scans flagged **12 Composer packages** and **5 npm packages** (npm: four high, one moderate). Counts describe affected packages, not proven exploitable app defects. Locked examples: Laravel 13.4.0, Guzzle 7.10.0, Symfony Mailer/Mime 8.0.8, CommonMark 2.8.2, React Router 7.13.1 and Axios 1.13.6.

Treat framework/mail dependency remediation as a prelaunch task. The current app accepts user-supplied mail addresses with the default Laravel `email` rule and sends to them, matching a relevant exposure described by the Laravel advisory. No transport exploit was attempted. Upgrade affected framework/mail packages together and verify validation, verification mail, reset and campaign flows. [Laravel's CRLF advisory](https://github.com/laravel/framework/security/advisories/GHSA-5vg9-5847-vvmq).

Do not report scanner headlines as confirmed app exploits. React Router's cited server RCE excludes BrowserRouter applications such as this SPA. Its navigation advisory still warrants patching and checking external-input redirects. TokenGuard, local filesystem temporary URL and request-driven relation-inclusion Laravel advisories did not have a reachable application path identified here. Axios Node HTTP/proxy findings likewise do not automatically describe the browser client. [React Router applicability](https://github.com/advisories/GHSA-49rj-9fvp-4h2h), [navigation advisory](https://github.com/advisories/GHSA-wrjc-x8rr-h8h6). See the platform appendix for detailed triage.

Whole-frontend ESLint is **not green: 1,270 errors and 38 warnings across 148 files**. Most are existing `any` usage (1,140), not runtime failures. The conditional-hook findings above were investigated individually. WalletConfig's helper name causes a hook lint violation, but its calls are currently unconditional/fixed-order; no runtime failure was established. Establish a maintained lint baseline, then eliminate correctness rules first rather than suppressing everything.

The fresh production build passes but emits a size warning: the main JS chunk is approximately **1,054 kB / 344 kB gzip**, and Loyalty approximately **2,208 kB / 653 kB gzip**. Loyalty routes are imported together. Route splitting and a measured low-end-phone/slow-network budget are worthwhile before scaling mobile use. These are bundle sizes, not measured production load times.

## 4. Configuration and operational launch gates

These values and live services were **not verified in Laravel Cloud**. Their absence from this audit is a verification gap, not a claim that production is misconfigured.

| Gate | Evidence required before launch |
|---|---|
| Authorization | Verify `ADMIN_ACCESS_MODE=enforce`; its default is `report`, where some denied role/deactivation decisions are logged but allowed. Exercise owner, manager, receptionist, disabled staff and brand-restricted staff in each workspace. |
| Public error/debug handling | Verify `APP_DEBUG=false`, safe public error bodies, rate-limit behavior and monitoring of repeated auth failures. |
| PostgreSQL/schema | Run the full migrated disposable PostgreSQL test environment, including all seven currently skipped checks and real concurrent booking/reward/payment cases. SQLite fixtures do not prove production locks or migration parity. |
| Scheduler/workers | Demonstrate scheduler freshness, correct queue workers and timeouts, failed-job alerting, delayed campaign execution, tier/expiry catch-up and reconciliation after a restart. |
| Shared locks | Verify cache topology across replicas. Content Brand/Strategy controllers use default cache locks, which default to local file cache; their serialization is not global on separate replicas. |
| Payments/PMS | Controlled provider test: quote→authorize→confirm→webhook→partial/full refund→cancel, lost reply and duplicate/out-of-order callbacks. Confirm Smoobu credentials, room mapping and actual availability. Only Smoobu is implemented; other visible providers are explicitly coming soon. |
| Communications | Verify sender identity, SPF/DKIM/DMARC, bounce/unsubscribe/consent behavior, queue retries and delivery outcomes for email, SMS and push. Audit used fake/array transports only. Twilio token encryption/masking needs review; the current encryption allowlist excludes it. |
| Mobile and cards | Physical Safari/Android camera permission/denial/resume, NFC/USB reader, PWA update/offline, wallet installation/signature and real push. The real QR decoder passed with a synthetic camera stream; that does not prove device hardware. Native app bundles have separately documented stamps/credit/progress limitations. |
| Recovery/operations | Restore rehearsal, rollback/migration recovery, tenant-aware error monitoring, audit-event completeness, support procedures for uncertain payments and unresolved campaign deliveries. No production restore/load test was performed. |

Configuration should explain operational scope accurately: cancellation fees/partial self-cancellation refunds are not implemented; Appointments deposits require the explicit Setup activation stamp; storing credentials for an unsupported PMS is not an operational connection. Currency changes relabel historical loyalty balances rather than converting them. Make those choices clear during onboarding.

## 5. Verification results

| Verification | Final result |
|---|---|
| Frontend TypeScript | Passed (`npx tsc -b`). |
| Complete frontend Vitest | **5,730 passed / 394 files**. The historical planner failures did not occur in this run. |
| Existing PHP feature/unit tests, run in scoped commands | **7,070 passed, 1 failed, 7 skipped; 45,437 assertions**. Pinned PHP 8.4.20, isolated SQLite, fake/array external services. |
| Existing-suite failure | `LandingSlugTest`: preexisting untracked `public/alexa-skill-assets` lacks a reserved landing slug. This user-owned directory was preserved. It is a conditional deployment collision, not a demonstrated production regression. |
| Existing-suite skips | Six `LeadIntakeApiTest` cases need PostgreSQL migration support; one stay booking lock test needs PostgreSQL advisory/row locking. |
| Additional defect probes | **20 tests:** nine deliberately failing desired-invariant Loyalty probes, eleven passing observed-defect platform/booking probes. These establish defects, not fixes; they are excluded from the baseline counts above. |
| Production Vite build | Passed, output isolated outside the repo; generated stats side effect restored to its original version. Size warning noted above. No build artifact was deployed. |
| Browser interactions | **718 passing named checks** across the redesigned workspace, settings and scanning, plus targeted shared-component probes. Detailed counts, failure triage and boundaries are in [browser evidence](2026-10-29-public-launch/browser-and-quality.md). |
| Dependency and whole-app lint | Findings remain as described above; no dependency update or lint suppression was applied. |

All existing test-bearing Feature/Unit directories, top-level Feature/Unit files and top-level Member endpoint tests were included across the scoped runs. This is test-suite coverage, **not** a claim of 100% code coverage or that every possible button/data combination was manually exercised.

## 6. Feature coverage and confidence

| Feature area | Audit evidence | Remaining boundary |
|---|---|---|
| Loyalty Overview, Insights | Browser metrics/periods/filters/chart-table/export/recovery/permission checks; backend calculation suites; desktop and mobile screenshots inspected. | Production data volume and query latency not benchmarked. |
| Members, levels, benefits, import/merge/duplicates | Browser profile/filter/editor/action checks; backend enrollment, ledger, eligibility, import/merge and validity tests. | Cross-action and brand defects A06/A07/A11–A14 remain. |
| Ways to earn, rewards, stamps, credit, referrals | Browser configuration/edit/validation/failure checks plus backend domain suites. | Physical/native client parity and real reward delivery remain outside the local test evidence. |
| Events and requests | Browser create/publish/edit/attendee/cancel/review/fulfilment, empty/error/permission flows; backend capacity/state-transition tests. | PostgreSQL concurrent execution and real notification delivery not established. |
| Campaigns | Browser audience/editor/scheduling/error/responsive checks; backend email/push/SMS/segments/jobs. | Cancel state, partial allowance and unresolved delivery recovery noted; no real campaign sent. |
| Card & app, scanner, mobile web, guided setup/settings | Browser appearance/upload-contract/unsaved-draft/settings, mobile navigation/review sheets, decoder and simulated scan transport checks. | Real certificate upload/device install/NFC/payment hardware not performed. |
| Auth, teams, account, brands, capabilities, billing | Source traces, tenant/role middleware suites and targeted identity/session/invitation reproductions. | Cloud enforcement values, real SaaS subscription lifecycle and cross-tab defect remain. |
| Member portal/native member endpoints | 303 Portal feature tests, 32 Portal unit tests, 55 additional member endpoint tests; booking/consent/deletion/password/card logic reviewed. | Complete real-device journey and native bundle compatibility not verified. |
| Stays, public booking, PMS, payment/refunds | 566 passing Booking feature tests plus one skip, 81 unit tests; refund/cancellation probes and exact checkout renderer execution. | Real provider callbacks, concurrency and affected price/currency configurations require follow-up. |
| Appointments/services/calendar | 408 feature and 39 unit tests; money/scheduling/configuration source review. | Refund findings and any-staff repricing gap remain; no live appointment created. |
| CRM/leads/deals/tasks/planner/reviews/analytics | Existing feature/unit suites, route inventory and selected source checks. | This was not an exhaustive manual click-through of every legacy-admin editor. Broken CRM link identified; Deals Import remains intentionally disabled/coming soon. |
| Chat/engagement/widgets/knowledge/AI | Existing suites, component lifecycle reproduction and route/source review. | Live channels, translation/model output quality and realtime delivery not provider-tested. |
| Content, landing builder/public pages/media | 386 Content feature + 139 unit, 1,735 Landing feature + 118 unit, supporting security/media/slug tests and boundary review. | Multireplica locks, external generation/publishing, full visual reapproval of every template not performed. |
| Integrations, ChatGPT tools, mail, webhooks, audit, PWA | All corresponding existing scoped suites and selected configuration/URL/signature traces. | Real credentials, provider consent, delivery, Cloud topology and operational monitoring remain to verify. |

## 7. Improvement order and release acceptance

1. **Identity and authority:** A01–A05 and A10; integration destination/credential boundaries; relevant dependency updates; verify enforcement/debug configuration. Add regression cases before applying fixes.
2. **Money and points:** A06–A09 and A11–A13; establish transaction/operation identities and reconciliation. Review affected existing records using read-only diagnostics before deciding on any repair; this audit did not establish whether production data is affected.
3. **Promise versus behavior:** checkout totals/currency/cancellation and staff pricing; tier recovery; campaign status/rate limits; hook crashes and broken links. Preserve existing routes and design while correcting behavior.
4. **Operational acceptance:** migrated PostgreSQL tests, controlled provider sandbox journeys, real devices, backup/restore and worker/scheduler evidence. A passing mocked browser suite alone cannot close these gates.
5. **Smoothness and maintenance:** route-level bundle splitting, consistent pending/unknown/failed wording, clear configuration readiness, actionable retry/reconciliation screens, link-contract checks and a sustainable lint baseline.

Release acceptance should include: all P1 cases fixed and tested, affected P2 configurations corrected or explicitly excluded from the release, no unexplained test failures, PostgreSQL skips resolved, and recorded operational/provider/device evidence for enabled features. No improvement in this list has been implemented during this audit.

## Evidence index

- [Platform/security details](2026-10-29-public-launch/platform.md)
- [Loyalty logic details](2026-10-29-public-launch/loyalty.md)
- [Booking, Portal and Appointments details](2026-10-29-public-launch/booking-portal.md)
- [Additional UI findings and business-feature tests](2026-10-29-public-launch/additional-ui.md)
- [Browser and quality-check results](2026-10-29-public-launch/browser-and-quality.md)
- [Independent review and extra test scopes](2026-10-29-public-launch/independent-review.md)
- [Reproduction files and run instructions](2026-10-29-public-launch/probes/README.md)
- [Machine-readable verification summary](2026-10-29-public-launch/verification.json)

Full private logs, screenshots, fixture harnesses, dependency audit JSON and temporary build: `E:/Hexa-Tech-audit-20261029/`. No credentials were printed. Provider outcomes were simulated where stated. Source review can identify supported paths and missing invariants; it cannot certify that an unobserved production configuration or external service is healthy.
