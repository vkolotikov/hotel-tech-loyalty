# Members app refresh - 11 November 2026

Current implementation: **HexaTech Loyalty 2.1.0**, members only, `com.hotelloyalty.app`. Source is `C:/wamp64/www/hexatech-apps`, feature branch **feature/member-loyalty-refresh-20261111**, based on platform **80b229347** plus native **662ce3686**. Staff and the owner's original checkout/untracked files are untouched. Never merge native branches into Laravel main.

Owner clarified loyalty-only scope with enabled event booking/registration; appointment/accommodation routes redirect. Membership dates/assigned benefits, programme/access facts, private offer vouchers, safe reward confirmation, event history, Wallet gating, profile/birthday/session safeguards and five-language metadata are implemented. Existing account keys, native identity and 2.0.1 refresh fixes are preserved.

TypeScript/56 native tests, shared frontend TypeScript/720 portal tests, 38 in-memory backend contract tests, **153 fixture-browser checks** (146 acceptance + seven account/Inbox smoke checks) and Android/iOS/web exports pass. ESLint regression gate adds zero diagnostics (26 legacy errors/16 warnings remain). The duplicate lint script was removed and the installed command verified. No physical-device/provider acceptance is claimed. Full audit and exact evidence: `docs/loyalty-member-app/03-LOYALTY-REFRESH-20261111.md`.

2.1.0 source is prepared; signed build/testing and store review/public release must be verified separately. Current native screenshots, privacy updates for optional birthday collection and a members-app physical walkthrough are release requirements. Historical booking screenshots are excluded from automatic metadata sync; Staff's video is not members-app evidence. No Laravel deployment or production customer messages/data writes.

## Signed testing builds scheduled

Source **89ce29029b5991894ee2fa764de4d17ef16d4336** is pushed. Verified EAS archive: 19 native routes, **309 runtime/shared files with exact hash parity**, no private environment/key files; upload 7.9 MB. An initial archive inspection caught an over-broad root exclusion before upload; root exclusions were anchored and the corrected archive was verified. No failed/duplicate build was scheduled for that inspection.

- Android **2.1.0 (28)**: `8718e5cc-453e-41e7-992f-53023fe07e57`.
- iOS **2.1.0 (22)**: `9c68c074-5c34-42d0-bfcb-0e16773eafa8`.

Both were NEW immediately after scheduling. Verify exact build IDs and artifact contents before test-store upload. These are testing preparations, not public review or release. Raw EAS JSON/logs are in the private release directory and may contain signed URLs; never print them wholesale.

## iOS testing update

iOS **2.1.0 (22)** is built, its actual IPA inspected, and EAS upload **803fbaa3-a8d1-4b43-be22-e11769e6e76f** finished. ASC build **d6d8f57c-894b-42a6-8abf-429225b77536** is **VALID / IN_BETA_TESTING** in the existing **Internal QA** group with two testers. English testing notes were saved and verified. The correct packaged icon, identity, production signing/APNs, FileSystem/Sharing, iPhone/iPad support and no microphone/tracking/debug permission were checked. Minimum iOS 16.4. Artifact/hash/evidence are in the detailed audit. No public App Review or external beta submission was sent.
