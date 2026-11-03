# Native app release continuation — 3 November 2026

This records the native app submissions and a separate public-policy source-patch deployment. The owner's
unrelated work was untouched. Detailed append-only records are in each app's `02-RELEASE.md`.

## Current delivery

- **HexaTech Staff iOS 1.0.0 (2): WAITING_FOR_REVIEW.** Apple submission
  `1e91c8e9-d6c2-402a-9f15-b35bf8e1074d`, app `6829777674`. Owner authorized publishing, completed privacy
  publication and confirmed content rights. Five language descriptions, ten screenshots, free price, Business
  category, 4+ age rating, contact and verified demo sign-in are saved. Manual release remains enabled: after
  approval request Apple's unlisted distribution, then release. It is not yet publicly available.
  A later source audit added Other User Content, Search History and Other Usage Data to the initial five privacy
  types. All eight are now published, linked to users for App Functionality, no tracking, with no setup warnings.
- **Staff Android 1.0.0 (3): PUBLISHED**, app `4973001253686610054`, package
  `uk.hexatech.loyalty.staff`. Google approved the 15-change submission. Publishing overview says **Last published
  on 3 November 2026**; the public listing shows **HexaTech Staff**, FDS Cards ltd and **Install**.
  Owner explicitly selected **all supported countries**: 177 named countries/regions plus Rest of world (178).
  Managed publishing is off. A later reviewer-password update is separately **in review**; the binary is already live.
  All 11 setup tasks, eight-type Data safety, IARC ratings, 18+ target audience, verified reviewer access, Business
  category/contact and five-language listing/images are saved. Advertising ID is No, verified against source and
  the actual build 3 AAB manifest (no AD_ID permission). Internal testing remains available.
- **HexaTech Loyalty 2.0.0 iOS (20) and Android (26): submitted for production review.** Both EAS submissions are FINISHED:
  iOS `168bb90a-d569-42ca-b23a-14da322be01f`, Android `ae6e8a43-1735-4691-a2ec-664e106265c9`.
  iOS 20 is VALID, selected in the editable 2.0.0 draft and in Internal QA, IN_BETA_TESTING. Apple privacy is published,
  reviewer credentials verified. Owner confirmed the tester account and reported **all good** after the iPhone
  TestFlight check. Apple submission `64206424-8806-46cf-9240-6bae2aa0c0e5` was accepted at **15:33 UTC** on
  3 November and is **WAITING_FOR_REVIEW**. Release type is **AFTER_APPROVAL**, verified by API readback, under the
  owner's publishing authorization. No further manual release is required for the member app after approval.
  Android 26 was installed through Play and passed native member acceptance. Sent all 15 member changes for
  production review; Google's quick checks passed and it explicitly says **Your changes are now in review**.
  Managed publishing is off, so approval can publish the full rollout automatically.

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
The owner explicitly authorized replacing both isolated demo passwords and entering the replacements in both
stores and the emulator after the clipboard incident below. That overrides the earlier owner-only rule for these
two demo sign-ins. Other sign-ins/2FA and legal declarations remain the owner's. Do not repeat completed confirmations.

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

## Later audit and public policy deployment

- Member Play listing now matches all five source locales exactly, with the current icon, feature graphic and
  six actual app captures. The old Data safety answer incorrectly said no data collected; the audited eleven
  types are saved and all handling rows validate. The privacy URL now points to `app.hexa-tech.uk/privacy`.
- Production release **26 (2.0.0)** has five localized release notes and validated **Ready to release**. After
  native Android acceptance and reviewer credential readback, all 15 changes were sent for review. Google's
  Publishing overview shows **Changes in review**; quick checks completed and Google explicitly confirms the review.
- Apple member privacy now has all eleven categories fully configured with no Set Up warnings. All are linked,
  for functionality, with no tracking; Product Interaction additionally declares Analytics. The final Publish
  confirmation was completed by the owner; publication was then verified in Apple's UI.
- Both apps' Apple and Play reviewer passwords now match independent replacement demo passwords by private readback.
  Old passwords are rejected and other demo sessions were revoked. Never print passwords or inspect the owner file in UI output.
- Android testing URL: `https://play.google.com/apps/internaltest/4701572602064076698`. Chrome first-use is complete,
  enrolled account and selected tester list verified. Play initially delivered public 1.1.0 (20); after enrollment
  propagated it offered Internal Beta 2.0.0. Installed **26** through Play, installer `com.android.vending` verified.
  No protection was bypassed. Home, Card, Rewards, Activity and More pass, including Inbox, Profile and Help.
  Native demo redemption reduced points 310 to 210; My codes and Activity reflect it. Inbox mark-read and benefit
  cancellation/re-request pass. The staff API confirms one pending demo request. All 25 authenticated reads pass again.
- iPhone uses the existing TestFlight invitation, **2.0.0 (20)**; no public TestFlight join URL exists. Forty-one
  regression tests and 25 authenticated API reads passed again; this does not establish native iOS acceptance.
  Later access audit: build 20 is VALID, unexpired, IN_BETA_TESTING, minimum iOS 16.4, and in Internal QA's builds.
  App Store Connect now explicitly shows **Installed 2.0.0 (20), Nov 3, 2026** for the owner's existing tester.
  The open browser had been on Staff's build 2; switched it to Loyalty. No invitation/access change was necessary.
  Installation telemetry alone was not treated as acceptance. Owner then confirmed the same account and reported
  **all good** after the TestFlight/iPhone check; member iOS was submitted and automatic release enabled as above.
- **Apple credential incident resolved:** the private helper now allowlists scalar output. Owner authorized browser
  replacement with the same role; both Expo assignments and new Apple access were verified before the exposed key
  was revoked. Apple's UI confirms revocation. Do not reuse the old key or print any credential.
- **Emulator clipboard incident resolved by rotation:** CUA typeText pasted an unexpected Android clipboard value
  into search, potentially the shared demo password. Owner was informed and explicitly authorized replacing and
  configuring both demo sign-ins. Replacements are verified in both stores and the member emulator. Use direct
  emulator key events only; the on-screen email keyboard's @ key avoids host-layout symbol mismatches. Do not reopen
  the old search or the owner-only Notepad window. Private follow-up remains outside git.
- Public privacy/deletion technical and branding changes deployed separately via source patch **d9117b475**,
  source **2f0158565**, from `feature/native-app-policy-20261103`. Both public pages verify by content: current
  app names, billing-address collection by Stripe, payment-component analytics, Expo/APNs/FCM, the member
  More → Profile deletion route and partial-data requests. Existing retention/legal-basis commitments remain.
- The artifact also fixes Windows ambiguity between AccountProducts/AccountTeam TS helpers and TSX pages using
  explicit `.tsx` imports. TypeScript, all **5,827 frontend tests**, scoped Support/Landing/API-authentication
  PHP checks and production build pass. Live SPA still serves the account-page chunks. No native source or
  migration rode this deploy. Isolated PHP 8.5.12 NTS CLI was installed; WAMP/PATH were not changed.
- Source/deploy worktrees: `C:\wamp64\www\hexatech-policy-source-20261103` and
  `C:\wamp64\www\hexatech-policy-deploy-20261103`; both are separate from the native branches.
