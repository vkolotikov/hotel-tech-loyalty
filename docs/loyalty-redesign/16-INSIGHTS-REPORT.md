# Insights milestone — implementation record

Status: deployed and live content verified on 28 October 2026 at 16:22 Europe/Riga. Requests is included in this release.

Exact connected Figma references: IN-01 `136:6541` (1440×1870), IN-04 `182:7909` (640×548), IN-05 `182:7910` (640×804), file `d6IGmk3hOoMw0V5rONbI1A`. Full design contexts and screenshots inspected before implementation. Existing Overview shell/controls/native dialog are reused. The 17 static exports were downloaded and SHA-256 compared; the Program icon is a new exact export. Data-dependent lines, bars and donut arcs are generated from report values, not Figma's illustrative images.

## Implementation map

| Behavior | Integration |
|---|---|
| Dashboard, eight KPIs, trend, levels, points, rewards, cohorts, attention | `ReportDashboard.tsx`, `ReportCharts.tsx`, scoped `report.css` |
| Completed date range, equal preceding period, current level | `GET insights/report`, `InsightsController::report`, `InsightsReport` |
| Recorded member sales | Existing `InsightsMoney` with an optional explicit period/current tier; legacy defaults unchanged |
| Definitions and cohort inspection | Shared `OverviewDialog`, full translated definitions, numerator/denominator retained |
| Chart/table and member/sales switching | Actual server weekly series; keyboard-operable chart points and readable table |
| CSV export | Current successful scoped response only; dates, timezone, currency, definitions, comparisons, weekly/cohort/reward and snapshot data; quoted cells and formula protection |
| Existing reports and bookmarks | `DetailedInsights`, `?view=detailed`; original `?period` and `?quiet` keep legacy definitions |
| Permission/tenant scope | Existing `requireInsights`, explicit organization on queries and related members, query keys include organization/staff/capabilities |

## Verified definitions and deliberate adaptations

- Default: 28 completed venue days through yesterday; explicit dates allow 1–366 days. Seven-day buckets start at the selected start date; the final bucket may be shorter. Equal-length comparisons are adjacent periods. Venue-midnight bounds handle DST.
- Active means distinct members earning or redeeming non-reversed points. Expiry and cancellation refunds do not establish activity. Participation divides by current member records joined by period end. Weekly distinct counts are not summed.
- New members use joined_at, falling back to created_at. Deleted member history cannot be reconstructed. Both periods use the same current-level population filter.
- Member sales retain existing paid stay/appointment definitions: member/guest links, booking creation date, net refunds, venue currency, excluding test/other-currency bookings. This is not measured loyalty uplift or arbitrary purchase revenue.
- Claims are reward redemptions created in the period, with status **now**. Cancelled claims remain in the denominator and are shown separately. Benefit approvals are not fulfilment. Historical points accounting is unchanged.
- Levels, outstanding balance and future expiry are **current snapshots**, visibly labelled. Outstanding/expiry use active members; level distribution includes current member records. Expiry covers today through day 29. Quiet members were previously active and are now quiet for 30+ venue days.
- Cohort cells count qualifying activity in later complete seven-day intervals; unobserved future intervals are null, never zero. Empty cohorts have no invented percentage.
- **Place filtering is unavailable:** activity and sales do not consistently carry a common place attribution. The filter dialog explicitly says All places and explains organization-wide scope. It does not pretend to filter.
- Old detailed reports, money, monthly retention, member growth, tier movement, balances and at-risk members remain available. No migrations, dependencies, permission roles, points economics or write services changed.

## Verification

- New report PHP tests: 5 passed, 55 assertions, including independent count/financial expectations, tenant and current-tier scope, cancellations, comparison boundaries, validation, a 25-hour Riga DST day and remaining-point expiry boundaries. Legacy null-tenant expiry/claim rows are reached only through an owned member; foreign tenant/member combinations remain excluded.
- Focused frontend tests: 107 passed across report math, inbox math and the full existing locale validation suite. All 108 report keys and placeholders are present in English, Russian, German, French and Spanish.
- Development browser: 53 report checks passed, including filters/back/cancel, chart/table/sales inspection, cohort details, actual download, stale export disabled, permission loss, initial failures, empty state, original reports, six widths (1440/1280/1024/768/390/320), light theme and all five languages. No runtime errors or member writes.
- Desktop/dashboard/dialog renders compared visually to the exact frames. Mobile inspection prompted charts to use measured viewport coordinates so labels remain legible instead of shrinking with the desktop SVG. Table overflow stays within its card. The final refinement passed the compiled release checks below.
- Requests: 30 interaction checks and 50 state/responsive checks passed. See `15-REQUESTS-REPORT.md`.
- Final artifact: **7,084 PHP tests passed, 7 skipped, 45,380 assertions, 75 foreground scoped runs**. Full frontend suite: **5,651 passed, 0 failed, 391 files**. TypeScript, Loyalty ESLint and fresh Vite/postbuild passed. The final focus/chart refinements also passed TypeScript, lint, focused tests and compiled browser checks.
- Compiled browser: **59 Insights + 30 Requests interactions + 50 Requests state/responsive checks**, zero runtime errors. Six widths, chart coordinate scale, five languages, light mode, real CSV download and dialog focus verified. `browser-states.json` and Requests `browser-interactions.json` contain the check lists. Native icon geometry was checked in-browser; 17 exact exports are accounted for per page.
- The final charts retain 12px axis labels on mobile and a shared rounded zero-based points scale. Desktop, both dialogs, mobile charts, Requests desktop/mobile and light layouts were inspected against the exact Figma references. Longer truthful definitions and current-snapshot labels deliberately replace illustrative historical claims.
- C: encountered ENOSPC while installing artifact dependencies. Automatic approval review blocked deleting that partial copy. Verification moved to `E:/Hexa-Tech-release/`, with a fresh isolated worktree from the same production parent, a real vendor copy, fresh npm install and task-local cache/temp paths. C: subsequently regained space. No unrelated files were deleted. The E: source worktree is the verified source until synced back.
- Browser fixtures intercept every API request locally; no live member transactions were made. Production content/authentication checks passed after Cloud rebuilt the application.

Previous deployed source baseline: `27baa2935820dd2e70b4e63c337d8f5a5cc0c0bb`. Production parent: `ab5f25bdd0dd1e8993728f95423a2ea519ba67f4`. Evidence lives in `evidence/insights/` and `evidence/requests/`; private scripts/logs use `.git/insights-*`.

## Deployment record

- Production commit: `f5edeb36304821a8ec9def97b75f5a82b2435955`. Deployed feature source: `e21e9258264614f239fc291e9331ca1746ea36fd` on `feature/loyalty-insights-20261028`. **The next source delta starts at e21e92582**, not the later documentation commit.
- Isolated artifact started at `ab5f25bdd`; final source patch `8965ece17`. Whole-source parity passed before the final build commit, excluding only the generated SPA paths. The source allowlist contains 94 paths.
- Live verification at `2026-10-28T14:22:01.7132647Z`: entry `index-Dmym9LWz.js`, Loyalty `LoyaltyApp-B6QX0ipr.js` / `LoyaltyApp-Cik0IdCp.css`. Both page markers, responsive styles and all three local Poppins font payloads passed.
- Report, unified inbox and legacy money endpoints returned the expected unauthenticated 401 JSON. Existing public landing kit and retired stylesheet 404 passed. These are read-only deployment checks; authenticated data contracts and mutations were verified using isolated tests and intercepted browser fixtures.
- Machine-readable live evidence: `evidence/insights/live-verification.json`. No migration or dependency change was required.
