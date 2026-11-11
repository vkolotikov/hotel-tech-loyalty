# Members app loyalty refresh - 11 November 2026

## Scope and source

The owner requested all necessary members-app updates after the recent loyalty-platform improvements, then clarified: loyalty only, with booking/registration for events when enabled. The implementation prepares **HexaTech Loyalty 2.1.0**, existing bundle **com.hotelloyalty.app**, Apple app **6765608479**, Expo project **865bfb65-5e82-4b4d-b3b4-dc55e9b9ef17**. Staff and Laravel production were not changed.

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
- Downloaded test PDF is **44 bytes**, exact original bytes, SHA-256 **E27A0B5FC4A9974D72AD85AACBA91ED571786461F40FDFE4AEBD9C34DA761C5A**.
- Expo dependency check is clean after SDK 58 patch alignment. Prebuild configuration preserves bundle/package and blocked microphone/storage permissions; no incoming iOS share extension is enabled. Android/iOS Hermes and web exports pass; these exports are not signed store binaries or device acceptance.
- Installed ESLint comparison against native baseline: **27 errors / 16 warnings before**, **26 errors / 16 warnings after**, **zero added diagnostics**. Existing findings concern React-hook/compiler analysis and an Expo namespace resolver; full lint is not clean. `npm run lint` directly invokes installed ESLint because this workstation's Expo lint wrapper misdetects the installed supported ESLint version.
- `npm audit --omit=dev` retains five moderate Expo CLI/fingerprint/glob/minimatch findings; npm's suggested forced Expo 52 downgrade is incompatible with SDK 58 and was not applied. No forced major dependency change.

Private/local evidence: `C:/wamp64/tmp/member-browser-acceptance-20261111.json`, `member-lint-regression-20261111.json`, `member-portal-tests-20261111.log`, `member-offer-api-tests-20261111.log`, and native/web export logs. The inspected Home preview is `C:/wamp64/www/Hexa-Tech/.playwright-mcp/member-loyalty-home-20261111.png`. It uses isolated demo data and is **not a store screenshot**. Repeatable fixture/acceptance functions live in `apps/loyalty-member/e2e/`.

## Release checkpoint

2.1.0 source, metadata and validation are prepared. A new signed binary is required for the added FileSystem/Sharing modules; no OTA update is used. Store rollout is a separate checkpoint: inspect existing builds before scheduling to avoid duplicates; use current native screenshots, physical-device acceptance and a members-app walkthrough before review. The Staff recording must not be reused as members-app evidence. Do not report source/Hermes export success as TestFlight availability or public release.

Birthday is optional linked personal data sent by Profile. Before store submission, include it in Apple's Other Data Types (App Functionality; review any actual promotion/personalization uses) and Google's Personal info / Other info, with optional collection. Keep declarations covering still-distributed older versions; do not remove booking/payment disclosures blindly. See [Apple's data definitions](https://developer.apple.com/app-store/app-privacy-details/) and [Google's definitions](https://support.google.com/googleplay/android-developer/answer/10787469). No live privacy form was changed in this source task.

## Signed testing builds scheduled

Source **89ce29029b5991894ee2fa764de4d17ef16d4336** is pushed. Verified EAS archive: 19 native routes, **309 runtime/shared files with exact hash parity**, no private environment/key files; upload 7.9 MB. An initial archive inspection caught an over-broad root exclusion before upload; root exclusions were anchored and the corrected archive was verified. No failed/duplicate build was scheduled for that inspection.

- Android **2.1.0 (28)**: `8718e5cc-453e-41e7-992f-53023fe07e57`.
- iOS **2.1.0 (22)**: `9c68c074-5c34-42d0-bfcb-0e16773eafa8`.

Both were NEW immediately after scheduling. Verify exact build IDs and artifact contents before test-store upload. These are testing preparations, not public review or release. Raw EAS JSON/logs are in the private release directory and may contain signed URLs; never print them wholesale.
