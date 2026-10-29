# Guided setup, Settings and section style review

29 October 2026. Owner request: bring Guided setup and Settings into the refined Loyalty style and review the other sections for consistency.

## Implemented

- `/loyalty/settings` now has the shared Figma frame, staged language/theme preferences, Save/Discard, manager-only currency selection, a server-reviewed currency confirmation, related links and Full admin access. Existing quick sidebar preferences remain; their first link opens the full Settings page.
- `/loyalty/options/setup` retains the real four-step business/ways/configuration/review workflow, now with a progress banner, compact step navigation, live member-rule preview, collapsed reference presets for existing programmes, consistent dialogs and responsive columns. Leaving edited choices asks before discarding. Apply retains its idempotency key on retry; Skip retains its existing endpoint and confirmation.
- Get started, Guide, Import and Duplicates now use the shared Overview frame, Poppins, gradients, inset fields and raised controls. Import and Duplicates use stacked headings. Their routes and business behavior remain.
- Other existing sections were reviewed at desktop and phone widths. Their intentional differences (tables, editor panes, scanner viewport) remain within the shared style. No full-admin or member-portal theme changes, backend changes, migrations or dependencies.

## Design source and comparison

Connected Figma file `d6IGmk3hOoMw0V5rONbI1A`; session `b2f3abab-eabc-4a63-9002-6668f3ee87ad`.

| Frame | Exact node | Implementation |
| --- | --- | --- |
| PG-07 Guided setup | `92:3958` | Shared sidebar, indigo progress banner, 744/376 column relationship, raised controls, programme preview and optional links |
| ST-01 Settings | `208:7104` | 688/432 columns, preferences, administration, related/help cards and save footer |
| ST-02 Review currency change | `210:7325` | 560px bounded dialog, before/after amounts, amber relabel notice and explicit confirmation |

Both full frames and the currency dialog were inspected through the plugin, including design context and screenshots. Figma reference PNGs and browser renders are in `evidence/settings-setup/`. All 34 SVG references were downloaded and hash checked: 32 reuse exact existing exports, and the two Program icons are vendored at their native 20×20 geometry. Temporary Figma URLs are not runtime sources.

Intentional adaptations preserve verified behavior: the wizard edits real server-provided options rather than introducing an unsupported saved-draft service. Its preview displays actual draft rule sentences rather than Figma's illustrative 250/500-point example. The currency dialog includes the existing server's payment, booking, stay and price-relabel warnings, so its height grows beyond the illustrative empty-warning frame. Actual organisation/staff identity replaces demo labels.

Visual review corrected the setup subtitle position, preference-panel padding, utility-page gaps, related-link descriptions and currency-dialog spacing. Screens collapse into one column without page overflow; long setup previews scroll inside a bounded, keyboard-focusable region.

## Data and preserved behavior

| Surface | Existing integration | Verification |
| --- | --- | --- |
| Language/theme | Existing i18n storage and frame `useLook` state | Staging, Save, Discard, reload persistence and Auto/system changes |
| Currency | `GET/PUT /v1/admin/loyalty/currency` | Server options, dry run before write, actual warnings, cancel, errors/retry and manager permission |
| Setup | `GET options`, `POST options/setup`, `POST options/setup/skip` | Existing tiers preserved, draft preview, validation, Apply retry key and skip cancellation |
| Utility pages | Existing start/import/duplicate services | Same route components, shared frame, responsive layout |

All Loyalty requests retain `brand_id=all`. Currency uses the existing scope-aware query key and refreshes bootstrap/Insights after a successful write. Settings drafts remount on organisation/staff/capability scope changes. Personal preferences do not depend on manager-only currency access. Full admin and Content keep their existing defaults: the shared footer's full Settings link is optional and supplied only by Loyalty.

All new copy is translated into English, Russian, German, French and Spanish. Demo API fixtures are confined to browser tests; production never falls back to them.

## Validation and release

Final isolated artifact: **5,717 frontend tests in 394 files**, **69 PHP tests / 719 assertions**, TypeScript, full Loyalty/shared-footer ESLint and a fresh Vite/postbuild passed. Compiled Chrome: **79 setup/settings checks**, no runtime errors, including 320/390/768/1024/1280/1440px layouts. Section audit: **30 routes/tabs, 60 desktop/phone views**, plus all four utility pages at three widths within the 79 checks. The audit covers Overview, Members/profile, all Program sections, earning/bonus/rules, rewards/benefits/offers/redemptions/referrals, Events, Requests, Insights, Card & app, Scan and Campaigns (including Push, SMS and Segments).

Production commit **ce1f55e0f349ee5cb236b63ac6e48704c6d3dd4d** was pushed from the isolated deploy branch. It starts from production `8f7c18159`, using the source-patch recipe in `docs/landing-page-builder.md` §6 and the prior source baseline `de39dc9a9`. Whole-source parity passed across 152 explicitly allowed paths, including prior-release documentation. The final source patch is `56c9049de`.

Feature branch: `feature/loyalty-settings-setup-20261029`. Deployed feature source and **next source-patch baseline: `43382945207c44ae6a6ce952272121e32e6a1d10`**. Later documentation/evidence commits are not that baseline. No feature-branch build outputs were shipped. Browser writes are intercepted fixtures; production verification is read-only and does not change real settings or member records.

Live content verified **29 October, 11:03 Europe/Riga**. Entry `index-CKJuCZ7B.js`, Loyalty `LoyaltyApp-DVccFo2K.js` / `LoyaltyApp-CTQS2Qab.css`. New page/style markers, existing Insights/Campaigns/Scan/Requests/Card markers, three Poppins payloads and currency/options/start authentication responses passed. The public landing kit retained its stylesheet without retired `rp-` markers; the retired stylesheet returned 404. Exact evidence: `evidence/settings-setup/live-verification.json` and `verification.json`.
