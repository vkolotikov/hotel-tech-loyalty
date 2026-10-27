# Implementation sequence

Complete the current Overview milestone in the existing application. Do not stop after planning, styling only the happy path or creating disconnected demo screens.

Each stage has a concrete result. A stage is not a request for fresh user permission. Continue within scope; isolate real blockers and progress on independent work.

## Stage 1 — Map the repository and current behavior

Inspect applicable instructions, git status and existing changes before editing. Preserve unrelated work.

Identify the actual framework/router, loyalty entry points, shell, theme tokens, font loading, authorization, state/query library, metric/reporting services, request lifecycles, setup persistence and test commands.

Create a concise source mapping using 09. Resolve the definitions and compatibility questions in 04. Record source references rather than guesses.

**Done when:** real code paths and data dependencies are mapped; unsupported assumptions are identified; an implementation approach fits existing architecture.

## Stage 2 — Inspect final Figma and establish shared primitives

Use the connected Figma plugin. Read OV-01, OV-19/24, OV-22, primary panels and the controls board. Inspect actual styles/effects; do not choose a new visual direction.

Implement scoped semantic tokens and reusable primitives for panels, buttons, statuses, metrics, notices, list rows and detail surfaces. Reuse existing accessible primitives where suitable. Load Poppins using the app's asset/build conventions.

Keep existing light/auto behavior. Avoid global CSS changes that unexpectedly affect the rest of the platform.

**Done when:** main primitives match the target and support keyboard, focus, busy/disabled and theme behavior.

## Stage 3 — Shell and main visual slice

Add Overview with compatible routing. Preserve the existing Members entry and sidebar destinations/utilities.

Build the main desktop, compact and mobile layouts using test-only deterministic fixtures. Use semantic HTML and flexible layout. Make preview, program summary, attention, metrics, queue and activity reusable components.

Do not bake illustration values into live code. Keep fixtures in the project's test/story/development mechanism with no automatic production fallback.

**Done when:** main layout can be rendered at 1440, 1024 and 390 widths, key visuals match Figma, and all shell destinations remain usable.

## Stage 4 — Verified data integration

Implement/reuse authorization-aware read adapters for summary, checks, metrics, queue and activity. Use actual source semantics, bounded queries, scope-sensitive caches and independent module states.

Connect current totals separately from period metrics. Apply the capability/configuration-based presentation. Use honest unavailable states for unsupported metrics.

Resolve request aggregation or the source-preserving queue fallback. Do not redesign request operations.

**Done when:** real permitted data loads, scope/period switches are correct, no fabricated data is used and unresolved sources are explicitly recorded.

## Stage 5 — Details, navigation and complete state behavior

Implement:

- Program details.
- Configuration issue review and precise editor links.
- Illustrative member preview.
- Metric definitions and reporting destination.
- Period picker with 30/90/12-month choices.
- Activity panel, filter and no-results state.
- Mobile full-screen details and navigation drawer.
- Setup/continue guidance using actual supported setup state.
- No members, no recent activity, all-clear and restricted access.
- Initial loading, global failure, per-module failure, retries and stale/offline handling.
- Conditional discount, check-in and service-benefit summaries.

Reuse one dynamic implementation across periods/configurations. Figma navigation/back composition limitations must not leak into production.

**Done when:** every in-scope visible action works, details preserve context/focus, and source failures do not produce false success/zeros.

## Stage 6 — Functional and visual verification

Run relevant repository checks. Add meaningful tests for new adapters/normalizers, permission and period behavior, queue ordering and the key user flows. Use the existing test tooling.

Compare browser renders with Figma using matching viewport and fixtures. Inspect fonts, geometry, surfaces, contrast, modal behavior and responsive ordering. Fix defects; do not settle for “similar dark theme.”

Smoke-check the existing routes affected by shell/style changes. Do not execute real customer transactions, sends or scans.

**Done when:** acceptance checks in 07 pass, exceptions are documented and screenshots show the actual implementation.

## Stage 7 — Delivery

Fill 09 with actual results, changed paths, source definitions, screenshots, test commands, limitations and any migration/rollout notes.

Prefer an additive implementation with a reversible route/shell change. If the project already uses feature flags, use its existing pattern where appropriate; do not introduce a large flag system for this page.

Do not silently deploy or merge. Leave a reviewable change set/draft PR according to the repository's existing workflow. Update relevant product/developer documentation for the implemented behavior.

**Done when:** Overview is reviewable and its correctness/visual fidelity are evidenced. Members remains the next design and implementation milestone.

## Handling genuine blockers

| Blocker | Continue now | Report/decision needed |
|---|---|---|
| Figma access unavailable | Source map, safe adapters/tests, existing behavior inspection | Exact file/plugin access problem; visual completion is blocked |
| Missing tracking source | Layout, supported modules, unavailable treatment | Specific metric/event dependency; do not invent tracking history |
| Unknown completion semantics | Inspect source/tests and existing reports | Explicit ambiguity and business impact if source cannot settle it |
| No resume persistence | Existing setup entry with truthful label | Persistence enhancement, if desired later |
| No combined requests page | Source-preserving items and destination chooser | Larger consolidation is a later section task |
| Mixed-scope level data | Correct scope display and safe diagnostics | Separate migration/ownership decision; no automatic cleanup |
| Required business-rule change | All independent UI/integration work | Concrete decision and consequences, not a broad request to restart |

A blocker in one optional module does not justify leaving the whole page unfinished. Equally, an unavailable state does not prove the underlying feature was implemented; report both accurately.
