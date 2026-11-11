# Members app refresh - 11 November 2026

**Latest state — native luxury design implemented:** Figma contextual popups/points motion and the approved members screens are now native source on the same feature branch. Home/Card/Rewards/Events/More, balances/history, vouchers, Profile and consolidated Preferences are wired to the existing server contracts. Icon-only navigation preserves accessible names; confirmed points/check-in/stamp feedback never writes awards. See [the implementation audit](../loyalty-member-app/05-NATIVE-DESIGN-20261111.md). TypeScript/71 tests, 266 isolated browser checks and Android/iOS/web exports pass; Expo SDK 58 maintenance dependencies are aligned. ESLint adds zero diagnostics (16 legacy errors/16 warnings). New device/store QA remains required. Existing signed **iOS 22 / Android 28 predate this design**; no new signed build, OTA update, store release or Laravel deployment was performed. Earlier sections below retain the prior testing/design history.

Current implementation: **HexaTech Loyalty 2.1.0**, members only, `com.hotelloyalty.app`. Source is `C:/wamp64/www/hexatech-apps`, feature branch **feature/member-loyalty-refresh-20261111**, based on platform **80b229347** plus native **662ce3686**. Staff and the owner's original checkout/untracked files are untouched. Never merge native branches into Laravel main.

Owner clarified loyalty-only scope with enabled event booking/registration; appointment/accommodation routes redirect. Membership dates/assigned benefits, programme/access facts, private offer vouchers, safe reward confirmation, event history, Wallet gating, profile/birthday/session safeguards and five-language metadata are implemented. Existing account keys, native identity and 2.0.1 refresh fixes are preserved.

TypeScript/56 native tests, shared frontend TypeScript/720 portal tests, 38 in-memory backend contract tests, **153 fixture-browser checks** (146 acceptance + seven account/Inbox smoke checks) and Android/iOS/web exports pass. ESLint regression gate adds zero diagnostics (26 legacy errors/16 warnings remain). The duplicate lint script was removed and the installed command verified. No physical-device/provider acceptance is claimed. Full audit and exact evidence: `docs/loyalty-member-app/03-LOYALTY-REFRESH-20261111.md`.

**2.1.0 testing delivery is complete:** iOS **(22)** is in TestFlight Internal QA, Android **(28)** is on Play internal testing; both actual artifacts and testing notes are verified. No 2.1 public review/release was sent. Current native screenshots, privacy review for optional birthday collection and a members-app physical walkthrough are release requirements. Historical booking screenshots are excluded from automatic metadata sync; Staff's video is not members-app evidence. No Laravel deployment or production customer messages/data writes.

## Signed testing builds

Source **89ce29029b5991894ee2fa764de4d17ef16d4336** is pushed. Verified EAS archive: 19 native routes, **309 runtime/shared files with exact hash parity**, no private environment/key files; upload 7.9 MB. An initial archive inspection caught an over-broad root exclusion before upload; root exclusions were anchored and the corrected archive was verified. No failed/duplicate build was scheduled for that inspection.

- Android **2.1.0 (28)**: `8718e5cc-453e-41e7-992f-53023fe07e57`.
- iOS **2.1.0 (22)**: `9c68c074-5c34-42d0-bfcb-0e16773eafa8`.

Both are FINISHED. Artifact identities, signing, permissions, native modules and icons were inspected before the testing uploads below. Runtime/shared source remains identical to the compiled commit. Raw EAS JSON/logs are in the private release directory and may contain signed URLs; never print them wholesale.

## iOS testing update

iOS **2.1.0 (22)** is built, its actual IPA inspected, and EAS upload **803fbaa3-a8d1-4b43-be22-e11769e6e76f** finished. ASC build **d6d8f57c-894b-42a6-8abf-429225b77536** is **VALID / IN_BETA_TESTING** in the existing **Internal QA** group with two testers. English testing notes were saved and verified. The correct packaged icon, identity, production signing/APNs, FileSystem/Sharing, iPhone/iPad support and no microphone/tracking/debug permission were checked. Minimum iOS 16.4. Artifact/hash/evidence are in the detailed audit. No public App Review or external beta submission was sent.

## Android testing update and next release checkpoint

Android **2.1.0 (28)** is built, its actual AAB inspected, and EAS upload **75615949-c9c2-4a88-a8d4-dc16935fe6c0** is FINISHED. Google readback confirms **internal / completed / 28**, exact uploaded/local artifact SHA-256 parity and five-language release notes. Production track was unchanged (still code 26 / 2.0.0 in API readback). No permissions were expanded. Use the existing test entry https://play.google.com/apps/internaltest/4701572602064076698 with an allowed tester account; install through Play, not a protection-bypassing sideload.

Apple's existing **2.0.0** store-version record is still **REJECTED**; this work delivers **2.1 to TestFlight only**. Before public resubmission, reconcile that members-app review message, test all supported device families, capture current native screens/video and check birthday privacy declarations. The detailed audit has artifact paths/hashes and exact evidence. No new build is needed for later docs/e2e/lint-script commits. Owned browser preview/server stopped; only pre-existing untracked Staff dependency artifacts remain in the worktree.

The read-only Apple browser check returned to sign-in. API access still verifies build/group/state, but the actual rejection reason requires fresh owner browser authentication. Do not assign Staff's rejection reason or approval to this app. No 2.1 public review was attempted.

## Figma-first luxury design

The owner then requested a new members-app concept in their existing Figma file, guided by the Staff scanner reference. The first pass on new page **437:8135 — 01G · Members app — Luxury** delivered **54 editable layouts**, four feedback overlays, reusable components, working toggle variants and **376 persisted linked actions**, with four prototype starting points. Existing Figma product/web pages were preserved. The refinement below supersedes that first pass's intermediate-screen sequence.

[Review the everyday screens](https://www.figma.com/design/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=440-8279) · [Open the prototype](https://www.figma.com/proto/d6IGmk3hOoMw0V5rONbI1A/Untitled?node-id=440-8280&starting-point-node-id=440%3A8280). The native Figma handoff spec is **460:12607**. Scope, provenance and checks: `docs/loyalty-member-app/04-FIGMA-DESIGN-20261111.md`.

Original Staff wallpaper/SVG icons and the current member app mark were reused. Main phone plus 320 px/Android/iPad examples cover loyalty and enabled event registration, account controls and availability/membership states. Final inspected preview is `C:/Users/user6399/Downloads/HexaTech-Loyalty-Figma-Concept-20261111.png`; it is a concept, not native store media. No clipping, unresolved destinations, custom-font mismatch or placeholder labels in the audit. The QR is explicitly demo-only and rendered using editable geometry.

This design task made no native runtime/build/store or Laravel changes. Review the Figma concept before implementing it; existing server/capability/session/refresh safeguards and five languages must be preserved.

## Fewer-step design refinement

The owner asked to simplify the existing Figma design, shorten copy and add animation. Updated the same page/IDs: direct free-event reservation from Home (**3 → 1 taps**), direct benefit request (**3 → 2** from Home), direct voucher opening, direct invitation sharing and automatic save feedback. The Card remains central; Events replaces Activity in bottom navigation, and balances open in a tabbed sheet. Preferences now combines language, messages and device lock. Three superseded full pages are hidden references with no incoming links.

There are **18 compact bottom-sheet examples**, seven brief feedback examples and two native share references. Point spending, event cancellation and account deletion still require explicit confirmation. Prototype motion uses 240 ms bottom entry, 150 ms local fades/switches, existing 180 ms navigation fades and 1.6-second feedback dismissal. No QR/wallpaper looping motion. Native Reduce Motion, nonblocking accessible feedback, keyboard handling and swipe dismissal are implementation requirements; the prototype uses Close/outside tap.

Final structural verification: **62 roots / 59 visible**, **301 node-linked actions**, **39 bottom-entry transitions**, zero missing destinations, hidden-reference incoming links, product-font/encoding/placeholder errors or unintended text clipping. Empty and populated request/registration states and the final core/sheet/account compositions were inspected. A multiline programme-text height defect was fixed. The native Figma spec **460:12607** was updated and read back; prototype defaults are reset to available/unrequested.

Current flow details and preview paths are in `docs/loyalty-member-app/04-FIGMA-DESIGN-20261111.md`. The simplified preview is `C:/Users/user6399/Downloads/HexaTech-Loyalty-Figma-Simplified-20261111.png`. This pass changes Figma/documentation only; no native tests, builds, public release or Laravel deployment was performed.
