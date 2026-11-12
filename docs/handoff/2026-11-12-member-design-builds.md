# Members design builds — 12 November 2026

Scope: **HexaTech Loyalty members app only**, `com.hotelloyalty.app`, source `C:/wamp64/www/hexatech-apps`, branch `feature/member-loyalty-refresh-20261111`. Never merge this native branch into Laravel main. Staff, Laravel and production store releases are outside this build continuation.

The owner requested fresh binaries for the latest approved design. Runtime source **257c5e85f645db184dc670581f1cd94872fcf2c3** includes the contextual popups, icon-only dock, direct event registration, consolidated account/preferences screens and confirmed points/check-in/stamp feedback. [Implementation and prior review](../loyalty-member-app/05-NATIVE-DESIGN-20261111.md).

## Build checkpoint

Both store-signed production-profile builds are queued; completion and testing availability are not yet verified:

- Android **2.1.0 / 29**: [7448525e-45e4-4af5-8eca-312a7ca528b8](https://expo.dev/accounts/hoteltechai/projects/hotel-loyalty/builds/7448525e-45e4-4af5-8eca-312a7ca528b8).
- iOS **2.1.0 (23)**: [69545c55-638f-4180-92a2-59ce0545880f](https://expo.dev/accounts/hoteltechai/projects/hotel-loyalty/builds/69545c55-638f-4180-92a2-59ce0545880f).

EAS project `865bfb65-5e82-4b4d-b3b4-dc55e9b9ef17`, `@hoteltechai/hotel-loyalty`. Remote version counters continue; existing signing credentials were reused with credential changes frozen. No duplicate build of this source existed before these were started.

## Verified before upload

TypeScript and **71 tests** pass. SDK 58 dependencies match. ESLint adds **zero** diagnostics, retaining the known **16 errors / 16 warnings**. The previous native implementation passed **266 isolated browser checks**; this continuation does not claim new physical-device acceptance.

The actual EAS CLI 27.7.2 archive matches **369 native/runtime/shared files** exactly, including local SVGs, wallpaper, popup routes, translations and the shared member-portal code. No secret files, dependency folders, Staff/backend source or generated native folders are included. The inspected archive has 2,546 files / 25,067,353 bytes (empty excluded directories can remain). Inspection was read-only and scheduled no build itself.

Private EAS responses, logs and artifact-inspection evidence: `C:/Users/user6399/HexaTech-release-private/member-design-build-20261112/`. They can contain signed artifact/log URLs; never print them wholesale. Build helper: `C:/wamp64/tmp/member-eas-20261112.cjs`; archive audit helper: `C:/wamp64/tmp/member-archive-audit-20261112.cjs`. Source remained unchanged while these binaries were queued. Store testing notes/documentation are excluded from the build archive.

## Finish this delivery

1. Wait for these exact builds; do not create duplicates. Inspect the actual AAB/IPA identity, signing/permissions, Firebase/native modules, packaged SVG bytes and app artwork.
2. Upload the verified binaries to the existing Play internal track and TestFlight Internal QA. Check processing/group/track status; scheduling alone is not availability. Use existing credentials and tester groups; do not expand permissions or create new invitations.
3. Apply/read back current testing notes. Android five-language notes: `apps/loyalty-member/store/play/release-2.1.0-design-20261112.json`; Apple: `apps/loyalty-member/store/testflight-2.1.0.txt`.
4. Update this checkpoint and the release runbook with exact outcomes, commit/push the feature branch. Public review still requires current members-app device QA, screenshots/video, privacy review and reconciliation of the existing Apple rejection.

Existing Android test entry: https://play.google.com/apps/internaltest/4701572602064076698 with an allowed tester account. Existing Apple Internal QA has two testers and all-build access; this is not a public TestFlight invitation. Do not bypass Play protection or use Staff's video/approval as members-app evidence. Do not change server minimum versions or production availability for an internal testing delivery.
