# HexaTech handoff — 29 October 2026

Read this first, then `2026-10-28-hexatech-handoff.md` for previous milestones and
`2026-10-27-hexatech-handoff.md` for the full environment and history. Root AGENTS.md and CLAUDE.md still apply.

## Current production release: Guided setup and Settings

Production **ce1f55e0f349ee5cb236b63ac6e48704c6d3dd4d**, live content verified **29 October, 11:03 Europe/Riga**.
Feature `feature/loyalty-settings-setup-20261029`; deployed feature source and **next source-patch baseline**:
**43382945207c44ae6a6ce952272121e32e6a1d10**. Do not use a later documentation/evidence commit.
Isolated artifact parent **8f7c18159**, final source patch **56c9049de**, 152 explicitly allowed paths;
whole-source parity passed. Report: `docs/loyalty-redesign/21-SETTINGS-SETUP-REPORT.md`.

Exact connected Figma PG-07 `92:3958`, ST-01 `208:7104`, ST-02 `210:7325` were inspected and compared with browser
renders. Guided setup keeps its real four-step editor, server options, current tiers, idempotent Apply and Skip,
with a progress banner, bounded live rule preview, compact reference presets and leave confirmation.
Selecting the current Review step retains the retry key. No unsupported persistent-draft service was invented.

New `/loyalty/settings` has staged language/theme preferences, Save/Discard and the existing manager-only
currency API/dry run/warnings. It shares the frame's live theme state; drafts reset with tenant/staff/capability
scope. Existing quick preferences remain, with All settings opening the new page and dismissing the popup.
Get started, Guide, Import and Duplicates now share the Overview frame, typography and controls. All regular
Loyalty routes use that frame; continuous door mode remains outside it. Content/full-admin defaults are retained.

Final artifact: **5,717 frontend tests in 394 files**, **69 PHP tests / 719 assertions** (Currency/Options/Setup/
Start/Access/Gate/Import/Duplicates filter), TypeScript, full Loyalty/shared-footer ESLint and fresh build passed.
Compiled Chrome: **79 setup/settings checks**, **60 desktop/mobile style views across 30 routes/tabs**, no runtime
errors. Six widths, five languages, dark/light/Auto, actual draft values, currency failures/retry/confirmation,
staff restrictions and setup idempotency were checked. Browser writes are intercepted fixtures; live checks are
read-only content and authentication checks. No backend, migration, dependency or production-data changes.

Live entry `index-CKJuCZ7B.js`, Loyalty `LoyaltyApp-DVccFo2K.js` / `LoyaltyApp-CTQS2Qab.css`. New/existing markers,
responsive styles, three fonts, currency/options/start authentication (401), public landing kit and retired CSS
(404) passed. Evidence: `docs/loyalty-redesign/evidence/settings-setup/`.

Private helpers/logs: `E:/Hexa-Tech-release/settings-setup-*`, `settings-style-review.cjs`, `settings-assets*` and
`logs/settings-setup-*`. Temporary artifact `E:/Hexa-Tech-release/settings-setup` and preview PID 38140 are removed
after verification. Original Vite PID 1992 and the user's unrelated untracked files are preserved. Feature-branch
build outputs were not committed. Deployment still follows the recipe and standing authorization described below.

## Previous production release: compact Insights membership layout

Production **8f7c18159e6ae6d082c7f0db7706592cbdb1fbbb**, live content verified **29 October, 09:55 Europe/Riga**.
Feature `feature/insights-layout-20261029`; deployed source and **next source-patch baseline**:
**de39dc9a9e5c26898a13821dd68554f113c0cb7d**. Do not use the later documentation/evidence commit.
Isolated artifact parent **59a6bda89**, source patch **b314325b8**, 34 explicitly allowed paths; whole-source parity passed.
Read `docs/loyalty-redesign/20-INSIGHTS-LAYOUT-REPORT.md` for the precise scope and evidence.

The owner supplied a screenshot of an excessively tall Membership levels card. Re-inspected exact Figma IN-01
`136:6541`. The card now displays populated levels compactly beside its donut, puts empty levels in a native
keyboard-operable disclosure, caps long lists with keyboard scrolling and stacks cleanly on narrow screens.
The adjacent activity chart no longer stretches with the tier list. Counts, percentages, server order/color
association and unassigned members are retained. Two new strings are translated into all five languages.
No backend, API, migration, dependency or data-definition changes. Filters, CSV, charts and detailed reports remain.

Final artifact: **5,704 frontend tests in 394 files**, **33 PHP tests / 276 assertions** (scoped Insights filter),
TypeScript, full Loyalty ESLint and fresh Vite/postbuild passed. Compiled Chrome: **48 layout + 59 existing
interaction/state checks**, no runtime errors. Seven widths, five languages, both themes, the screenshot's
179/3/2 out of 184 distribution, 30 populated tiers, long names, empty and unassigned membership were exercised.
Final compiled desktop and mobile renders were visually compared to Figma. Browser APIs are intercepted local
fixtures; live verification is read-only content and authentication checks, not authenticated production data.

Live entry `index-hJ5Z0xdJ.js`, Loyalty `LoyaltyApp-CKwz0Hzw.js` / `LoyaltyApp-B7Gq2D31.css`.
New and existing feature markers, responsive styles, three local font payloads, three API authentication checks,
public landing kit and retired CSS 404 passed. Evidence: `docs/loyalty-redesign/evidence/insights-layout/`.

Private helpers/logs: `E:/Hexa-Tech-release/insights-layout-*` and `logs/insights-layout-*`.
The temporary release worktree and its own preview server are removed after verification; the original Vite
PID 1992 and user untracked files are preserved. No feature-branch build outputs are committed.

Deployment still follows the source-patch recipe from `docs/landing-page-builder.md` §6. Use PHP 8.4.20,
`XDEBUG_MODE=off`, `-d max_execution_time=0`; never junction vendor. Foreground scoped PHP runs only.
The owner's standing instruction to deploy completed verified work without asking remains in CLAUDE.md.
