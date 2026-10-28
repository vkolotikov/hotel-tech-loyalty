# Ways to earn — implementation record

In progress, 28 October 2026. Branch: `feature/loyalty-ways-to-earn-20261028`.
Production baseline: `0f59ddab1`; last deployed feature source: `2d6e03d81`.

## Design and implementation map

Figma file `d6IGmk3hOoMw0V5rONbI1A`, inspected through the connected plugin with high-fidelity context and screenshots:

| Frame | Node | Existing integration |
|---|---|---|
| WE-01 Ways to earn | 102:4548 | `GET options`, server `ways`, status/search and existing option editors |
| WE-02 Edit purchase points | 102:4549 | `points_per_currency`, existing partial `PUT options`, bounded decimal rate |
| WE-03 Bonuses | 102:4550 | Welcome/birthday/referral options, existing triggers, expiry and qualification |

Reuse `OverviewShell`, local Poppins/icons, `OverviewButton`, `NumberControl`, existing option normalization and validation.
Keep the checks/journey Overview, setup wizard, recommendations, all server-provided methods and unknown-method fallback.
No earning-engine, financial, permission or tenant-scope changes. All writes use the existing partial options endpoint.

Source adaptations: purchase rate is shared by completed bookings and desk purchases. The separate booking switch
and stamp-card method remain available; stamp cards are not renamed into a new booking-only mechanism. Rule names,
level eligibility and purchase eligibility are not configurable in this options contract and will be shown as facts.
Add earning rule will choose an existing supported method for configuration, not create an unsupported custom rule.
Purchase examples are explicitly illustrative base-rate calculations, excluding level, outlet, benefit and boost modifiers.
The server remains authoritative for actual awards. Rules keep the full allowed expiry range, including never.

## Baseline

TypeScript passed. Loyalty frontend: 1,053 passed. Scoped option/backend checks: 23 passed / 1,024 assertions.
The first full frontend run passes: 5,588 tests. TypeScript and scoped ESLint pass.
The new tests cover URL compatibility, filtering, bounded examples, permissions, server field definitions,
conditional stamp rewards, arbitrary valid expiry months and the preserved checks/journey page.

## Visual and interaction verification

The three exact Figma screenshots and rendered desktop/mobile evidence are in `evidence/ways-to-earn/`.
Compared the rendered earning list, purchase editor and bonuses against WE-01–03 at 1440 pixels.
Corrected heading/action alignment, row heights, label sizes, purchase quick-set placement and preview spacing.
The sixth earning row is intentional: existing booking points and visit stamp cards remain distinct.
Disabled save buttons reflect clean drafts; production does not show Figma's demo-data badge or illustrative status footer.
Long factual eligibility text wraps instead of presenting unsupported editable fields.

Browser fixtures intercept every API call, including writes; no production member activity is created.
The reusable harness and interaction/state checks are in `frontend/e2e/ways-to-earn*.browser.js`.
Checks cover partial payloads, server refusal, retry, invalid drafts, concurrent-form draft retention,
page-wide discard, pending writes, all existing earning methods, referrals and zero-off bonuses.
Responsive checks cover all four views at 1440, 1024, 390 and 320 pixels, with no horizontal overflow.
Light theme, Russian, mobile navigation, method chooser, read-only access, empty/error recovery,
unknown methods, setup and original checks/journey are exercised. All five locale bundles include the new copy.
Navigation protection covers in-app links, earning-page controls and browser unload; it does not intercept
browser-history traversal or unrelated shell commands that call the router directly.

The isolated production artifact, full backend checks, final browser results and live verification are pending.
