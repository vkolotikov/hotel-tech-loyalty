# Ways to earn simplification — 6 November 2026

Owner: improve the Ways to earn pages, continuing the simplified Figma treatment used for Overview, Members and Program. Branch `feature/earn-simplified-20261106`; production baseline `e7bd314a9`, source-patch delta from previously deployed feature source `c01daf41a`.

## Design and implementation

Figma file `d6IGmk3hOoMw0V5rONbI1A`, session `f602b928-b0a4-4e68-a196-a6acf1189d0e`. High-fidelity context and screenshots inspected for WE-B01 `303:10169` (directory), WE-B02 `303:10436` (purchase editor), WE-B03 `303:10701` (bonuses).

- Directory: filters inside the list, actual active/total count, method/rate/status columns, original coloured method artwork, status pills and cyan selection. Selected-rule preview and compact violet bonus / amber rules shortcuts replace the repeated hero/explainer blocks.
- Editors: shorter copy, method icons, highlighted presets with accessible pressed state, blue purchase preview, amber qualification note and conditional unsaved status. Bonus editors use a violet panel; expiry/qualification uses an amber panel. Full Rules retains the same fields and consequences.
- Existing `OverviewButton` (workspace Button composition), `FormField`, `NumberControl`, dialogs, server definitions, validation, partial-save hook and leave guard are reused. Native dropdown options have explicit theme colours. All copy changes are translated into English, Russian, German, French and Spanish.
- Original static SVGs are reused by byte hash where exact matches exist; seven new SVGs are downloaded verbatim. `presentation.tsx` maps them to the intended slots without overriding native image dimensions. `clean.css` is scoped beneath Loyalty and the earning page.

## Required adaptations

The server's six earning methods remain separate, including booking points and stamp cards; Figma's five sample rows do not redefine booking/stamp behaviour. Rates, currency, statuses, counts and previews use real data. No sample figures or demo badge ship. Add earning rule configures an existing server-supported method. Rule name and eligibility remain truthful read-only facts. Financial settings continue explicit Save, validation and dirty-draft protection. Bonus and shared-rule drafts remain separate partial saves, and changing a reward does not send a campaign.

No PHP, database, dependency, API, permission, earning-engine, member-portal or Places change. The old checks/member journey, setup, More/unknown methods, referral activity, server bounds, custom expiry, read-only states and historical earning data remain supported.

## Verification

Development: TypeScript, focused ESLint and 21 earning unit tests passed. The initial browser run passed 42 interaction and 24 state/responsive checks; four additional directory/artwork checks were then added for the compiled release run. Ten language/theme combinations across four pages and six widths (320–1440) passed, including original asset geometry. Initial minimum audited text contrast: 5.32:1 dark / 4.98:1 light. Screenshots were reviewed against the current Figma frames; final heading alignment and neutral list borders were corrected before artifact validation.

The local browser runner now fails explicitly on a fixture's returned `error` field, as well as thrown/runtime errors, so a partial state-script run cannot be reported as successful. This exposed the old state fixture's hidden desktop-menu selector on mobile; it now opens the current mobile header menu. The earlier 24-check development state result was a partial run; the compiled rerun must finish the entire script.

Release artifact, deployment and live-content evidence will be recorded below after completion. Local browser tests intercept every API call; no production customer data is written. Signed-in production browser inspection remains unavailable in this environment.
