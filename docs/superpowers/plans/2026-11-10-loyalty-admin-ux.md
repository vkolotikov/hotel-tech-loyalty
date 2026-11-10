# Loyalty administration UX implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.
> Implementation is inline; only the required builder check and final whole-branch review use fresh read-only agents.

**Goal:** Ship the owner's eight Figma administration screens with single homes for settings and real member outcomes.
**Architecture:** Preserve the canonical option, tier, assignment, place, boost and reward writers. Add a small shared
management presentation layer and central legacy-URL resolver; compose current editors behind explicit Edit actions.
**Tech Stack:** Laravel13/PHP8.5.12, React/TypeScript, TanStack Query, existing a-/l- CSS, Poppins, original Figma SVGs.
**Spec:** docs/superpowers/specs/2026-11-10-loyalty-admin-ux-design.md

## Global constraints

- Existing loyalty APIs only, every call with brand_id=all; server option choices and permission decisions remain canonical.
- No destructive record migration, payment integration, live test invitations/campaigns, new library or native app release.
- Five locales en/ru/de/fr/es; Spanish usted. Both themes, keyboard focus, reduced motion and390px mobile support.
- Points are written only by LoyaltyService; timed/claimed max-once promotions and independent tier multipliers remain.
- The public booking widget and installed native API contracts remain unchanged.
- Scoped PHP8.5 tests only; never bare artisan test. Source-patch deploy baseline d12ba343f on main e0a466c9c.

## Review focus

- Legacy URLs with filters/selected IDs/editor state reach the intended new home without a redirect loop or wrong editor.
- A selected record disappears or changes during refresh: preserve an unsaved draft and never save against a new selection.
- Invitation-only/inactive/entry tiers must not receive false missing-threshold warnings or assignments to foreign records.
- Multiple tier perk values, disabled perks and inactive tiers: preview the chosen assignment and show unmet readiness honestly.
- Disabled, boundary-day, exhausted and future promotions: keep calendar state separate from claim availability and don't compound boosts.

## Task1: Canonical navigation and shared design primitives

Files: new management/navigation.ts, navigation.test.ts, ManagementUI.tsx, management.css, assets.ts and words.ts;
five adminux locale bundles; LoyaltyApp.tsx, OverviewShell.tsx and relevant existing link builders.
Interfaces: legacyDestination(path,search,hash): string|null; canonical Program/Earning/Rewards links;
ManagementHeading, ManagementColumns, ManagementVisual, ManagementStatus and selection rows compose existing primitives.

- [ ] Add failing navigation tests for rules/rule, points_expiry, tier_progress, boosts, benefits, setup and readiness;
      assert IDs/filters survive and canonical destinations return null.
- [ ] Run focused Vitest and observe missing resolver failure; implement redirects and the exact two/two/three submenus.
- [ ] Install only used Figma SVGs from the downloaded261-asset reference inventory; reuse exact existing matches,
      record hashes/intrinsic dimensions/slots, and build the responsive shared presentation using current tokens.
- [ ] Add five locale bundles, verify navigation/guide links, TypeScript and focused shell tests; commit.

## Task2: Levels, qualification/readiness and shared perk assignments

Files: TierAdvice.php/test; program/ProgramPage.tsx; new management/LevelsPage.tsx, ProgrammeSettings.tsx,
ProgrammeReadiness.tsx, TierAssignmentEditor.tsx; existing TierEditorPage and TierBenefitDialog consumers.
Interfaces: tiers_missing_threshold advice {code,level,params.n,tiers,benefits:[]}; TierAssignmentEditor receives
Program plus optional tierId/benefitId/current assignment and closes through caller; qualification saves tier_progress_by.

- [ ] Add RED missing-threshold tests: exclude first active non-invitation entry, inactive/invitation tiers; name each
      other null floor on the current measure. Preserve duplicate-floor and benefit-unused semantics.
- [ ] Implement the additive server check. Render the actual tier path/detail, status+Edit, thresholds/rates/members,
      real perks and direct per-tier correction links. Retain existing threshold editor/deletion/confirmation writers.
- [ ] Build one contextual assignment chooser/editor and use it from Levels, TierEditor and Tier Perks.
- [ ] Move qualification into Program and add readiness action using actual server advice, direct destinations and
      existing validated fixes. Verify manager/read-only/tenant refusal and real assignment edits; commit.

## Task3: Earning Rules and Bonuses & Boosts

Files: earn/EarnPage.tsx, EarnEditor.tsx, SharedRules.tsx, model.ts/tests; new BonusBoostsPage.tsx/preview helpers;
existing BoostDialog/confirmation/removal controls; focused LoyaltyService spend/booking/desk tests.
Interfaces: earning selection uses selected=<way>, editor way=<way>; bonus detail read default, edit=1 opens editor;
boost=<id|new> selects/edits a real Program boost. Points Settings writes only points_expiry_months.

- [ ] Add regression tests for rate inheritance and independent booking/desk trigger switches; demonstrate highest
      timed/claimed multiplier once alongside unchanged tier rate/standing multiplier and bounded membership term.
- [ ] Verify existing engine behavior, correcting only a reproduced mismatch. Build read-only selected-rule previews
      using current options, currency and floor. Link inherited booking/desk rates to earn_rate's existing editor.
- [ ] Split milestone bonuses and timed boosts in one screen. Explicit Edit opens existing forms; actual amounts,
      timing, days/tiers/brands and old-time confirmation remain. Link referrals here and claimed offers to Offers.
- [ ] Move expiry to Points Settings; qualification links go to Program. Preserve unsaved/retry behavior and unknown
      server ways under an expandable advanced section. Run focused suites and commit.

## Task4: Points Rewards, Tier Perks and Offers

Files: rewards/design/{PointsRewardsPage,MembershipBenefitsPage,OffersDesignPage,RewardUI,math,presentation};
shared TierAssignmentEditor; related types/tests and adminux words.
Interfaces: server Offer.state stays off/upcoming/live/ended; counts derive from returned records. Perk preview uses
the explicitly selected tier's TierBenefit; assignment actions pass that tier/benefit into the shared editor.

- [ ] Add meaningful preview/filter/status boundary tests and preserve selected-record editor pinning across refresh.
- [ ] Apply the shared list/detail composition, compact controls and status-adjacent Edit; preserve dynamic images,
      real reward costs/stock/terms, deletion guards and explicit member redemption instructions.
- [ ] Add actionable unassigned perk filters/counts and explicit tier previews, including inactive-only assignments.
- [ ] Derive offer filter counts from server states, show actual dates/eligibility/scope/limits; keep advanced settings
      expandable and the existing guarded offer editor. Redemptions link only from Rewards, referrals from Bonuses.
- [ ] Verify current APIs and member-visible outcomes plus capability refusals; commit.

## Task5: Places/NFC and Guided Setup

Files: places/PlacesDirectory.tsx, PlacesSection.tsx; scan/ScanPage.tsx, DoorPage.tsx, scanMath.ts/tests;
options/SetupWizard.tsx, SetupPreview.tsx, setup CSS and tests.
Interfaces: Place data remains today's existing model; scanner links preserve place/method context. NFC supported
preference is a pure decision and requests no permission until pressed. Setup preview consumes effective draft options.

- [ ] Add tests for NFC preference/fallback and explicit physical serial identity without changing personal token
      precedence; retain replay keys, place context and restricted partner boundary.
- [ ] Render place selection/details with actual tier access/totals, existing manager/entry dialogs and labelled
      membership+eligible-tier access examples. Show NFC-first/QR/lookup actions; no invented entrances/hours.
- [ ] Simplify wizard starting points and browse-more interaction, keeping all industry templates and four-step
      review/apply semantics. Build expanded member journey from actual draft values and a real available reward;
      test zero/no-reward/no-earner cases and catalogue preservation.
- [ ] Inspect all eight compiled screens at1440 and390 in both themes; verify all five languages, refine, commit.

## Task6: Review, release and handoff

- [ ] Run full TypeScript/Vitest/lint/Larastan; scoped changed PHP/shared consumers on SQLite and fully migrated local
      PostgreSQL. Run real-backend navigation/edit/member-outcome journeys with local mail and blocked external sends.
- [ ] Fresh whole-branch read-only review; resolve material findings with regression evidence, update docs/guide and
      record the exact source manifest including deletions. Push feature source without built paths.
- [ ] Source-patch deployment worktree from origin/main, physical vendor, whole-source parity excluding only three
      generated paths; required scoped PHP/frontend gates, fresh build, deploy and verify actual live content/auth/landing.
- [ ] Record CI results, screenshots and outstanding physical-device acceptance; update latest handoff and remove
      only provenance-verified task-owned helpers/junctions/worktrees. Summarise the shipped user flows.
