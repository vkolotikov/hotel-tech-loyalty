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

Artifact validation and production verification will be recorded below once complete.
