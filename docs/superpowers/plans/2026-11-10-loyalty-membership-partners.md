# Memberships and partner scanning implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Give administrators a coherent manual-membership and restricted partner scanning workflow, with temporary
membership dates, reusable physical cards and an accurate customer configuration guide.

**Architecture:** Reuse MembershipValidity, MemberDetails/Enrolment, TeamController and PlaceScan. Add scan-only
staff restrictions as an explicit server-side allowlist and a small partner scanner; preserve normal staff and
installed member/staff API callers. Existing levels are the packages, with their real configured benefits.

**Tech stack:** Laravel 13/PHP 8.5, PostgreSQL/SQLite, React/TypeScript, existing five-locale loyalty UI and scanners.

**Spec:** `docs/superpowers/specs/2026-11-10-loyalty-membership-partners-design.md`.

## Global constraints

- Feature branch; exact source-patch deployment from the last code baseline `b1f5082d2`; no feature build commits.
- Only canonical membership/tier/visit/card writers; new API keys in AccessMap; own-organisation IDs only.
- Plain inclusive venue days; null start keeps current behaviour; no altered public non-member booking contract.
- Five locales, existing UI/palette, no new dependencies; local provider calls blocked and mail captured.
- No live invitations, campaigns, payment claims or member changes during verification.

## Review focus

Replayed requests must not overwrite a newer assignment or reveal a different operator's member. Reversed intervals
must save nothing. Scan-only staff must remain restricted in report mode and through full-admin aliases. A future
membership must not receive active paid benefits early. Reusing a card must never transfer the person's wallet QR.

### Task 1: Membership interval

Files: new migration and `tests/Feature/LoyaltyWorkspace/MembershipPeriodTest.php`; modify MembershipValidity,
ValidityController, AccessDecision/Verdict, event eligibility, MemberDirectory, DTOs and admin/member date views.

Interface: additive `valid_from: ?Y-m-d`, state `scheduled`; `MembershipValidity::startOf($member)` and
`validOn($member, $venueDay)`; validity PATCH-like updates preserve unspecified boundary.

- [x] Add failing tests for start/end inclusivity, partial/null edits, reversed intervals and retry-key mismatch.
- [x] Run the new PHP test with PHP 8.5; confirm failures show the missing start-date behaviour.
- [x] Add column and canonical date logic, then integrate access/event day and benefit eligibility consumers.
- [x] Extend admin/member views and five locales. Test date formatting in venue days and old DTO compatibility.
- [x] Run existing validity, access, event, merge and portal suites plus new interval tests; commit source.

### Task 2: Manual package assignment (owner clarification)

Files: new shared `Members/MembershipAssignment.php`, workspace controller/action and assignment form; modify
MemberEnrolment, MemberDetails, MemberProfile and add-member form, plus focused assignment tests.

Interface: manager-only assignment of an active level, dates and assigned/earned mode. No payment data or integration.
The service locks the member and saves all intended fields in one transaction; assigned mode holds the exact level.

- [x] Write failing tests for manager rights, own-tier validation, level persistence after bonus/assessment,
      atomic interval refusal, replay and explicit return to earned progression.
- [x] Implement the shared service and additive metadata/route contract; preserve existing member creation callers.
- [x] Add compact reviewed assignment UI to new/existing members, using server levels and benefit data.
- [x] Verify API and compiled real-backend assignment journey; record no processor payment as verified; commit.

### Task 3: Partner account boundary and invitations

Files: Staff migration/model, AdminAccess guard, shared partner-access service, TeamController and a Loyalty partner
controller/page; auth/bootstrap/landing DTO additions and explicit route rules; partner permission/API tests.

Interface: staff `loyalty_scan_only: bool`, `loyalty_place_ids: list<int>`; explicit partner bootstrap/scan routes.
Partner invitation calls the canonical team writer, never duplicates user/invite/password implementation.

- [x] Write failing tests for restricted scan, foreign/empty/revoked places, full-admin alias and other API refusals
      in both enforcement modes; metadata minimisation and operator-scoped replay.
- [x] Implement default-deny restriction, place validation, safe bootstrap and activation/landing behaviour.
- [x] Add manager Partner screen and Team preservation, existing invitation flow and web app link.
- [x] Add minimal partner scanner reusing CameraScanner/useWebNfc and PlaceScan; no member directory/edit controls.
- [x] Verify invitation through local mail capture, activation, scan/check-in and direct API refusal; commit.

### Task 4: Physical cards, push guide and menu

Files: OverviewShell/overview CSS; linked-card UI and existing card tests; guide page and five locale bundles.

- [x] Add visible accessible desktop collapse/expand button using the existing persisted rail state.
- [x] Verify existing NFC off/relink behaviour and cross-tenant refusal; expose reusable physical-card QR from its UID.
- [x] Provide a guide for package levels/benefits, partner invites/places, activation, web app installation,
      push Offers campaigns/codes and card reuse. Explain personal QR and device/provider limitations accurately.
- [x] Inspect desktop/mobile and all language/theme combinations; use existing APIs where already sufficient.

### Task 5: Release

- [x] Run changed scoped PHP tests on SQLite and migrated isolated PostgreSQL, meaningful real-backend journeys,
      full TypeScript/Vitest, lint and shared consumers where touched.
- [x] Document additive contracts and reusable local API checks; check the installed Postman CLI capabilities
      without unnecessary workspace publication or credentials.
- [x] Source commit and push feature; exact allowlisted deployment worktree with physical vendor, whole-source
      parity, required scoped PHP/frontend checks and fresh artifact build.
- [x] Deploy by recipe, verify actual live content/landing/authentication, record CI state and outstanding physical
      device/provider acceptance, clean only task-owned helpers/worktree, and deliver customer guide.
