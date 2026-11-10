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

Release artifact gates and live deployment evidence are recorded below after completion.
