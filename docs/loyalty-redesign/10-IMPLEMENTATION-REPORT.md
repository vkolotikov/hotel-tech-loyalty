# Overview implementation report

## Result

- **Implemented:** the Overview milestone at `/loyalty/overview`, with responsive desktop/phone layouts, real read adapters, permissions, details, period selection, activity filters, recovery and existing workflow destinations.
- **Branch:** `feature/loyalty-overview-20261027`; reviewable, uncommitted source changes.
- **Latest repository checked:** `origin/main` at `dbf458020537605b529dfe19bccd9035811f8bfc`, including the 27 October handoff and release 11. A final `git ls-remote origin refs/heads/main` returned the same revision.
- **Specification followed:** documents 00–09 and `2026-10-27-hexatech-handoff.md`. The old local voice-assistant branch and unrelated files remain intact.
- **Verification:** 5,538 frontend tests; 575 distinct LoyaltyWorkspace tests plus 51 AdminAccess tests; 20 browser scenarios. Build, TypeScript and scoped ESLint passed.
- **Blocked work:** none for the defined Overview scope. Unsupported product semantics and verification limits are listed below.
- **Deployment:** none. No merge, push, production transactions, migrations, dependencies or production configuration changes.

## Source mapping

| Requirement | Actual source | Confirmed semantics and integration |
|---|---|---|
| Workspace / authorization | `LoyaltyAccess`, `AccessMap`, `workspace:loyalty`, `LoyaltyProvider` | Existing staff/workspace middleware remains authoritative. Metrics and activity require Insights permission. All reads use `brand_id=all`. Client query keys include organization, staff and capabilities. |
| Member total / joined | `LoyaltyMember`, `InsightsPeriod`, `OverviewRead::metrics` | Current total includes retained inactive/anonymized member rows, matching Insights. Joined uses `joined_at`, falling back to creation time. |
| Points available | `LoyaltyInsights` semantics; `LoyaltyMember.current_points` | Sum active members' current balances, including negative corrections and points awaiting expiry sweep. UI says “Current recorded balances”; it does not equate this with qualification or cash. |
| Reward / benefit completion | `RewardRedemption`, `BenefitEntitlement` | Only currently fulfilled records with `fulfilled_at` in the interval count. Pending/approved/cancelled records do not. Existing Insights redemption charts use request creation time, so definitions explain why totals can differ. |
| Offers | `SpecialOffer`, `MemberOffer` | Current offers require active flag, venue-date validity and remaining global cap. Usage requires recorded `used` status and `used_at`. No inference from names or toggle alone. |
| Visits | `tier_qualification_counts` | Recorded qualifying visits, excluding reversals; venue day and recorded timestamp bounded. This is the existing qualification source, not a new raw scanner metric. |
| Request aggregation | `RequestQueue`, `RewardRedemption`, `LoyaltyAccess::REDEEM` | Benefit waiting/eligible/approved items; pending rewards only for staff allowed to redeem. Full SQL counts; oldest three from bounded candidates, deterministic timestamp/source/ID ordering. Failed aggregation fails the module. |
| Configuration checks | `TierAdvice::read`, `ProgrammeAdvice::for` | Existing rules, stable keys and editor destinations. Manual/invitation levels excluded from duplicate threshold errors. No discount-title parsing or wallet-wide failure. |
| Setup | `SetupProgress`, `ProgrammeOptions` | Seven recorded checklist facts; existing four-step wizard entry. No invented draft/resume. Existing members, rewards, scans, tiers, offers, visits or services prevent a legacy program being mistaken for an empty new workspace. This does not mark its wizard complete. |
| Program / preview | `ProgrammeOptions`, `AppLook`, tier/reward/benefit models | Actual rate, venue currency, qualification basis, expiry and active catalogues. Clearly illustrative membership/balance, no pass/member creation or claims. Purchase earning remains labeled off when disabled; spend thresholds include currency. |
| Activity | Points transactions, fulfillments, qualification counts, member joins, `TierAssessment`, used offers | Up to 20 from each relevant source, merged to newest 20. Eager member/reward reads; no client fetch-all. Points reversals and future timestamps excluded. |
| Routes / exact records | Existing route destinations, `RequestController`, `RedemptionController` | Optional validated `request=<id>` selection in each original queue, scoped and revalidated even if status changed. Missing/foreign records return 404. Original mutation handlers remain unchanged. |
| Theme / locale / utilities | `useLook`, `FrameFooter`, `PhoneMenu`, `LoyaltyFind`, existing formatters | Light/dark/auto, all five languages, account/help/full admin, search and Scan retained. Currency is displayed using existing formatting, never converted. |

The new endpoint is `GET /api/v1/admin/loyalty/overview/{summary|checks|metrics|queue|activity}`. Each module returns scope, actual as-of time, venue interval and data, with `private, no-store`. Summary/checks/queue cache keys are independent of period; metrics/activity keys include their filters. Outages may retain only same-scope authorized data, labeled with the oldest displayed successful timestamp. Denied reads are purged; identity changes cannot reuse previous results. Reads refresh on mount/focus and every 60 seconds.

Intervals preserve Insights starts: 30 venue calendar days including today; 13 Monday-based weeks for `90d`; current calendar month plus 11 preceding months for `12m`. Each module has one exclusive UTC as-of end, excluding future events. “Last 90 days” therefore retains the existing report convention rather than introducing another calendar definition.

## Design evidence

Connected Figma inspection used actual screenshots and high-fidelity node context, not the prose brief alone. Inspected final nodes: **29:365–29:386, 38:2340–38:2341, 40:2769–40:2775, 44:2997–44:2999**, plus control/recovery board **29:389**. No design-file edits.

- [Side-by-side comparison](evidence/comparison.html)
- Desktop: [Figma OV-01](evidence/figma-desktop.png), [rendered 1440 viewport](evidence/desktop-1440.png)
- Compact: [Figma OV-22](evidence/figma-compact.png), [rendered 1024](evidence/layout-1024.png)
- Phone: [Figma OV-24](evidence/figma-mobile.png), [full composition reference](evidence/figma-mobile-full.png), [rendered 390](evidence/mobile-390.png)
- Details: [program](evidence/desktop-program.png), [issues](evidence/desktop-issues.png), [preview](evidence/desktop-preview.png), [definitions](evidence/desktop-definitions.png), [both queues](evidence/desktop-queues.png)
- Phone interactions: [program](evidence/mobile-program.png), [period](evidence/mobile-period.png), [navigation](evidence/mobile-menu.png)
- Other evidence includes non-points modes, all five locales, first setup, no members, partial errors, offline, permission removal, long content and zoom-equivalent layout.

Measured geometry retains the 232px sidebar, 72px desktop header, 32px content padding, 206px example hero, 132px metrics, 44px buttons and 24px lower-column gap. Drawers are 560px; preview is 840 × 900 within the viewport; phone details fill the viewport. At 390px attention precedes the summary, glass decoration is removed and metrics stack. At 1024px the sidebar remains and lower panels stack. Intermediate 320/768/844 widths have no horizontal page overflow.

Local Poppins 400/500/600 fonts load successfully, with their OFL license. The 24 Figma SVG assets are stored verbatim. The external Code Connect `figma/sds` Button is not a dependency here; Overview composes the existing workspace Button.

### Deliberate differences

- One verified warning in the shared fixture, instead of Figma's two: the “10%” name is not evidence of an incomplete automatic delivery rule.
- Actual workspace identity replaces the demo badge and unsupported workspace picker. Existing account utilities remain functional.
- Absolute localized venue timestamps use the application's formatter. Recorded balance wording, detailed definitions and qualification units reflect verified semantics.
- The preview is an explicitly illustrative read-only composition from configuration, not a live member account or a claim simulator.
- Captions use at least 12px. The glass eyebrow uses primary text after the secondary color measured 4.32:1. Light account controls receive appropriate light-surface tokens. Final sampled text contrast ranges from 4.74:1 upward.
- Poppins does not contain Cyrillic; Russian glyphs use the existing “A Text” fallback. This is a documented font-coverage limit.
- Panels grow for translated/real content; the page is not forced into Figma's fixed artboard height. Compact evidence retains the 90-day selection from the interaction test.

## Changed paths

| Path(s) | Purpose / impact |
|---|---|
| `app/Services/Loyalty/Overview/{OverviewRead,OverviewPeriod}.php` | New read-only aggregates and calendar adapter. Existing economic/qualification writers untouched. |
| `app/Http/Controllers/Api/V1/Admin/Loyalty/OverviewController.php`, `routes/api.php`, `app/Support/AdminAccess/AccessMap.php` | Scoped GET module route and access classification. |
| `RequestController.php`, `RedemptionController.php`, `app/Services/Loyalty/RequestQueue.php` | Optional exact-record reads; original filtering when absent and existing actions retained. |
| `frontend/src/loyalty/overview/` | Shell, semantic page/details, independent queries, URL state, accessibility, local assets/fonts and four focused unit tests. CSS is scoped under `data-loyalty`; Overview tokens/classes do not restyle other section bodies. |
| `LoyaltyApp.tsx`, `LoyaltyShell.tsx`, `shell/areaOf.ts` | New route/navigation; original Members entry and scanner door layout retained. |
| `loyalty/lib/api.ts`, `requests/RequestsPage.tsx`, `rewards/{api.ts,RedemptionsTab.tsx}` | Exact request selection, clear-to-all controls and fresh selected-record queries. |
| `loyalty/i18n/index.ts`, five `overview.*.json` files | Complete en/ru/de/fr/es Overview wording and matching interpolation; Spanish uses usted. |
| `tests/Feature/LoyaltyWorkspace/OverviewTest.php` | 11 HTTP/database tests for the new integration. |
| `frontend/e2e/overview.browser.js` | Reusable connected-Playwright harness; deterministic HTTP fixtures live only in this test. |
| `frontend/src/portal/pages/book/payReturnState.ts` and its two importers | Renames the unchanged helper formerly named `payReturn.ts`, which collided with `PayReturn.tsx` on Windows. Git blob hashes are identical. |
| `frontend/src/pages/BookingExtras.test.tsx` | Existing amount assertions now accept locale decimal comma or dot. Production currency behavior unchanged. |
| This report and `evidence/` | Comparison images, browser results and measured contrast. |

Generated `frontend/dist`, `public/spa` and SPA shell outputs were validated by the build, then restored/removed from the source change set. Unrelated PDFs, plugin archives, Alexa assets and the supplied specification files were preserved.

## Verification

| Check | Outcome | Evidence / limit |
|---|---|---|
| `cd frontend; npx tsc -b` | PASS | Windows filename collision resolved without logic changes. |
| `cd frontend; npx eslint src/loyalty` | PASS | Final Overview source included. |
| `cd frontend; npx vitest run` | PASS — **384 files, 5,538 tests** | Actual final full-run summary; no plannerMeta failures in this checkout. |
| `npx vitest run src/loyalty/overview/overviewMath.test.ts` | PASS — **4 tests** | Query identity, URL filters, denied/stale cache policy, five-locale key/interpolation parity. |
| `cd frontend; npm run build` | PASS | TypeScript + Vite + postbuild. Existing chunk-size/Browserslist warnings are non-fatal. |
| Pinned PHP PHPUnit `tests/Feature/LoyaltyWorkspace/` in four scoped batches | PASS | 182/135/158/129 executions, 5,774 assertions. Filters overlap 30 cases; enumeration confirmed **574/574 distinct tests** covered. |
| Final pinned PHP PHPUnit `tests/Feature/LoyaltyWorkspace/OverviewTest.php` | PASS — **11 tests, 116 assertions** | Includes one additional legacy-program case after the full batches; **575 distinct Workspace cases covered overall**. |
| Pinned PHP PHPUnit `tests/Feature/AdminAccess/` | PASS — **51 tests, 3,054 assertions** | Access map/classification and existing access decisions. |
| Connected Playwright, `frontend/e2e/overview.browser.js` | PASS — **20 scenarios, no page errors** | [Results](evidence/browser-results.json). A corrected account-name locator was rerun for its scenario; expected simulated HTTP failures are not console-clean claims. |
| Figma visual comparison | VERIFIED | Desktop, compact, phone and detail screenshots inspected side by side; deliberate differences above. |
| Existing route smoke checks | PASS | All 13 original primary/setup/guide destinations load their original shell with Overview navigation. Controlled error responses exercise safe recovery on untouched bodies. Both queue destinations additionally use successful record fixtures and original decline/cancel dialogs. |
| Security / freshness | PASS | HTTP tenant/capability tests, foreign IDs, invalid periods; browser denied reads, removed permission, identity switch during fetch, late period responses and GET-only request assertions. |
| Accessibility | VERIFIED within tested scope | Keyboard trap, Escape, return focus, native modal inertness, 44px primary targets, reduced-motion CSS, labeled recovery, translations, long content, 720-CSS-pixel/2x zoom-equivalent layout and [contrast samples](evidence/contrast-samples.json). No screen-reader, real browser-zoom or cross-browser certification claimed. |
| `git diff --check` | PASS | Generated build files excluded from the final change set. |

Backend command form (PowerShell, foreground, scoped):

```powershell
$env:OPENSSL_CONF = 'C:/wamp64/bin/php/php8.4.20/extras/ssl/openssl.cnf'
& 'C:/wamp64/bin/php/php8.4.20/php.exe' -d max_execution_time=0 vendor/phpunit/phpunit/phpunit tests/Feature/LoyaltyWorkspace/OverviewTest.php --colors=never
& 'C:/wamp64/bin/php/php8.4.20/php.exe' -d max_execution_time=0 vendor/phpunit/phpunit/phpunit tests/Feature/AdminAccess/ --colors=never
```

For the broader Workspace run, sorted test filenames were grouped 16/16/16/15 and passed as `--filter '(?:ClassA|ClassB|...)::'` against the same scoped directory. The listed test names were compared with the union of filtered names. An earlier monolithic attempt hit the existing `MemberImportRun::set_time_limit(300)` reset; it is not counted as a pass. Pinning OpenSSL configuration resolved local wallet certificate generation. No production PHP configuration was changed.

Browser checks run against local Vite at port 5173 through the connected Playwright tool, with the harness filename. Every HTTP fixture is intercepted within that test page; the production API adapter has no fixture fallback. The browser and Laravel database tests are separate layers; no authenticated production browser data was used.

## Acceptance tracking

| IDs from 07 | Status | Evidence |
|---|---|---|
| V01–V06 | VERIFIED | Exact desktop/compact/phone frames, full scroll composition, 560px drawers and centered preview; screenshot links above. |
| V07–V12 | VERIFIED | Loading/error/restricted/empty/non-points screens; themes/locales, 320/768/844/1024 widths, long names/large count, collapsed menu and focus/busy treatments. |
| B01–B09 | VERIFIED | Independent module failure/retry, no false zeros/all-clear, simulated offline state with cached timestamp, explicit denial and removal of previously visible metrics. |
| B10–B13 | VERIFIED | Truthful setup entry, actual checklist, configured-zero members, valid empty filtered/period activity. Legacy offers/visits/services without a wizard/tier ladder covered by HTTP tests. |
| B14–B20 | VERIFIED | Period/filter retained across details; focus restoration; late-response cancellation; scope change; dynamic definitions/configuration and read-only preview. |
| B21 | VERIFIED at read/refresh contract | HTTP checks change after persisted tier updates; Overview refetches on return/mount/focus. No live editor changes were made solely to test the warning. |
| B22–B26 | VERIFIED | Exact queue IDs revalidated, state-changed records/404, both queues, mobile navigation, real Find endpoint, direct URLs and browser history. |
| D01–D07 | VERIFIED | Period/current separation, venue DST/month-end, fulfilled versus pending/cancelled, reversed visits/points, expired/capped offers and missing source returning failure. |
| D08–D14 | VERIFIED | Existing qualification ladder/manual-level semantics, no title-based discount inference, optional wallet separation, oldest three/full count/stable ties, permissions and tenant boundary. |
| D15 | VERIFIED by bounded queries/source review | Aggregate counts, per-source limits and eager loading. No production-scale load benchmark or new database indexes claimed. |
| D16 | VERIFIED | Failed source is an error; fixtures exist only in tests. |

## Remaining dependencies and limits

| Item | Current honest behavior | Later action, if desired |
|---|---|---|
| Saved wizard draft / exact resume | Not available in current source. Overview links to existing setup/checklist; never claims “3 of 4 saved.” | Separate wizard persistence specification. |
| Global points-mode switch | Not available. Display mode derives from actual configured mechanics: points, then offers, visits, services. | Explicit product/financial specification before introducing mode switches. |
| Shared advice in non-points configurations | Existing ProgrammeAdvice may still warn that no points are earned or no points reward exists. Overview preserves the same shared advice instead of inventing a second all-clear engine. | Review the shared advice contract for intentional non-points programs in a separate change. |
| Automatic “10% reward” delivery diagnosis | Not safely inferable from a title. Only structured existing checks are surfaced. | Define a delivery contract if this additional diagnostic is wanted. |
| Workspace switching | No verified switcher is introduced. Real context is shown; auth/scope changes clear data correctly. | Reuse a future supported workspace selector. |
| Font coverage | Russian uses existing Cyrillic fallback; Poppins assets cover supported Latin text. | Choose a licensed matching Cyrillic font if visual parity there is required. |
| Runtime verification breadth | Chromium fixture browser + Laravel test database; no live transactions, screen-reader audit, other browser engine or production query benchmark. | Staging/device checks under the normal release process. |

These are explicit source limitations or validation limits, not fabricated successes. No missing access or information currently blocks the authorized Overview implementation.

## Compatibility and rollout

`/loyalty` remains Members; profiles, import, duplicates, requests, program children, options/wizard, rewards children, events, campaigns, Insights, Scan/door mode, Card & app and Guide retain their routes and implementations. Settings/account/locale/theme/search utilities are reused. Existing award, redeem, approval, fulfillment, campaign, upload and setup-apply writers are unchanged.

No migration or new package is required. Reverting the new route, adapters and scoped components restores the old navigation; optional exact-request handling is backward compatible. Deploy only through the repository's normal reviewed release process. This task did not deploy.

The next redesign milestone remains Members, after Overview review; sidebar links do not imply those other bodies were redesigned.
