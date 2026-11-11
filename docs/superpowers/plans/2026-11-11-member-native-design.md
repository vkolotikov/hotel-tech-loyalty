# Members App Contextual Design Implementation Plan

Implementation status: complete. Final independent review finding corrected with a failing-to-passing Android SVG regression; TypeScript/71 tests, 266 isolated browser checks, SDK compatibility and Android/iOS/web exports verified. Source stays on the existing feature branch; signed builds and physical-device QA remain release work.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Refine Figma interactions, then implement the approved luxury member screens, contextual popups and confirmed loyalty feedback in the existing app.

**Architecture:** Keep Expo Router, existing member APIs, React Query/session safeguards and shared portal logic. Reuse the native UI primitives, add one measured popup component and one server-update feedback observer, and apply the Figma styles across screen families. The controller implements this coupled UI work inline, with one fresh whole-change review before completion.

**Tech Stack:** Expo SDK 58, React Native 0.88.1, Expo Router, React Query, Zustand, existing SVG/Animated/Haptics packages. No new native dependencies.

**Spec:** `docs/loyalty-member-app/04-FIGMA-DESIGN-20261111.md`; Figma file `d6IGmk3hOoMw0V5rONbI1A`, page `437:8135`, native spec `460:12607`. This refinement adds control-origin popups and a confirmed check-in motion preview (`505:13165`).

## Global Constraints

- Members app only, `com.hotelloyalty.app`; do not change Staff, Laravel or public release configuration.
- Preserve the owner's icon-only navigation edits; retain accessible labels and selected state.
- Preserve the original Staff wallpaper and SVG geometry; use local assets and dynamic venue accent/display face.
- Loyalty plus enabled event registration only; no appointment/accommodation routes, self-awarded points or check-in permissions.
- Every figure, eligibility/refusal and transaction outcome comes from the server; keep session keys, account isolation, refresh, single-flight guards and private-voucher header authorization.
- Retain all five languages. Use shared portal words; app-specific additions belong in all five member bundles.
- Point spending, event cancellation and account deletion retain confirmations. Busy mutations cannot be dismissed or submitted twice.
- Respect Reduce Motion and accessibility timeouts; no repeated celebration on first load, navigation, refresh, pagination, reversal or account change.
- Native store/device testing remains separate. This task implements and validates source, exports and isolated browser fixtures; no new store upload is required.

## Review Focus

- A new account or old cached history must never trigger another member's celebration; initialize per source and reset on session change.
- Reordered/paginated/reversed point records must not look like newly earned points; use server IDs and confirmed values.
- Keyboard, 320 px screens, iPad, long translations and reduced motion must preserve visible controls and dismissal.
- Rapid redemption, request or event taps must issue one mutation; failure preserves retry/context and never shows success.
- Points-off memberships retain enabled Events independently; disabled capabilities and Wallet stay hidden/refused, with historical event attendance still reachable.

---

### Task 1: Shared visual, popup and feedback foundation

**Files:** `src/lib/theme.ts`, `src/lib/motion.ts`, `src/lib/motion.test.ts`, `src/lib/loyaltyFeedback.ts`, `src/lib/loyaltyFeedback.test.ts`, `src/lib/useReducedMotion.ts`, `src/components/ui.tsx`, `src/components/ActionPopup.tsx`, `src/components/Feedback.tsx`, `src/components/MemberIcon.tsx`, `src/components/ScreenHeader.tsx`, `src/app/_layout.tsx`, `assets/eclipse/*` (all under `apps/loyalty-member/`).

**Interfaces:** `popupPlacement(window, insets, measuredHeight, kind, origin?)` returns a clamped rectangle; `rememberOrigin(rect)` / `takeOrigin()` supply a recent trigger rectangle. `advanceFeedback(previous, snapshot)` returns `{ ledger, feedback }` using session owner, activity watermark and independently initialized event/stamp observations. `ActionPopup` consumes `visible`, `onClose`, `title`, `busy`, `kind`, `children`; it supports local modals and embedded route panels. `notify(message, tone?)` shows short nonblocking feedback. `ScreenHeader` and `MemberIcon` reuse the Figma asset/style slots.

- [x] Write placement tests for 393/320 px, tablet, keyboard-height windows and missing/off-screen anchors; write feedback tests for initialization, account change, repeated/reordered/older IDs, new earned points, reversal, initial versus new check-in and stamp updates.
- [x] Run the two new Vitest files and observe the missing implementation failures.
- [x] Implement helpers and existing-dependency UI: 240 ms control-origin expansion, 160 ms exit, 650 ms confirmed balance transition, one-time points/check feedback, no motion with Reduce Motion. Use actual native system chrome.
- [x] Apply Figma navy/glass/Manrope + Inter defaults, preserving server venue overrides; bundle unchanged wallpaper/SVG assets. Existing primitives remain the shared entry point for forms, buttons and cards.
- [x] Run targeted tests and TypeScript. Expected: pass. Inspect native/web export asset geometry during Task 4.
- [x] Commit the foundation with a co-author trailer.

### Task 2: Home, Card, Events and balances

**Files:** `src/app/(tabs)/{_layout,index,card,events}.tsx`, `src/app/activity.tsx`, old `src/app/events.tsx` / `(tabs)/activity.tsx`, `src/components/{MemberCard,TabBar,Programme,EventList}.tsx`, `src/app/programme.tsx`.

**Interfaces:** consumes Task 1 primitives/feedback. `/events` resolves to the enabled Events tab; `/activity` opens balances without being a main tab. `EventList` serves the tab and `NextEventCard` uses the same canonical `actionOf(event)` logic. API shapes are unchanged.

- [x] Keep Card central and render the owner's icon-only floating dock. Events visibility depends on events/attended history, independently of points.
- [x] Match the compact Figma Home/Card: venue header, identity/dates, separate balance and QR targets, Benefits/Offers shortcuts, direct next-event reservation and optional details.
- [x] Add upcoming/registered/attended filters; reserve once, show server state and feedback, confirm cancellation in a popup. Never create check-in or point-award mutations.
- [x] Put points history, stamps and credit in one contextual balance panel; keep pagination/refresh and capability gates. Present programme/access in a longer sheet.
- [x] Run native unit tests/TypeScript; verify routes and safe disabled states with fixtures in Task 4. Expected: no missing route or duplicate write.
- [x] Commit these screens with a co-author trailer.

### Task 3: Rewards and account journeys

**Files:** `src/app/(tabs)/rewards.tsx`, `src/app/(tabs)/more.tsx`, `src/app/{profile,preferences,inbox,help,sign-in,join}.tsx`, `src/components/VoucherDownload.tsx` as needed, `src/lib/i18n/{en,ru,de,fr,es}.ts`.

**Interfaces:** consumes Task 1 popup/notification/header components and Task 2 destinations; uses existing benefits/rewards/offers/profile/referral APIs only. Actual preference categories are offers, points and tier; no unsupported Events/News switches are invented.

- [x] Make benefit requests direct, keep optional details compact and use one-flight guards and confirmed feedback.
- [x] Replace the old redemption modal with the contextual popup; retain cost confirmation and busy blocking, then show the returned code in the same popup.
- [x] Open private vouchers in a larger sheet; terms are optional, native sharing remains authenticated and cancellations clean temporary files.
- [x] Make More a compact menu; consolidate local/device and server message preferences, with a short language popup. Share configured referral links directly, explain unavailable referrals.
- [x] Keep Profile details focused; open password/deletion controls on demand. Preserve birthday omission and session-safe saves. Apply shared styling to Inbox, Help and joining/sign-in without changing authentication.
- [x] Add required app-specific strings in five languages. Run tests/TypeScript and the lint regression gate. Expected: pass with no new lint diagnostics.
- [x] Commit the journeys with a co-author trailer.

### Task 4: Integration, visual validation and handoff

**Files:** `apps/loyalty-member/e2e/preview-{setup,acceptance,account-smoke}.js`, new contextual/feedback fixture checks, `README.md`, design/runbook/handoff documents.

**Interfaces:** consumes all previous tasks. Fixtures remain isolated and abort non-fixture external requests.

- [x] Exercise current acceptance coverage, adapting selectors only where the approved route/UI changed; add meaningful busy/dismissal, server-award deduplication, account reset, capability and reduced-motion checks.
- [x] Export Android/iOS/web; run native TypeScript/tests, installed ESLint regression comparison and Expo dependency check. Shared portal tests run if any shared file changes. Expected: no new failures or dependency mismatch.
- [x] Visually inspect Home, popup, Events, Rewards and Preferences at the main phone size plus narrow/tablet/long-language examples. Confirm every selected local asset exists and its rendered slot is correct; no temporary Figma URLs or demo QR enters the runtime.
- [x] Get a fresh whole-change review; fix material findings and rerun relevant checks. Record actual evidence and remaining physical-device limits.
- [x] Update the native Figma spec and release handoff, commit/push this feature branch only. Do not upload a duplicate binary or merge native code into Laravel main.
