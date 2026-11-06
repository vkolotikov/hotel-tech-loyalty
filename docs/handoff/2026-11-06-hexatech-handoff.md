# HexaTech handoff — 6 November 2026

Read CLAUDE.md and `2026-11-02-hexatech-handoff.md` for the current application, native apps, environment and outstanding operational work. This session changes the Loyalty workspace Insights filters only.

## Insights filters

### Follow-up: aligned inline controls

Owner: align controls, replace comparison with a checkbox, and show member filters in the same row. Branch `feature/insights-filter-alignment-20261106` follows production `de0999437`; the source delta starts at `ce4cbcb35` and includes the previous release-record documents.

- Reporting period, membership level, member status and email offers use equal-height native dropdowns in one desktop row, followed by the comparison checkbox. Tablets use two columns; phones stack the fields. The separate member-filter dialog is removed; custom dates retain their focused window.
- Native options now explicitly use the theme's text and raised-surface colours, fixing the screenshot's light-on-white popup. Checkbox wording is translated in all five bundles. Dates and current-member scope appear below the row.
- Immediate application, rapid-change merging, retained charts during refresh, export protection, chips, resets, collapse preference and URL history remain in place. Browser checks now exercise the inline fields and row geometry.
- Only frontend presentation, fixture checks and documentation change. PHP, APIs, dependencies and database source are unchanged.

Verification and production content evidence will be recorded after the isolated release checks.

### Follow-up: instant filters and compact controls

Owner: make the page more logical and easier to use, improve the filters window/design and apply selections with no Save button. Branch `feature/insights-instant-filters-20261106` follows the first release below; production baseline is `aeda71eeb`. The source delta starts at `4c13cc211` and includes the two subsequent release-record documents.

- Reporting period and comparison stay in a compact toolbar; member level/status/email preferences move to a focused window. There is no Apply, Save or Discard step. Only active member filters become chips, each removable immediately; member-only reset preserves reporting dates/comparison.
- Valid dropdown selections update the report and URL immediately. Custom dates wait 350 ms for complete valid input; closing flushes a valid pending change, while an invalid range retains the previous report. Back/Forward resynchronizes open date fields.
- During refresh, charts remain visible with `aria-busy` and an updating status. Prior data is retained only within the same organisation/staff/permission scope, and export remains disabled until the current response arrives.
- Rapid filter changes merge with the last selection, because Router transitions can defer renders. The browser regression first reproduced a status selection being lost to the following email choice; all selected fields now survive slow in-flight reads.
- No PHP, database, API contract, dependency or shared-workspace change. New words are in all five bundles; desktop and mobile windows retain native controls and focus/Escape behavior.

Follow-up production **de099943778c0ca7c954af82f95679195f697d86**, source patch **4b5e637632a37adf7206ef9035580d5065180bea** from feature source **ce4cbcb35bdeba633d7a07e673d013e0ce903149**, plus its fresh SPA build. **The next source-patch baseline is now ce4cbcb35**, superseding the first release's baseline below. Fourteen allowlisted frontend/documentation files, no deletions; whole source parity passed. Later release-record commits are not the baseline.

Artifact checks: **7,407 PHP passed / 23 existing skips / 78 scoped runs / zero failed**, **5,849 frontend tests / 404 files**, TypeScript, focused Insights ESLint, fresh build, **90 compiled browser interaction checks** and **10 additional localized member/date-window checks**. The PHP sweep used three separate physical worktrees/vendor copies with the correct OpenSSL configuration; each ran 26 disjoint scopes (4,430 / 927 / 2,050 passing tests). No new PostgreSQL run was needed because the PHP/query tree is byte-identical to the already verified production baseline.

Live content verified **6 November 2026, 11:55 Europe/Riga (09:55:18 UTC)**: `index-BFWYm4Ml.js`, `LoyaltyApp-C1yeKncq.js`, `InsightsPage-CAdBCH7k.js`. The live bundles contain `l-in-filter-toolbar`, `l-in-member-filter-button`, Updates automatically and Clear member filters; the report keeps its 401 authentication boundary. Public landing continuity and retired stylesheet 404 passed. Signed-in production UI inspection remains unavailable as explained below; the compiled checks intercept local fixture APIs and block external traffic.

Evidence: `C:/wamp64/tmp/insights-instant-php-{1,2,3}-20261106.log`, `insights-instant-build-20261106.log`, `insights-instant-compiled-20261106/`, `insights-instant-localized-windows-20261106/` and `verify-insights-instant-live-20261106.cjs`. All five languages' member/date windows fit a 390×844 viewport; desktop 1440 and mobile screenshots were reviewed. The two completed PHP-only checkouts and preview processes were removed/stopped. The deployment checkout is removed after live verification; existing user assets and old stopped PostgreSQL directories below remain untouched.

The original release evidence below remains historical.

### First release

Owner: improve `https://loyalty.hotel-tech.ai/loyalty/insights`: controls should act as dropdowns, be easier to use, hideable, and offer more filters.

Feature branch: `feature/insights-filters-current-20261106`, started from current production source `2cc80c492dbc37f482349039d8547fc559633ba4`. The originally open October branch was stale and was not used as a deployment baseline.

- Replaced four dialog-opening imitation dropdowns with native selects and inline custom date fields. Completed-day presets: 7, 28, 90 and 365 days, last calendar month, custom dates.
- Added current member status, email marketing consent and no membership level. Server options are returned by the existing report endpoint. `InsightsAudience` supplies one member population for every metric and both direct and guest-linked booking revenue; legacy money endpoints retain their defaults.
- Apply stages edits; Discard changes leaves the report unchanged; Reset restores the default 28 completed venue days. URL filters support reload and browser Back. The collapsible panel remembers visibility locally and always shows applied scope.
- Every new sentence is translated in all five Insight bundles. No migration, new endpoint, dependency or member write.

Production **aeda71eeb5704af72e7143bdf8fe769293ad2441**, deployed by the isolated source-patch recipe. Source patch **4e3c1cac6**, fresh SPA build **03c0b3d68**, then the Windows-only test-path correction in **aeda71eeb**. Final feature source and **next source-patch baseline: 4c13cc211ee39a05d96c165133a42eb41e02279a**. The complete source delta is 22 allowlisted files, no deletions; whole source parity passed. Later documentation commits are not the baseline.

Live content verified **6 November 2026, 10:57 Europe/Riga (08:57:24 UTC)**: entry `index-BxfLTW5P.js`, Loyalty `LoyaltyApp-Dr_EZecR.js`, Insights `InsightsPage-OiBpnEOL.js`. New panel, Show filters, Email offers and `without_tier` markers are present in the served bundles; report and legacy Insights/money authentication remains 401. All three Poppins font payloads passed. Public `hexa-academy` serves the Nocturne kit stylesheet with zero `rp-` markers; retired `/landing/ruled_page.css` returns 404.

Artifact verification: **7,407 PHP tests passed / 23 existing skips / 78 scoped runs / zero remaining failures**, **5,848 frontend tests / 404 files**, TypeScript, frontend lint regression gate (1,399 existing diagnostics), Larastan (no errors), fresh build, **12 PostgreSQL report tests / 129 assertions**, **69 compiled-browser checks**. Desktop 1440 and mobile 390 screenshots reviewed; browser checks cover 320–1440px, both themes, five languages, staged edits, collapse persistence, URL/back navigation, reset, no-level requests, errors, permissions and CSV export. No provider delivery or customer writes were exercised.

Post-deploy GitHub CI is still running as of 11:01 Europe/Riga: `https://github.com/vkolotikov/hotel-tech-loyalty/actions/runs/42190922781`. The audit, Larastan and completed SQLite shards were green when inspected; the local artifact checks above are complete.

Two workstation verification issues were resolved: PHP 8.5 needs `OPENSSL_CONF=C:/wamp64/bin/php/php8.5.12-nts/extras/ssl/openssl.cnf` in the **test process environment** for certificate fixtures; `tests/Unit/Stripe/ApiVersionTest.php` now normalizes native Windows separators before checking the existing permitted writer. Payment application code is unchanged. The initial sweep's 19 OpenSSL failures and one path-check failure all passed on rerun (705 tests / 1 existing skip across the three affected scopes); every other scope passed on its first run.

Signed-in live UI inspection was unavailable: browser access host was unavailable, DevTools profile was already running, and native Computer Use stopped because it could not reliably identify the browser URL. Local fixture browser checks are independent of the signed-in user browser; API reads were intercepted and external traffic blocked.

Evidence remains outside the repository: `C:/wamp64/tmp/insights-filters-php-20261106.log`, `insights-filters-php-rerun-20261106.log`, `insights-filters-pg-migrate-20261106.log`, `insights-filters-compiled-browser-20261106/` and `verify-insights-live-20261106.cjs`; development fixture results are in `frontend/test-results/insights-filters/` (ignored). Temporary preview processes on 5810 and 5175 were stopped. The disposable PostgreSQL server on 55441 was stopped. Automatic approval review rejected recursive removal of the test-cluster directories as policy-restricted; leave `C:/wamp64/tmp/hexatech-insights-pg-20261106/` and `E:/Hexa-Tech-release/insights-filters-pg-20261106/` on disk rather than bypassing that refusal. The incomplete slow-disk deployment checkout was removed.

The completed deployment checkout and its dependency junction were removed after live verification; the shared frontend dependencies remain intact. Preserve the user's untracked PDF, video, image, ZIP and Alexa assets. Existing unrelated processes and port 55439 were untouched.
