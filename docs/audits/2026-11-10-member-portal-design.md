# Member web portal: Figma 01F

Owner reference: Figma `d6IGmk3hOoMw0V5rONbI1A`, page `414:8135`, four desktop/mobile pages and ten on-demand panels.
All eighteen high-fidelity contexts and their screenshots were reviewed. Implementation follows the four-page
structure while preserving the venue's identity, accent, capability gates and genuine server data.

## Delivered behaviour

- Home: compact QR membership card, qualification progress, next booking, three quick actions and recent activity.
- Rewards: benefits, redeemable rewards and offers together; remaining/locked items below; canonical request,
  cancellation, claim and redemption actions. Saved-code bookmarks and catalogue/offer/benefit links still work.
- Bookings: upcoming detail cards and a past-bookings column; real appointment/stay dates, totals, references and
  status. Detail/cancellation/calendar/payment flows keep their existing implementation.
- Profile: identity, personal details, notification panel, venue contact and account/help controls. The edit form
  survives background reads, omits blank birthdays, retains immutable email and changes language after saving.
- Shared native-dialog panels: card/access, earn, invite, activity, codes, updates, profile, preferences and reward
  confirmation/result. Inert background, unique labels, focus restoration, keyboard containment, backdrop/Escape
  handling, stacked scroll locks and pending-redemption dismissal protection.
- Original local Figma SVGs retain intrinsic proportions. QR, venue branding and merchant images remain dynamic.
  Dark navy and light themes, mobile navigation, reduced motion and five languages are covered.

The read-only `GET member/portal/programme` returns a small allowlist of earning facts from `ProgrammeOptions`
and active places judged by `AccessDecision`. It exposes no staff settings or other tenant's rows and writes no
loyalty state. Booking and money writers, public-widget contracts and existing native API shapes are unchanged.
Web-specific Help answers are separate from native-app wording; existing native-shared types/logic/locales were
not changed. Native app binaries are outside this release.

## Verification before release

- TypeScript passed; full Vitest: **6,926 tests / 470 files**. Focused portal: **716 / 47**.
- PHP member portal: **307 tests, 2,725 assertions**, including the new read-model ownership/option/access checks.
- Changed production TypeScript files pass ESLint without findings.
- Isolated migrated PostgreSQL and compiled-browser acceptance passed twenty checks: actual QR and branding,
  programme facts, referral link copy, request/cancel benefit, offer claim, pending/double-confirm redemption,
  saved codes, profile persistence, message preferences and four mobile pages without horizontal overflow.
- Desktop (1440 x 900), mobile (393 x 852), dark/light and popup screenshots were inspected and refined.
  Original SVG download/root-dimension/callsite checks pass for all 48 retained assets. No Figma download URLs
  remain at runtime. Fake demo QR patterns and unused exports were discarded.

Private local evidence: `C:/wamp64/tmp/member-portal-design-rehearsal-20261110/journey/portal-design`.
Credentials, captured mail, local database and evidence remain outside Git. No production customer writes/messages.

## Release artifact and production verification

The clean source-patch artifact matches source **7798337c7d610a157f3a78f19be203cc968f8b3d** outside generated
`frontend/dist`, `public/spa` and `resources/spa-shell`. The guarded manifest contains **102 paths**, including
deletions, SHA256 `D5562A17AB4A14EC211BFB96E1111B4BD8A6F4EA79774EEB09D2F1FFFFE2C073`.
Vendor was copied physically; the only dependency junction points to the source frontend's node_modules.

Final artifact gates passed:

- TypeScript and fresh production build/postbuild.
- **6,928 frontend tests / 470 files**; lint regression check passed with 1,381 existing findings.
- Scoped PHP: Support **214 / 1,590 assertions**, Unit Landing **118 / 1,763**, Feature Landing **1,735 / 9,552**,
  Member Portal **307 / 2,725**. Total **2,374 tests / 15,630 assertions**.
- PHPStan on the changed PHP classes: no errors. CI's full Larastan and both Node builds also passed.
- **41 compiled real-backend browser checks** across functional, language/touch and compact-value probes.
  Keyboard endpoints cycle within dialogs; focus returns; backdrop/Escape work; pending/double redemption
  is guarded. French saving, blank-birthday preservation and real 44px touch targets pass. Costs, offer values
  and validity dates remain visible at 320px and 393px without horizontal overflow. Included benefits remain
  available for assigned memberships with points disabled. Expired-card text clears 4.5:1 across the gradient.
- **19 local content/auth checks** on the compiled artifact, then **40 live checks** across both production
  domains and the Academy author stylesheet. Original visible SVG geometry was checked in the touch browser.

The fixed-clock rehearsal accumulated rate limits during repeated runs; only its isolated database cache was
cleared before the final compact-value probe. No production cache or customer state was changed.

Production main **8f12b72ac068302577708b7de87995772a967301**, verified live at **2026-11-10 17:05:47 UTC**
(19:05:47 Europe/Riga). Both domains serve `index-B9QSxLsN.js`, `PortalApp-BcRdNP-6.js`,
`PortalApp-BlRTEMfA.css` and `index-D7h0NFI7.css`. Live evidence:
`C:/wamp64/tmp/member-portal-production-20261110.json`.

Next source-patch code baseline: **7798337c7**. Later evidence documentation is not new product code.
[CI 42860594743](https://github.com/vkolotikov/hotel-tech-loyalty/actions/runs/42860594743) is still finishing:
Node 24/26, dependency audit, Larastan and SQLite shards 1/2 passed; PostgreSQL and SQLite shard 3 remain pending.
