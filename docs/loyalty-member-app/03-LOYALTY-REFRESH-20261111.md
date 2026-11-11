# Members app loyalty refresh - 11 November 2026

## Scope and source

The owner requested all necessary members-app updates after the recent loyalty-platform improvements, then clarified: loyalty only, with booking/registration for events when enabled. The implementation prepares **HexaTech Loyalty 2.1.0**, existing bundle **com.hotelloyalty.app**, Apple app **6765608479**, Expo project **865bfb65-5e82-4b4d-b3b4-dc55e9b9ef17**. Staff and Laravel production were not changed.

**Latest delivery:** iOS **2.1.0 (22)** is verified in TestFlight Internal QA; Android **2.1.0 (28)** is verified on Play internal testing. Both actual signed artifacts were inspected. Current native device acceptance, store media, birthday privacy review and a members-app walkthrough remain required before public review. No 2.1 public store review/release was sent.

Platform baseline: **80b229347** (current deployed 10-11 November source). Native baseline: **origin/feature/loyalty-member-app at 662ce3686**, including the 2.0.1 desk/foreground refresh fixes. The existing isolated checkout `C:/wamp64/www/hexatech-apps` is on **feature/member-loyalty-refresh-20261111**. Do not merge this native app branch into Laravel main.

## Implemented

- Appointment/accommodation entry points and Help/category controls are removed for this product. Legacy booking deep links redirect before queries/payments mount. Historical server bookings and deferred source components are preserved.
- Membership starts/ends, scheduled/expired/inactive states, assigned benefits without points, and points/programme capability changes are respected. Points-only navigation is hidden when the programme is off.
- A programme sheet reads canonical earning, expiry and access decisions from the existing member DTO. Its TypeScript interface moved to shared portal types; the web hook's runtime behaviour is unchanged.
- Existing event sign-up/cancel flows are kept, with fresh reads, a synchronous duplicate-action guard and capability gating. Attended history stays reachable when no upcoming event remains.
- Offers show terms, usability and bonus-points claim history. Authenticated PDF/JPEG/PNG/WebP voucher downloads work from Offers and Inbox. Tokens remain in headers, redirects are refused, files are capped at the server's 5 MB limit, originating sessions are checked, native temporary copies are removed after sharing/failure, and web downloads retain original bytes.
- Reward redemption requires confirmation on both native and web; rapid repeated confirmation submits once. Membership refusals use the five-language portal messages. Inbox/Help links retain the requested reward tab.
- Wallet actions fail closed on missing/false provider flags and the wrong platform. QR sizing fits 320 px phones; card/programme refresh joins the existing member refresh set. Close/segment controls meet a 44 px minimum and long headings/status messages wrap.
- Profile supports optional birthday edits without writing an untouched/refreshed birthday. Saved drafts clear after cache synchronization. Late profile responses are scoped to the originating member; Inbox mutations and message rollback are scoped to the originating session.
- Store text/release notes/Play translations are rewritten in all five languages for the loyalty-only scope. Historical booking screenshots are excluded from automatic metadata synchronization.

## Verification

- Native TypeScript and **56 tests / 6 files** pass. The new tests cover feature/provider gating, safe filenames, localized refusals, profile refresh/account boundaries, original authenticated bytes, 401/404 handling, account switching and native cache/share cleanup.
- Shared frontend TypeScript and **720 portal tests / 47 files** pass after installing the current lockfile dependencies.
- Current backend contract checks: **15 programme/membership tests / 63 assertions** and **23 personal-offer/security/claim-limit tests / 136 assertions** pass against an explicitly in-memory SQLite database, with local mail and synchronous queues. No customer database or outbound service was used.
- Browser preview acceptance: **146 checks** passed across five languages, 320/393 px widths, Home/Card/programme/Rewards/Events/Help, event registration/cancellation/history, excluded deep links/no booking API calls, disabled points/Wallets, inbox offer navigation, actual one-POST double-click redemption, protected original voucher bytes and birthday-refresh/save regression. No runtime errors. This uses isolated HTTP fixtures, not physical devices or live production integration. The first harness attempt dispatched visibility on the wrong target; it was corrected to `window` and the complete suite rerun.
- A further **seven browser checks** pass for birthday save, later staff refresh, delayed cross-account profile responses, omission of untouched birthday, Inbox read state and Offers navigation. Combined fixture acceptance: **153 checks**; evidence `C:/wamp64/tmp/member-account-smoke-20261111.json`.
- Downloaded test PDF is **44 bytes**, exact original bytes, SHA-256 **E27A0B5FC4A9974D72AD85AACBA91ED571786461F40FDFE4AEBD9C34DA761C5A**.
- Expo dependency check is clean after SDK 58 patch alignment. Prebuild configuration preserves bundle/package and blocked microphone/storage permissions; no incoming iOS share extension is enabled. Android/iOS Hermes and web exports pass; these exports are not signed store binaries or device acceptance.
- Installed ESLint comparison against native baseline: **27 errors / 16 warnings before**, **26 errors / 16 warnings after**, **zero added diagnostics**. Existing findings concern React-hook/compiler analysis and an Expo namespace resolver; full lint is not clean. `npm run lint` directly invokes installed ESLint because this workstation's Expo lint wrapper misdetects the installed supported ESLint version.
- The final script audit removed a duplicate `lint` key that had overridden the direct command. TypeScript/56 native tests and the zero-regression lint comparison were checked again after this tooling correction; native runtime files are unchanged from the signed-build source.
- `npm audit --omit=dev` retains five moderate Expo CLI/fingerprint/glob/minimatch findings; npm's suggested forced Expo 52 downgrade is incompatible with SDK 58 and was not applied. No forced major dependency change.

Private/local evidence: `C:/wamp64/tmp/member-browser-acceptance-20261111.json`, `member-lint-regression-20261111.json`, `member-portal-tests-20261111.log`, `member-offer-api-tests-20261111.log`, and native/web export logs. The inspected Home preview is `C:/wamp64/www/Hexa-Tech/.playwright-mcp/member-loyalty-home-20261111.png`. It uses isolated demo data and is **not a store screenshot**. Repeatable fixture/acceptance functions live in `apps/loyalty-member/e2e/`.

## Release checkpoint

2.1.0 source, metadata and validation are prepared. A new signed binary is required for the added FileSystem/Sharing modules; no OTA update is used. Store rollout is a separate checkpoint: inspect existing builds before scheduling to avoid duplicates; use current native screenshots, physical-device acceptance and a members-app walkthrough before review. The Staff recording must not be reused as members-app evidence. Do not report source/Hermes export success as TestFlight availability or public release.

Birthday is optional linked personal data sent by Profile. Before store submission, include it in Apple's Other Data Types (App Functionality; review any actual promotion/personalization uses) and Google's Personal info / Other info, with optional collection. Keep declarations covering still-distributed older versions; do not remove booking/payment disclosures blindly. See [Apple's data definitions](https://developer.apple.com/app-store/app-privacy-details/) and [Google's definitions](https://support.google.com/googleplay/android-developer/answer/10787469). No live privacy form was changed in this source task.

## Signed testing builds

Source **89ce29029b5991894ee2fa764de4d17ef16d4336** is pushed. Verified EAS archive: 19 native routes, **309 runtime/shared files with exact hash parity**, no private environment/key files; upload 7.9 MB. An initial archive inspection caught an over-broad root exclusion before upload; root exclusions were anchored and the corrected archive was verified. No failed/duplicate build was scheduled for that inspection.

- Android **2.1.0 (28)**: `8718e5cc-453e-41e7-992f-53023fe07e57`.
- iOS **2.1.0 (22)**: `9c68c074-5c34-42d0-bfcb-0e16773eafa8`.

Both builds finished and the exact artifacts were inspected before testing uploads, as recorded below. Raw EAS JSON/logs are in the private release directory and may contain signed URLs; never print them wholesale. Runtime/shared source files are unchanged from the compiled source commit; later commits add evidence, testing instructions and the lint-script correction.

## iOS testing delivery verified

iOS EAS build **9c68c074-5c34-42d0-bfcb-0e16773eafa8** finished and its actual IPA was inspected: `com.hotelloyalty.app`, **2.1.0 (22)**, production distribution signature/APNs, no debug entitlement, camera/Face ID descriptions only, FileSystem/Sharing present, no incoming share extension, iPhone/iPad support and minimum iOS 16.4. The compiled app icon was extracted/decoded and visually checked.

Artifact: `C:/Users/user6399/Downloads/HexaTech-Loyalty-2.1.0-22.ipa`, 42,452,896 bytes; SHA-256 **4d2ea4ec3339bb760072d9e0217f809e500fe3e9d4fdf2db172be349968c26e3**. Detailed safe checks: private `member-ios-210-artifact-check.json`.

EAS submission **803fbaa3-a8d1-4b43-be22-e11769e6e76f** is FINISHED. App Store Connect build **d6d8f57c-894b-42a6-8abf-429225b77536** is **VALID / IN_BETA_TESTING**, present in the existing **Internal QA** group (two existing testers, all-builds access). English testing notes from `store/testflight-2.1.0.txt` were saved and read back with exact parity. No new testers or external beta submission were created. **This is TestFlight availability, not App Store review or public release.**

Testing rollout safeguards: no automatic public release, no server minimum-version change, no customer demo-data mutations. Stop further rollout if sign-in/card, account isolation, event registration or private voucher handling fails on a device; correct the issue and produce a higher-numbered testing build before continuing. Current native screenshots/privacy/walkthrough and supported-device acceptance remain public-review gates.

## Android testing delivery verified

Android EAS build **8718e5cc-453e-41e7-992f-53023fe07e57** finished. The AAB confirms package **com.hotelloyalty.app**, label **HexaTech Loyalty**, **2.1.0 / 28**, minimum SDK 24 / target SDK 36, release signing and no debug flag. `jarsigner -verify` succeeds. Camera/biometric/notification permissions are present; blocked microphone, overlay and external-storage permissions are absent. No new permission names appear compared with the Play-distributed version 26 APK (its Play licensing permission is not in the upload AAB). Firebase project/resources match, stable FileSystem/Sharing registration names and methods are in DEX, and the extracted icon was visually checked. The first module-inspection heuristic used Kotlin class names renamed by release minification; it was corrected using the installed SDK's stable module names/methods, without changing or rebuilding the app.

Artifact: `C:/Users/user6399/Downloads/HexaTech-Loyalty-2.1.0-28.aab`, 102,695,977 bytes; SHA-256 **bc4a3cd72d3e9740cf033c500286fb831a52e4ca4cf231139e7228dccfb92f74**. Detailed safe checks: private `member-210-android-artifact-check.json`.

EAS submission **75615949-c9c2-4a88-a8d4-dc16935fe6c0** is **FINISHED**. Google API readback confirms internal release **2.1.0**, **completed**, code **28**, and the uploaded bundle's SHA-256 exactly matches the inspected local artifact. The prepared release notes are saved/read back in **en-GB, ru-RU, de-DE, fr-FR, es-ES**. The API rejected `changesNotSentForReview` for its automatic internal commit; only the internal notes were changed, the production track was checked unchanged, and `ERROR_IF_IN_REVIEW` protected any concurrent review. Failed and verification edits were deleted. No permissions were expanded, no second binary was uploaded, and no production-track update was made.

Existing Android test entry: https://play.google.com/apps/internaltest/4701572602064076698 (requires an allowed tester account). Install through Play; do not bypass Play automatic protection with a sideload. Play production-track readback remains code **26 / 2.0.0**; this is a track readback, not a new verification of its public listing availability. Apple still has an existing **2.0.0 / REJECTED** version record; **2.1 is TestFlight only** and no new App Review version was submitted. Retrieve/reconcile the actual members-app rejection message before future public resubmission; do not treat Staff approval as members-app approval.

The read-only App Store Connect browser check redirected to Apple sign-in; the detailed review message could not be read in this session. The API establishes the rejected state, not its cause. Fresh owner authentication is needed to inspect that message before public resubmission. No authentication or publication confirmation was requested for this completed testing delivery, and no credentials/browser stores were inspected.

Final safe evidence: private `member-210-testflight-status.json`, `member-210-testflight-notes-check.json`, `member-210-play-status.json`, `member-210-play-notes-check.json`; repeatable fixture scripts and all source/docs are pushed on **feature/member-loyalty-refresh-20261111**. The owned local preview tab/server were closed. Staff artifacts and the owner's original checkout were not changed.
