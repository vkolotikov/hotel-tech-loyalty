# Members Loyalty Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the members app up to date with current loyalty memberships, personal offers and enabled event registration.

**Architecture:** Expo SDK 58 native screens consume existing member APIs. Reuse portal types, pure decisions and five-language words. Keep the foreground-refresh fix from native 2.0.1.

**Tech Stack:** React Native, Expo Router, TanStack Query, TypeScript, Vitest, Expo FileSystem/Sharing.

**Spec:** `docs/superpowers/specs/2026-11-11-member-loyalty-refresh-design.md`

## Global Constraints

- Android/iOS members app only, `com.hotelloyalty.app`; retain session keys and identity.
- Existing shared portal/API rules own points, memberships, admission and event capacity.
- No Staff edits, Laravel deployment, production data writes or external messages.
- Five languages, dynamic venue accent; SDK-compatible dependencies only.

## Review Focus

- Assigned memberships with points disabled retain benefits and dates without points UI.
- Unavailable/expired personal offers cannot present vouchers as usable.
- Booking deep links and Help do not expose excluded appointment/stay flows.
- Duplicate redemption taps issue one request; a failed request clears its in-flight lock.
- Refreshed capability changes hide stale Events/Wallet controls.

## Tasks

### 1. Membership and feature scope

Files: `src/lib/loyalty.ts`, its decision tests, Home/Card/Rewards/More/Help, route guards, `MemberCard.tsx`, `queries.ts`, `format.ts`.

- [x] Baseline native typecheck/tests on latest shared portal; record existing lint.
- [x] Test points-off assigned membership, missing Wallet flags, excluded booking routes and event capability changes.
- [x] Implement pure feature decisions and consistent navigation; preserve real QR/session/refresh behaviour.
- [x] Run focused tests/typecheck and inspect browser layouts.

### 2. Programme and enabled event registration

Files: `src/app/programme.tsx`, API/types, shared programme DTO; existing `events.tsx` and `Programme.tsx`.

- [x] Add and test the existing programme API contract, with earning/access facts rendered verbatim from server decisions.
- [x] Add programme links; ensure event entry/sign-up/cancel/refusals refresh appropriate caches and obey capability.
- [x] Verify membership states and enabled/disabled event registration/history with decision tests and browser fixtures.

### 3. Rewards, personal vouchers and inbox

Files: `src/app/(tabs)/rewards.tsx`, `src/app/inbox.tsx`, `components/VoucherDownload.tsx`, `lib/voucher.ts`/`.web.ts`, API binary handling, five-language metadata and app copy.

- [x] Test authenticated attachment success/refusal, safe filenames, inbox offer metadata, retained refresh/pagination and redemption races.
- [x] Implement temporary native sharing and web blob download with SDK-compatible dependencies.
- [x] Render offer terms, eligibility and points-paid-on-claim history; guard redemption confirmation and refresh failures.
- [x] Verify downloaded original bytes, no bearer token in URLs, locale parity and native typecheck.

### 4. Acceptance and release records

- [x] Run native typecheck/tests/lint, dependency check, web export, shared portal regression tests and browser acceptance.
- [x] Review branch diff, update plan/audit/handoff and version/store metadata; record physical-device limits.
- [x] Commit and push the feature branch. Do not merge the native app into Laravel main or claim a store release before an actual build/submission.

## Execution record

- Scope: loyalty plus enabled event registration; existing canonical endpoints are reused. No appointment/stay screens are exposed.
- Existing linked checkout reused on a new feature branch, platform 80b229347 plus native 662ce3686; no Staff changes or Laravel deploy.
- Fresh builder/code reviews found birthday draft and late-account cache issues. Regressions pass; profile responses scope to originating user ID and inbox/message callbacks to the originating token. Reviewer recheck reports no remaining P1/P2.
- Source checks are complete: native TypeScript/56 tests, shared frontend TypeScript/720 tests, 38 SQLite backend contract tests, 146 fixture browser checks and Android/iOS/web exports. Lint adds zero findings against the native baseline.
- Ruling: prepare fresh signed testing binaries as a separate checkpoint because FileSystem/Sharing adds native modules. Existing EAS account is authenticated; read-only history confirms latest builds are still 2.0.1 (iOS 21, Android 27), so no 2.1 duplicate exists. Inspect the filtered archive before uploading; do not submit to public review or claim physical acceptance.
- Additional browser smoke: seven checks confirm birthday save/refresh, late cross-account profile responses, omitted untouched birthday, Inbox read state and Offers navigation. Combined fixture acceptance: **153 checks**.
- A final package-script audit removed a duplicate `lint` key that would otherwise override the direct installed ESLint command with Expo's misdetecting wrapper. This tooling correction does not change the built native runtime.
