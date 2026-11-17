# Loyalty Setup and Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make earning optional, business suggestions current, reward settings coherent and portal-to-Android activation reliable.

**Architecture:** Keep ProgrammeOptions as the one settings writer, LoyaltyService as the spending formula and
ProgrammeSetup as the transactional setup boundary. Server-described template reward choices are draft-only until
Apply. Authentication retains strict purpose-bound identity proof. Independent authentication and reward-layout
tasks run in parallel under the dispatching-parallel-agents workflow; root owns integration and release.

**Tech Stack:** Laravel 13 / PHP 8.5, React / TypeScript / Vite, SQLite and PostgreSQL 18, Vitest and Playwright.

**Spec:** `docs/superpowers/specs/2026-11-17-loyalty-setup-activation-design.md`

## Global constraints

- Worktree `E:/Hexa-Tech-loyalty-setup-activation-20261117`, feature branch based on production `cfc08ce6e`.
- PHP `C:/wamp64/bin/php/php8.5.12-nts/php.exe`; every artisan test names files or directories.
- Only ProgrammeOptions reads/writes programme options; only LoyaltyService writes points.
- Preserve existing members, balances, tiers, redemptions, installed API contracts and five language bundles.
- Local mail only; no real email, production account mutation or financial transaction for verification.
- Build generated assets only in the isolated deployment worktree; no feature merge to main.

## Review focus

1. Disabling spend points must not stop visit/stamp/bonus rewards or reverse past points.
2. A new business template must not retain another template's selected reward or fabricate an available reward.
3. Invalid, cross-tenant, expired or repeated template selections must write no duplicate or partial catalogue data.
4. Advanced validation errors must open the correct section and remain keyboard reachable on mobile.
5. Portal-created members activating on Android must retain identity; wrong-purpose/expired codes remain refused.

### Task 1: Optional spend points

**Files:** ProgrammeOptions, ProgrammeAdvice, LoyaltyService, Portal/MemberProgramme; loyalty options/earn helpers,
setup chooser, preview and their area translations; OptionsTest, real earning/visit tests and helper tests.

- [ ] Add failing controller/earning tests for default-on, manager off/on, preserved rate, zero spend award and retained bonuses/visits.
- [ ] Run the scoped tests and inspect the failure before implementation.
- [ ] Add `spend_points_enabled` (bool, default true), expose the earn-rate switch and enforce it in the shared spending formula.
- [ ] Update advice, member-facing effective rates and previews; show tier progress as a required rule, not an untickable earning option.
- [ ] Run focused tests, then commit only this task's paths.

### Task 2: Business-specific draft rewards

**Files:** LoyaltyPresetService, ProgrammeOverview, ProgrammeSetup, OptionsController; options types/math/SetupWizard,
SetupPreview/parts, setupJourney, their translations; OptionsSetupTest and setup browser/helper tests.

- [ ] Reproduce hotel-to-restaurant retained reward selection and stale preview with literal expected examples.
- [ ] Describe template reward choices on the server and project draft choices in the wizard, grouped separately from saved rewards.
- [ ] Accept an optional wizard-only template reward reference; resolve and validate it under the setup transaction and idempotency key.
- [ ] Preserve existing catalogue rows; create/reuse only the selected own-organisation reward and invalidate catalogue reads after Apply.
- [ ] Test rollback, tenant binding, invalid selection, same-key replay, preserved tiers/history and updated preview; commit.

### Task 3: Unified reward advanced settings

**Files:** reward selected panel/editor, scoped rewardAdvanced.css, rewarddesign five locales, reward UI tests.

- [ ] Use one Advanced settings section with visible Terms and meaningful groups.
- [ ] Preserve all fields, validation, rights and API payloads; open on any advanced validation error.
- [ ] Verify desktop/phone, both themes, keyboard and no duplicate disclosures; commit after integration review.

### Task 4: Activation handoff

**Files:** AuthController, relevant AccountRecovery/model/mail services, portal Claim if required and Auth regression tests.

- [ ] Reproduce the actual portal-created-member/Android activation path and the claim-purpose mismatch.
- [ ] Repair issuance/purpose and resend/counter lifecycle with failing tests first; preserve original expiry and purpose isolation.
- [ ] Check code normalization/leading zeros, repeated sends, throttling, unknown/staff/foreign identities and successful retries.
- [ ] Report any installed-native update requirement; do not import unrelated app source or publish a store build.

### Task 5: Integrate and release

- [ ] Review all changes together; independent review and fixes precede release.
- [ ] Run appropriate full scoped backend suites, fresh PostgreSQL checks, forced TypeScript, full Vitest, lint and Larastan.
- [ ] Browser screenshot/review the requested flows and update runbooks/handoff.
- [ ] Apply an exact allowlisted source patch onto current main in a separate worktree; verify whole-source parity.
- [ ] Run artifact gates, build fresh assets, push the verified deployment branch to main and verify live content/protection.
- [ ] Record release/CI receipts, retain source and clean only owned temporary release resources.
