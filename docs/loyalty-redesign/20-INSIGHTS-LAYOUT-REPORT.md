# Insights membership layout refinement

Owner request: 29 October 2026, following a screenshot where ten levels (seven empty) stretched the membership and activity cards to an excessive height.

## Design and behavior

Re-inspected exact connected Figma frame IN-01 `136:6541`, file `d6IGmk3hOoMw0V5rONbI1A`, session `dc92ed43-b2ec-495c-9711-48bb5cbb3e45`. The frame's compact donut/legend uses three illustrative levels. The implementation preserves its typography, palette, chart proportions and dashboard structure while accommodating the real programme's longer list.

- Populated levels appear beside the donut with separate, aligned counts and percentages. Empty levels are explicitly counted in a keyboard-operable native disclosure; every configured level is still available.
- The doughnut uses all populated rows, including members without a level. Existing server order/color association, total and percentage denominator are retained. Large central totals use compact notation with the exact total in the accessible name and tooltip.
- Long populated legends and expanded empty lists have bounded, keyboard-scrollable regions. Neither stretches the adjacent activity card. Narrow cards stack the donut above compact rows; long names wrap.
- Empty snapshots have a translated explanation. Two new strings are present in all five languages. Existing routes, filters, chart/table controls, definitions, CSV and detailed reports remain.
- No backend, API, data definition, dependency or migration change. `GET insights/report?brand_id=all` remains the data source; no member or programme writes are added.

## Verification

Development: TypeScript and Insights ESLint passed; report math/locale suite passed (5 tests). Chrome layout regression passed 48 checks: the screenshot's exact 179/3/2 distribution out of 184, seven empty levels, keyboard disclosure, 30 populated levels, long names, unassigned members, all-empty snapshots, five languages, both themes and seven widths (320–1920px). No runtime errors or member writes.

Observed card heights: 403px on desktop/tablet, 395px at 390px, 457px at 320px. Desktop and mobile renders were visually inspected against Figma and the supplied screenshot. Evidence and runnable checks: `evidence/insights-layout/`, `frontend/e2e/insights.layout.js` (run after `insights.browser.js`). Browser data is explicitly intercepted local fixtures, not a claim of authenticated production-data testing.

Release artifact: **5,704 frontend tests in 394 files**, **33 scoped PHP tests with 276 assertions**, TypeScript, full Loyalty ESLint and fresh Vite/postbuild all passed. The PHP Insights filter includes report, money, cohorts, at-risk, legacy reports and the relevant bootstrap capability check. Compiled Chrome passed **48 layout + 59 existing interaction/state checks**, with no runtime errors. Filters, chart/table switching, keyboard inspection, cohort details, real CSV download, authorization loss, recovery, detailed reports, five languages and both themes remain verified. Final compiled desktop/mobile cards were visually inspected again.

The isolated release began at `59a6bda89ca5e47183135489550325c029f6c1b9`; its explicit 34-path source patch includes the previous Campaigns post-deployment evidence. Whole-source parity passed, excluding only generated SPA paths. Source commit: `b314325b8`. Production build commit: `8f7c18159e6ae6d082c7f0db7706592cbdb1fbbb`.

Deployed feature source / **next source-patch baseline**: `de39dc9a9e5c26898a13821dd68554f113c0cb7d`. Do not use the subsequent documentation/evidence commit as the baseline. Feature branch: `feature/insights-layout-20261029`.

Live content verified **29 October 2026, 09:55 Europe/Riga**: entry `index-hJ5Z0xdJ.js`, Loyalty `LoyaltyApp-CKwz0Hzw.js` / `LoyaltyApp-B7Gq2D31.css`. New layout/translation markers, responsive styles, existing page markers and all three Poppins payloads passed. Report and legacy Insights/money endpoints returned the expected unauthenticated 401 JSON. Public landing kit content and retired stylesheet 404 passed. See `evidence/insights-layout/live-verification.json`.
