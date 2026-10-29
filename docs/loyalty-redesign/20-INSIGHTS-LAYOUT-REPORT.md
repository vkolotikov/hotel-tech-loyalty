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

Release artifact verification and live deployment record will be added after completion. Source-patch baseline is `1b800e9bb2d4956120092a9f29c37d6a85d506dc`; production parent is `59a6bda89ca5e47183135489550325c029f6c1b9`.
