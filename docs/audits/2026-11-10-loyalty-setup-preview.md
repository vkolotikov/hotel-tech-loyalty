# Guided setup: expanded programme preview

Owner request: make setup's right side understandable to first-time users, remove its separate scrollbar and
collapsed content, distinguish industries, membership rewards and loyalty rules, and use a useful visual explanation.

## Behaviour and design

`/loyalty/options/setup` now has an open, naturally sized “Your programme at a glance” sidebar. Flat sections
separate membership/rewards, earning methods, bonuses and programme rules. Each uses the existing loyalty icon
and accessible colour families. The industry choices share their coloured icons with the selected preview.
The compact Join → Earn points → Use rewards journey explains the member experience without inventing figures.
On smaller screens the preview follows the editor in normal document flow; there is no nested scrolling region.

The preview reads the existing server presets, catalogue, draft form and canonical outcome sentences. A fresh
programme shows suggested level names and reward examples. An existing programme shows its real catalogue and
explains that selecting a template changes suggested earning rules, preserving existing levels and rewards.
Disabled ways are stated together; disabled expiry explicitly says that points never expire. Selecting an industry,
toggling a bonus or editing a rate updates the explanation immediately. Review still has one full summary and the
existing explicit Apply action. No backend/API/schema, financial rule, permission or saved-state writer changed.

Industry changes use a 220 ms opacity/3 px transition through the native Web Animations API. The effect stops for
reduced-motion preferences, has cancellation cleanup and works without animation support. No animation dependency,
new palette, typography change, accordion or sticky scroll container was introduced. All five app locales are covered.

## Verification

Source checks: TypeScript, 6,841 frontend tests in 464 files and the existing lint baseline passed. After the final
copy refinement the focused Wizard/locale checks passed 133 tests. The compiled browser rehearsal passed 88 checks
using only the isolated local PostgreSQL backend, local mail capture and blocked external providers. It covers all
13 actual server templates, live draft changes, no nested scrolling, explicit Apply, unchanged saved settings,
five languages, both themes, desktop/mobile overflow, runtime errors and reduced motion. There were no automatic
option writes or browser runtime errors.

Visual inspection covers the full desktop layout and English dark/German light phone layouts. Long translated
text wraps in the page; all preview content stays open. Private screenshots and results are under
`C:/wamp64/tmp/loyalty-launch-20261109/setup-preview/`.

## Release artifact

Feature source and next code baseline: `b1f5082d2`. The source patch is `2e941bdcd`, built on main
`1d1e2fa6f5dfc2ba024ad57de3ca5a55e73aa225` in a separate worktree with physical vendor and a frontend dependency
junction. Eighteen exact paths include the previous logo release's documentation-only evidence changes.
Whole-source parity with `b1f5082d2`, excluding only frontend/dist, public/spa and resources/spa-shell, passed
before and after the fresh production build.

The exact artifact passed TypeScript, **6,841 frontend tests / 464 files**, the lint regression gate
(1,383 existing diagnostics, no new ones), a fresh production build and **88 compiled real-backend browser checks**.
PHP scopes passed **2,084 tests**: Support 214, Unit Landing 118, Feature Landing 1,735, Loyalty Options 11 and
OptionsSetup 6. A parallel startup first hit a Windows package-cache rename lock; the affected suite was rerun
sequentially and all 1,735 Feature Landing tests passed. No guard, assertion or application behaviour was weakened.

Production commit `1d159b7e631127038928fedc51ee8cb44f981d20` was pushed by the source-patch recipe.
Live verification passed **12 content checks** at **10 November 2026, 09:22:54 UTC / 11:22:54 Europe/Riga** on
loyalty.hotel-tech.ai, and the same twelve checks passed at **09:23:22 UTC / 11:23:22 Europe/Riga** on app.hexa-tech.uk.
Served assets: index-BiPgZKxi.js, LoyaltyApp-BwPo5MEW.js, SetupWizard-BbkMN037.js, SetupWizard-Ch6wI-3S.css
and AppPage-Ct-qGZNw.js. The actual served code contains the expanded preview, member journey, section/catalogue
markers, new copy and reduced-motion handling; the stylesheet has no old 380 px bounded preview. Authentication,
the logo uploader and the academy's kit stylesheet remain intact. Public verification makes no authenticated writes.
Evidence: `C:/wamp64/tmp/setup-preview-production-20261110.json` and `setup-preview-production-app-20261110.json`.

Independent CI [42789526011](https://github.com/vkolotikov/hotel-tech-loyalty/actions/runs/42789526011) was still
running at 09:24 UTC: both Node SPA jobs, Larastan, dependency audit and SQLite shards 1/2 passed; SQLite shard 3
and the PostgreSQL gate were in progress, without a recorded failure. This is distinct from the completed local
artifact checks above. Task-owned PHP/preview/PostgreSQL helpers were stopped. The clean deploy worktree was removed
after verifying its exact path, branch and commit and unlinking only its node_modules junction. Shared dependencies,
private evidence, owner untracked files and the earlier blocked Cloud-stream remnant were preserved.
