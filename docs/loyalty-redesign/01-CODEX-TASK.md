# Task for Codex: implement Hexa loyalty Overview

Read [00-START-HERE.md](00-START-HERE.md), then documents 02–07 before implementing. Use 08 for scope boundaries and 09 for reporting.

## Outcome

Deliver a working, responsive Overview in the existing loyalty application, matching the final linked Figma designs. Connect it to verified application data and existing workflows. Preserve the existing loyalty functionality and business semantics.

Visual fidelity is a primary requirement, not an optional polish pass. A working generic dashboard with different typography, surfaces or hierarchy does not satisfy this task.

## Authorized current scope

- Inspect the repository, its applicable AGENTS.md files, routing, framework, components, styles, authorization, services, tests and existing loyalty documentation.
- Implement Overview, its shared visual primitives and the shell/navigation needed to expose it.
- Implement desktop and mobile details, period selection, activity filtering, all relevant state variants, permission handling and module recovery.
- Add the minimal tested read-side aggregation/adapters needed to supply Overview from verified sources.
- Use existing editors, member flows, request workflows, guide, search and scanner as destinations.
- Make small supporting changes necessary for this integration; document them and test affected areas.
- Run the application and compare it with the exact Figma frames. Fix mismatches before declaring completion.
- Produce a reviewable branch/change set and implementation report. Do not deploy, merge or operate live member transactions as part of UI testing.

No second design approval is needed to implement the described Overview milestone. Keep making progress on independent work when one data source is unresolved. Ask only for a specific material decision or missing access that cannot be resolved in the repository.

## Outside this milestone

Do not redesign Members, Rewards editors, the setup wizard or other section bodies without their later specifications. Preserve them and link to them. Do not introduce a new framework, replace the existing application with a standalone demo, or globally rewrite the site's theme.

Do not change earning rates, balances, level thresholds, expiry policy, qualification semantics, fulfillment automation, campaign audiences, tenant/program ownership or permission roles merely to make example screens work. Do not seed Figma demo names or numbers into production.

## Required working method

1. Read repository instructions and inspect the current app. Record real paths, services, capabilities, metric semantics and existing test commands. Do not assume React, Next.js, Tailwind, a database schema or an endpoint name.
2. Use the connected Figma plugin to inspect the listed final frames and obtain screenshots plus node properties. Follow that plugin's instructions. Do not edit the design file during implementation.
3. Create a short implementation map in the working report: required behavior → existing code/service → planned change.
4. Reuse the project's framework, routing, UI primitives and data-access patterns. Add scoped tokens/components where needed.
5. Build a vertical slice of the main layout using test-only fixtures, then connect real adapters. Test fixtures must not become a production fallback.
6. Implement remaining states and details as data-driven variants, not 34 copied pages.
7. Verify tenant/capability enforcement, request types, time windows, real destinations and data freshness.
8. Run relevant checks and visual comparisons. Continue fixing until the defined criteria pass or a concrete external blocker is documented.

## Conflict resolution

- Follow the user's latest instruction and applicable repository instructions.
- Use the final Overview frames identified in 02 for visual decisions; ignore nearby obsolete concepts.
- Use 04 for integration decisions, metric definitions and safe treatment of missing support.
- Use 05 to prevent feature regressions.
- Preserve existing business semantics when the design is illustrative or source behavior is uncertain.
- If a required behavior conflicts with confirmed existing semantics, document the conflict and implement unaffected work. Do not silently change financial or membership behavior.
- If Figma is inaccessible, continue source discovery/data contracts/tests, but do not claim visual completion or approximate a replacement style. Report the precise access problem.

## Non-negotiable requirements

- Poppins; exact approved five-color palette; charcoal gradients; raised/inset controls; glass preview; cyan-to-indigo emphasis.
- All existing top-level destinations and Scan/help/settings/account utilities remain reachable.
- Existing `/loyalty` Members bookmarks keep working; add Overview using the existing router, preferably `/loyalty/overview`.
- Current totals and time-window metrics are distinct.
- A failed/unsupported value is never converted to zero.
- Overview never awards, redeems, approves, fulfills, sends campaigns, applies setup or automatically fixes a rule.
- Every visible action has a working destination/handler or an explicit, truthful unavailable state. No dummy `#` links, silent no-ops or pretend success messages.
- No cross-workspace cached data or unauthorized totals/details.
- No full-page screenshot used as the UI. Build semantic, responsive components.
- Do not expose implementation jargon in customer-facing copy.

## Finish with evidence

Complete the report from 09. Include changed paths, actual test commands/results, visual comparison evidence, resolved assumptions, remaining blockers and known limitations. Distinguish “implemented,” “verified” and “not available.” Do not report unrun tests as passed or unavailable data as a complete integration.
