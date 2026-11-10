# Loyalty catalogue layout polish — 10 November 2026

Owner follow-up to the administration UX release: fix overlapping member search text/icon and bring Program,
Ways to earn and Rewards closer to Figma page `353:8135` in `d6IGmk3hOoMw0V5rONbI1A`.
Branch: `feature/loyalty-design-polish-20261110`. Starting production: `54d65439e`;
previous source-patch baseline: `d443310c1`.

## Changes

- Member search now has a sufficiently specific type selector to preserve its 40 px icon inset against the shared
  input rule's three `:not()` selectors. All other member filters retain their labels and behavior.
- A catalogue row and its column headings share one grid. Levels have actual threshold/rate/member columns,
  a connected tier path and a compact selected-tier earning example. Readiness details remain reachable.
- Original artwork stays beside the copy, preserves its intrinsic proportions and scales in narrow containers.
  The original 17 px drink, clock, bed, percentage and sun SVGs were downloaded unchanged from the inspected Figma
  response and added to the existing local asset catalogue. No temporary Figma URLs are used at runtime.
- Earning rules have the compact summary, status pills, concise configured rates, correctly mapped purchase/card,
  booking/calendar, desk/receipt and cashback/coin icons, and links to the independent booking/desk switches.
- Places group search, level/status filters and the staff door-check shortcuts with their directory. Their summary
  uses the existing active-place and granted-entry counts. The selected place uses the cyan access artwork.
- Rewards, perks and offers use the same flat surfaces, aligned rows, neutral panel headings, compact artwork,
  redemption steps and real offer dates. Perk assignment controls are grouped; secondary settings remain expandable.
- The seven catalogue pages support both themes and responsive stacking, with focus moving to the selected detail
  when the columns stack. New labels are translated in all five workspace bundles.

No backend, schema, permissions, loyalty engine or native API changes. No entrance/hour/override feature was
invented from Figma sample data. Customer records and external providers were not used for rehearsal.

## Verification

Source screenshot review covers the requested seven pages at desktop and mobile sizes, in addition to the existing
guided setup continuity check. The existing compiled real-backend journey passed 88 checks before the final copy
and compact-perk refinements. Focused frontend regressions passed 419 tests, including the CSS scoping sweep,
read-only program controls and the tier measure contract. TypeScript and lint passed; lint retains the existing
1,383 diagnostics without new findings.

The new `frontend/e2e/loyalty-layout-polish.mjs` checks actual column positions, original artwork geometry, overflow
at 1440/1280/768/390, member search clearance and typing, stacked selection focus and reduced motion. It uses only
the guarded local launch database, captured mail, and loopback browser traffic. Evidence is outside Git at
`C:/wamp64/tmp/loyalty-layout-rehearsal-20261110`.

## Final artifact acceptance

Source through **f6146efeeba0e26f97d5e0873cfa9eb79bba3c72**, assembled from `origin/main` in
`Hexa-Tech-deploy-layout-20261110`, with physical vendor and a dependency junction only for node_modules.
The exact **32-path** source manifest has SHA256
`6834682BCF3DF06B476B557A281ABFD07DE4F5A1A2C636812CBD87A50067F6F7`.
Whole-source parity passes outside frontend/dist, public/spa and resources/spa-shell.

- Artifact frontend: **6,905 tests /469 files**, TypeScript and lint pass. No baseline expansion.
- Required PHP gates: Support **214 /1590 assertions**, Unit Landing **118 /1763**, Feature Landing
  **1735 /9552**; **2,067 passed** in total. No backend or dependency changes.
- Final tablet breakpoint refinement: fresh TypeScript, **418 focused tests**, a fresh Vite build and postbuild.
  Generated assets are committed only in the release worktree. Build warnings remain the existing font paths,
  large chunks and mixed static/dynamic import warnings.
- Final compiled real-backend acceptance: **96 checks**, zero browser runtime errors. All seven catalogues are
  checked at **1440/1280/1024/768/390**, in dark and light. Column positions, proportional original artwork,
  usable full-width mobile search, overflow, member icon clearance and typing all pass. Five actual translated
  label sets, reduced motion and stacked selection focus pass.
- Final review caught a manager's existing inactive perk assignment being disabled by the compact control.
  The regression was reproduced (disabled button), fixed, and pinned by the frontend test and two real-backend
  checks: the action stays enabled and opens the canonical editor. The disposable fixture's original state is restored.

Desktop and mobile screenshots were inspected against the retrieved Figma screenshots. The earlier **88-check**
journey additionally covered redirects, real rate saves/inheritance, selected-tier values and shared assignment
entrances. Its distinction from the final 96-check build is retained here.

Deployment and public content verification follow in the release handoff.
