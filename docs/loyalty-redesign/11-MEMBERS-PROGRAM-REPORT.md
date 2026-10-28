# Members and Program — implementation record

Implemented and visually reviewed on 27 October 2026. Release verification is recorded below.
Branch: `feature/loyalty-members-program-20261027`. Previous production/source: `4c13e2d1f` / `5706903b1`.

## Design and scope

Connected Figma inspection found six completed frames in `d6IGmk3hOoMw0V5rONbI1A`.
Each high-fidelity design context and screenshot was inspected:

| Screen | Exact node | Existing route |
|---|---|---|
| MB-01 Members | 59:3276 | /loyalty |
| MB-02 Member profile | 59:3277 | /loyalty/members/:id |
| MB-03 Award points | 59:3278 | Profile dialog; also redeem and Scan |
| PG-01 Levels | 72:3598 | /loyalty/program |
| PG-02 Edit level | 72:3599 | /loyalty/program?tab=tiers&tier=:id |
| PG-03 Add benefit | 72:3600 | Existing benefit assignment dialog |

The six rendered desktop screens were compared visually with the exact exports. Corrections included row height,
outlined tier chips, selected navigation, modal height/centering, profile geometry and NFC placement.
[Side-by-side comparison](evidence/members-program/comparison.html).
The local Poppins fonts, shared icon assets and three newly exported diagonal assets are used.
The colour control remains a real editable colour picker.

No additional mobile or light frames were supplied. Layouts reflow at 1024, 390 and 320 CSS pixels; tables become
member cards, columns stack, and long dialogs scroll internally. The existing Light/Dark/Auto preference and all five
languages remain. Russian uses the existing Cyrillic font fallback. Native select controls, real account context,
permission-dependent actions, additional configured floors, expiry dates, ledger reversal controls and membership
actions intentionally adapt the illustrative Figma content to the actual application.

## Data and behavior

- Members use the existing tenant-scoped directory, search, tier/status/sort filters and import/export/duplicates.
  Optional `per_page=10|25|50` is bounded on the server; old clients retain the 50-row default. Figures retain
  their existing tenant-wide scope and are not computed from visible rows.
- Profiles read existing balances, qualification measure, benefit entitlements, membership dates/consents and NFC
  cards. Benefit scope and fulfillment metadata are returned by the existing member read endpoint.
- History accepts a whitelisted optional type, filters before pagination and keeps member/tenant boundaries.
  Recent history shows three entries; full history and reversal actions remain available.
- Award/redeem retain existing validation, writers and per-opening idempotency. Added steppers/quick amounts,
  balance preview, pending locks and focus restoration. Reasons are entered by the operator.
- Program retains every section, configured floor, rate, benefit, place, boost and permission. Existing URLs work.
  The level editor previews actual draft data. Benefit assignments save separately and refresh the preview without
  resetting the level draft. Cancel/back and in-app links warn about unsaved edits; tab closing uses beforeunload.
- Benefit values and scope are structured fields. Wording does not determine financial behavior.
- There are no migrations, dependencies or changes to earning, qualification, fulfillment, consent, tenant scope or
  authorization. No fixture values or production write fallback are present in application code.

## Verification

Initial baseline: TypeScript; 1,038 Loyalty frontend tests; 575 scoped Loyalty PHP tests / 5,586 assertions.
After implementation: TypeScript and Loyalty ESLint pass; the entire frontend suite passes **5,553 tests**.
New backend integration checks: **12 Members tests / 104 assertions**, including bounded pagination, filtering across
pages, all supported history types, unknown-type fallback, other-member isolation, tenant denial and benefit metadata.

[50 browser assertions](evidence/members-program/browser-checks.json) passed against local intercepted HTTP fixtures.
They cover filters/pagination, full history, details and request routing, award validation/pending/retry/idempotency,
redeem balance limits, NFC entry, existing management menus, draft preservation, structured benefit writes, level save,
unsaved navigation, staff permissions, empty/error/retry states and responsive layouts. No application runtime errors.
Russian/light desktop and phone screenshots were also inspected; no horizontal overflow at 390 px.

Harnesses: `frontend/e2e/members-program.browser.js` establishes fixtures and the six screenshots;
`frontend/e2e/members-program.checks.js` executes the assertions. All writes are local fixture responses.
Real data integration is separately verified by Laravel tests using the real controllers/services/database.
No authenticated production transactions were used. Other browser engines, screen-reader audits and real NFC hardware
are outside this verification.

## Release

Feature source **2d6e03d81** was applied onto production **4c13e2d1f** in an isolated worktree as **9bead854f**.
All **81** explicit source/document paths matched the feature commit. A fresh production build was committed as
**0f59ddab1** and pushed to `main`; feature-branch build output was not used. No migrations or dependencies changed.

On that artifact:

- All **75 scoped PHP runs** passed: **7,071 passed, 7 existing skips, 45,224 assertions**.
  [Per-scope results](evidence/members-program/artifact-php-results.json).
  Compared with the previous 74-scope run, this includes two new Members tests and the existing 18-test
  `tests/Feature/Concerns/` suite that the older loop skipped.
- TypeScript, Loyalty ESLint and the fresh Vite/postbuild passed. **385 frontend files / 5,553 tests passed**.
  [Frontend results](evidence/members-program/artifact-frontend-results.json).
- All **50 browser assertions** passed again against the compiled production assets, with no application runtime
  errors. [Compiled-asset results](evidence/members-program/artifact-browser-checks.json).
  The six desktop and fifteen responsive captures beside the comparison now come from that compiled artifact.
- Tier labels were checked while switching theme in place; both light and dark text colors update immediately.

Cloud content was verified at **21:51 Europe/Riga on 27 October 2026**. The live entry
`index-CL4idIXW.js` loads `LoyaltyApp-CjlMH1Wr.js` / `LoyaltyApp-C6Vz3vTm.css`; all four new content markers,
the redesign stylesheet and all three Poppins font payloads passed. The Members API still returns the expected
401 without authentication. The academy landing page serves its kit stylesheet without retired `rp-` markers,
and `/landing/ruled_page.css` remains 404.
[Live verification](evidence/members-program/live-verification.json).

Existing routes and the previous Overview milestone remain included. The next source patch starts at **2d6e03d81**;
post-deployment records are committed separately on the feature branch.
