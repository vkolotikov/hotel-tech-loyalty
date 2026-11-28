# Hexa Loyalty administration UX pass

Implement the owner's supplied navigation, functionality and eight-screen Figma brief. The audience is an owner
or manager configuring a programme for the first time, alongside staff who must retain their existing read/action
permissions. Success means one obvious home per setting, useful previews from saved data and reliable old links.

## Reference and visual system

Figma file d6IGmk3hOoMw0V5rONbI1A, page353:8135. Inspected high-fidelity contexts and screenshots:
Levels353:8139; Places354:8350; Setup354:8738; Earning355:8570; Bonuses355:8949; Rewards356:8896;
Perks356:9329; Offers356:9755. Figma session f7dac795-0276-4c2b-8c84-7a9d14b91650.

Use the reference's existing Poppins/navy product system, cyan selected rows, restrained violet primary actions,
compact coloured icons and original SVG artwork. Keep the existing light theme and branded accents. The owner's
specific product reference takes precedence over the house style's generic marketing-page typography/surface rules.
Compose OverviewButton, DesignDialog, FormField and existing query/writer components; no new UI library.

At1440px the content has32px gutters,24px gaps and a680/440 list/detail split. Panels have20px padding and16px radii.
Rows select a detail; status and Edit share the detail heading. On narrow screens stack the detail and list, preserve
the illustration, wrap controls and keep actions reachable. Keyboard focus, readable contrast, both themes and
reduced motion remain supported. Examples are labelled and never presented as actual member transactions.

## Navigation and single homes

- Program has Levels & Tiers and Places & Access. Guided Setup and Readiness are Program actions.
- Ways to Earn has Earning Rules and Bonuses & Boosts. Points Settings/expiry is an Earning Rules action.
- Rewards & Benefits has Points Rewards, Tier Perks and Offers. Redemptions is linked from Points Rewards;
  referral activity from Bonuses & Boosts. Existing activity routes remain reachable.
- Keep current base paths and existing APIs. Canonical tabs remain program tiers/places, options earn/bonus,
  rewards catalogue/benefits/offers. Add program/setup as the setup home; redirect options/setup.
- Centralise legacy URL resolution, preserving applicable query state: program boosts→options bonus; program
  benefits→rewards benefits; options rule/rules→Program qualification; explicit points_expiry→Earning points settings;
  options overview→Program readiness. Existing selected/editor IDs keep their records. Fix all Qualification Rules links.

## Programme configuration

Levels has the selected qualification basis, a tier path with real thresholds/member counts/rates, and the selected
tier's actual perks. Edit rules opens the existing tier_progress_by option through the canonical options writer.
Threshold editing uses the existing tier editor. Add a server TierAdvice code tiers_missing_threshold for active,
non-invitation progression tiers with null measure thresholds, excluding the first active non-invitation entry tier.
Each named tier opens its own threshold editor. Preserve existing duplicate-threshold and unused-perk checks.

One shared assignment editor composes TierBenefitDialog and existing add/update/remove APIs. It is reached from
Levels and Tier Perks, accepts initial tier/benefit context and previews the actual assignment values. A benefit
assigned only to inactive levels still needs an active level; use the server advice rather than invent readiness rules
in React. Do not create a second benefit catalogue in Program. Advanced catalogue/settings remain available through Edit.

Readiness displays canonical ProgrammeAdvice and TierAdvice with direct actions, retaining existing validated fixes.
Guided Setup keeps the four steps, draft/review/apply, existing catalogue preservation, selectable industry templates
and idempotency. Simplify the first screen to current/recommended starting points plus Browse templates. The expanded,
non-scrolling right panel illustrates Join→Spend→Redeem using effective draft rates/bonuses and a real available reward;
show no-reward/no-earner states honestly. Do not manufacture a reward cost or replace existing tiers/rewards.

## Earning and promotions

Inspection confirms ProgrammeOptions.points_per_currency is already shared by purchase, booking and desk callers
of LoyaltyService.pointsForSpend. Retain it as the single editable purchase rate. Booking and desk switches stay
independent; their rows/details explicitly inherit that rate and link to its editor. Earning previews use the actual
selected method/rate, venue currency and whole-point floor. They state when they are before multipliers.

Bonuses & Boosts contains milestone bonuses and real timed boosts as distinct lists; a selection shows read-only
member outcomes until Edit. Welcome/birthday/referral amounts and referral award timing come from saved options.
Timed boosts use existing Program boost APIs/dialogs, brand/tier/day/time scopes, manager permissions and old-time
confirmation. Claimed offers stay under Offers, with a concise cross-link explaining their separate claim step.

The engine already takes max(eligible timed boost, eligible claimed offer) once, and preserves the independent
tier earn rate and standing tier points multiplier. Pin this with meaningful spend/booking/desk regression checks;
do not replace the formula or create duplicate rate settings. Preserve membership-term eligibility and trigger gates.

## Rewards, perks and offers

Reuse current catalogue/edit/delete/disable writers and guards. Compact list/detail controls, actual reward costs,
eligibility and redemption instructions take priority; terms, stock/usage limits and other advanced details expand.
Preserve dynamic uploaded pictures. Use original reference artwork as the decorative stand-in/visual slot, never as
a screenshot of UI. Perk preview follows the selected tier's actual value/type/scope and delivery mode. Unassigned
perks link directly to the shared assignment editor. Counts and filters operate on actual returned records.

Offer state remains the server's venue-day state (off, upcoming, live, ended); counts are derived from it after refresh.
Show real start/end, scope, tier eligibility, code and actual usage limits, retaining the existing offer editor and
unsaved guards. Usage-cap availability is separate from calendar state. Do not change native/API enum contracts.

## Places and door checks

The current API stores a place, active flag, admitted tiers and today's granted/denied entries. It has no separate
entrance/hour/override records. Implement Figma's list/detail composition with those real fields and totals; no fake
entrance counts, opening hours or configuration controls. The access illustration uses valid membership plus eligible
tier→entry as a labelled example. Preserve PlaceDialog, entries, removal and the door/scan context.

Offer NFC first where browser/device support exists; QR and exact member lookup remain visible fallbacks. A method
switch alone must not request camera/NFC permission. Physical serial/reader identity uses HTCARD to preserve the
previous release's personal Wallet separation; keep scans idempotent, tenant scoped and server decided. No phone,
card hardware, Wallet issuer or push-delivery configuration is changed by this web release.

## Constraints and acceptance

No payment integration, destructive record migration or customer messages. All option choices come from the server.
Only a-* / l-* tokens and loyalty endpoints with brand_id=all; five locales en/ru/de/fr/es, Spanish usted. Preserve
manager/capability/partner boundaries and additive native contracts. Keep the public booking widget unchanged.

Verify legacy navigation, selecting/filtering, edits and cancel/unsaved behavior, qualifications and assignments,
member point outcomes, offer dates/status counts, NFC/QR fallback and tenant/refusal cases. Inspect real compiled
desktop/mobile screenshots against all eight references and test both themes/five locales. Scope PHP8.5 tests;
run TypeScript/full Vitest/lint/Larastan and relevant SQLite/PostgreSQL consumers. Deploy by the repository source-patch
recipe from code baseline d12ba343f on production e0a466c9c, with artifact checks, fresh build and live content checks.

Implementation choices are made inline under the owner's explicit Implement brief; there is no new approval gate
for the already authorised scope. A fresh builder check reviews this description, and one fresh whole-branch review
checks the final implementation. Neither delegates implementation.
