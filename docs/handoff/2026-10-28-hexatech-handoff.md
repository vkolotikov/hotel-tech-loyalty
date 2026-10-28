# HexaTech handoff — 28 October 2026

Read this first, then `2026-10-27-hexatech-handoff.md` for the full environment, test-loop,
product history and deployment instructions. Root AGENTS.md and CLAUDE.md still apply.

## Current release: Rewards & benefits

The Rewards milestone follows RB-01 `108:4986`, RB-02 `108:4987`, RB-03 `108:4988` and PG-04 `92:3955`
in the connected Figma file. Points rewards, the full reward editor, Offers and Membership benefits now share
the Overview design shell. Existing redemptions, referrals and `/loyalty/program?tab=benefits` remain available.

- Production commit: **56ddb2d2b**, live content verified **28 October, 13:12 Europe/Riga**.
  Entry `index-DKsE4bbC.js`, Loyalty `LoyaltyApp-EEnCshva.js` / `LoyaltyApp-qoyibfIz.css`.
  Final CSS/strings, three local fonts, Rewards/Offers/Program authentication (401), public landing kit
  and retired stylesheet (404) checks passed.
- Deployed feature source: **b7e5e3a5a**, branch **feature/loyalty-rewards-benefits-20261028**.
- Artifact starts at **1fcdcbb6b**. Final source patch **1860ce52a**; fresh build **56ddb2d2b**.
  Whole source parity passed. The allowlisted patch contains 70 source/documentation/evidence paths.
- **The next source delta starts at b7e5e3a5a**, not the later feature documentation tip.
- No backend, migration or dependency changes. Existing tenant-scoped APIs, permissions, typed discounts,
  stock/claim limits, images, brands, offer dates/caps and per-level benefit values remain authoritative.
- Artifact verification: PHP **7,071 passed, 7 skipped, 45,224 assertions, 75 foreground scopes**;
  frontend **5,606 passed, 0 failed, 388 files**; TypeScript, Loyalty ESLint and fresh build passed.
- Compiled browser: **21 interaction + 61 state/responsive checks**, zero runtime errors. All four screens fit
  1440, 1024, 768, 390 and 320 pixels; light mode and all five languages were checked. Reference and compiled
  screenshots were visually compared. Browser writes use intercepted fixtures, never live member transactions.
- Unsupported prototype options are honest facts: points rewards apply to all members and use member codes;
  offer dates remain date-only. Switched off/ended/out-of-stock states reflect actual data. The inherited
  navigation guard covers internal links and unload, not history traversal or unrelated shell commands.

Full report and evidence: `docs/loyalty-redesign/13-REWARDS-BENEFITS-REPORT.md` and
`docs/loyalty-redesign/evidence/rewards-benefits/`. Private logs/scripts use `.git/rewards-*`.

## Previous release: Ways to earn

Ways to earn is implemented from the final connected Figma frames WE-01 `102:4548`, WE-02 `102:4549`
and WE-03 `102:4550` in file `d6IGmk3hOoMw0V5rONbI1A`.

- Production commit: **1fcdcbb6b**, live content verified **28 October, 11:33 Europe/Riga**.
  Entry `index-BtSDK41H.js`, Loyalty chunks `LoyaltyApp-CCG_p63r.js` / `LoyaltyApp-COCRVuhl.css`.
  Three local fonts resolve; options requires authentication (401); landing kit and retired-file checks pass.
- Deployed feature source: **d45a44be1**, branch **feature/loyalty-ways-to-earn-20261028**.
- Artifact starts from **0f59ddab1**; source patch **8e3157d39**, availability correction **9ac7dca0a**,
  fresh production build **1fcdcbb6b**. Whole source parity passed against **d45a44be1**.
- The next source patch starts at **d45a44be1**, not the feature branch's later documentation tip.
  Post-deployment records, screenshots and this handoff follow that source tip.
- Source allowlist was 58 explicit paths under Loyalty, its three browser harnesses, and prior/current
  deployment documentation. No backend, dependency, migration or earning-engine changes.

## Delivered behavior

`/loyalty/options` now uses the Overview design shell, with earning rules, bonuses and shared rules.
The existing setup wizard remains `/loyalty/options/setup`; checks, recommendations and the member journey
remain at `/loyalty/options?tab=overview`. Existing method bookmarks still work.

All six earning methods remain: purchase base rate, booking points, visit stamp cards, check-in, desk earning,
and cashback. Bonuses retain welcome, birthday and referrals, including both referral amounts and their trigger.
Expiry supports every server-allowed month value and never; level qualification uses server choices.
The two forms on Bonuses preserve one another's drafts when saved and discard together when leaving.
The existing `GET/PUT options?brand_id=all` is still the only options reader/writer; PUT sends changed fields only.
Saving invalidates bootstrap and Overview. Access controls, defaults, bounds and field conditions remain server-owned.

Figma adaptations are deliberate: visit stamps are not relabeled booking stamps, unsupported custom rules are
not invented, and rule names/eligibility are read-only facts. Add earning rule selects an existing method.
Purchase examples are illustrative base-rate calculations; actual awards remain server-side.
Navigation guards cover internal links and earning controls plus browser unload, not browser-history traversal
or unrelated shell commands that invoke navigation directly.

## Verification

- PHP 8.4.20, real copied vendor, 75 foreground scopes: **7,071 passed, 7 skipped, 45,224 assertions**.
  Same backend baseline as the previous production release; all `Tests:` summaries were checked.
- Final artifact frontend: **5,588 passed, 0 failed, 387 files**. TypeScript, Loyalty ESLint and build passed.
- Compiled browser: **42 interaction + 29 state/responsive checks passed**, no runtime errors.
- Exact Figma references and desktop/mobile renders were viewed and compared. All four views fit
  1440, 1024, 390 and 320 pixels. Light theme, Russian, all five locale bundles, empty/error/retry,
  read-only access, setup/checks links and unknown-method fallback were verified.
- Browser API fixtures intercept all requests, including writes. Production member transactions were not created.
  The harness installs context-wide initialization scripts; use a fresh browser context for authenticated live checks.

Implementation details and evidence: `docs/loyalty-redesign/12-WAYS-TO-EARN-REPORT.md` and
`docs/loyalty-redesign/evidence/ways-to-earn/`.

## Local state

No feature-branch build assets were committed. Unrelated PDF/ZIP files and `public/alexa-skill-assets/` remain untouched.
The original Vite server on port 5173 is not owned by this release and remains running. The release preview on
5810 and the isolated deploy worktree were removed after verification. Private logs and scripts live under `.git/earn-*`.

The owner has standing authorization to deploy each finished, verified job without asking again.
Use the isolated source-patch recipe, test the artifact, build it fresh, push its deploy branch to `main`,
then verify live content. Never push the feature branch directly to production.
