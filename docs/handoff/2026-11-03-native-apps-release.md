# Native app release continuation — 3 November 2026

This is an app-store handoff, not a Laravel Cloud deployment. Main and the owner's unrelated work were untouched.
The detailed append-only records are in each app's `02-RELEASE.md`.

## Current delivery

- **HexaTech Staff iOS 1.0.0 (2): WAITING_FOR_REVIEW.** Apple submission
  `1e91c8e9-d6c2-402a-9f15-b35bf8e1074d`, app `6829777674`. Owner authorized publishing, completed privacy
  publication and confirmed content rights. Five language descriptions, ten screenshots, free price, Business
  category, 4+ age rating, contact and verified demo sign-in are saved. Manual release remains enabled: after
  approval request Apple's unlisted distribution, then release. It is not yet publicly available.
  A later source audit added Other User Content, Search History and Other Usage Data to the initial five privacy
  types. All eight are now published, linked to users for App Functionality, no tracking, with no setup warnings.
- **Staff Android 1.0.0 (3): production submission accepted**, app `4973001253686610054`, package
  `uk.hexatech.loyalty.staff`. Google shows **Changes in review** after sending 15 changes on 3 November at about
  10:44 UTC. Quick automated checks are still running at this checkpoint; changes advance when checks succeed.
  Owner explicitly selected **all supported countries**: 177 named countries/regions plus Rest of world (178).
  Managed publishing is off, so approval can publish the full rollout automatically. It is not yet confirmed live.
  All 11 setup tasks, eight-type Data safety, IARC ratings, 18+ target audience, verified reviewer access, Business
  category/contact and five-language listing/images are saved. Advertising ID is No, verified against source and
  the actual build 3 AAB manifest (no AD_ID permission). Internal testing remains available.
- **HexaTech Loyalty 2.0.0 iOS (20) / Android (26): delivered to testing.** Both EAS submissions are FINISHED:
  iOS `168bb90a-d569-42ca-b23a-14da322be01f`, Android `ae6e8a43-1735-4691-a2ec-664e106265c9`.
  iOS 20 is VALID, selected in the editable 2.0.0 draft and in Internal QA, IN_BETA_TESTING. Android 26 is in Play
  internal testing; its Play-signed APK was installed over 25 on the Pixel 8 emulator. Member public review has
  not been submitted. A physical iPhone retest remains necessary.

## Loyalty sign-in correction

The reported post-sign-in error came from an old staff session preserved by the member app's secure-store keys.
Production logs showed `pointsTransactions()` on null in the legacy history endpoint; the corresponding account
was staff without a loyalty membership. The member portal correctly refused that session with `403 member_only`.

Fix commit `505d8d659` clears an incompatible local session and query cache, explains which sign-in is required,
and returns to sign-in. Valid members remain signed in. Token matching prevents a late failure from clearing a
newer session. No real account, server token or production source was changed. Seven session regression tests were
added: all 41 tests in three files, TypeScript, changed-file ESLint and Expo dependency checks passed. The existing
full-app lint baseline is not clean and was not changed.

Builds: Android `9cfb4b4c-1866-4f46-8368-3bd8375860a0`; iOS `002b73b1-8b73-4a1d-bb2e-3ea0d2d1f159`.

## Isolated review data and secrets

Owner authorized demo-account creation and live testing. Organisation 49, **HexaTech App Review Demo**, contains
member 549 / user 594 and staff manager 59 / user 595, scoped to this organisation. Demo member number
`HL-2026-000493`. Verified both sign-ins, 25 authenticated reads, idempotent points award, reward fulfilment,
check-in and benefit request approval/completion. Pending reward redemption and benefit request remain for review.
Booking inventory is absent, and the server correctly hides booking entry points.

Credentials and API tokens remain outside git under the workstation user's private release directory. A separate
owner-only `review-sign-ins-owner.txt` contains just the two demo sign-ins, no API tokens. Never print its content.
The original release instruction reserves password entry and legal declarations for the owner. Do not repeat
previously completed owner confirmations.

Firebase project `hotel-loyalty-app-1414d` is configured for both current packages. EAS production secret files and
FCM V1 keys are assigned. Play submission uses a separate service account, scoped to these apps with testing
permissions, no production/account-wide access. Physical push delivery, NFC, camera and biometrics have not been
fully verified by this agent; do not report all device checks complete.

## Worktrees and continuity

- `C:\wamp64\www\hexatech-apps`: `feature/loyalty-store-release-20261102`, pushed to
  `feature/loyalty-member-app`; contains both apps.
- `C:\wamp64\www\hexatech-staff-release-20261102`: independent staff history, branch
  `feature/loyalty-staff-release-20261102`, pushed to `feature/loyalty-staff-app`. Copy changed staff files and guide,
  then commit once; never merge the histories or push app changes to main.
- Source and release assets are committed. The current continuation adds Play translation-import JSON and records
  the final store forms, production submission and Apple privacy correction; consult the latest app-branch commits.
- The native Chrome window is used for store forms through CUA. Refresh the UI before acting; old accessibility
  indices may lag. Do not output reviewer password fields. Private CLI helpers inspect Apple/EAS/Play without
  printing secrets. The Apple inspection helper must run in the main release worktree's app directory, which has
  dependencies; the staff sync worktree does not have `node_modules`.
