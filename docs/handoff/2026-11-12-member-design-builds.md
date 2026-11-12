# Members design builds — 12 November 2026

Scope: **HexaTech Loyalty members app only**, `com.hotelloyalty.app`, source `C:/wamp64/www/hexatech-apps`, branch `feature/member-loyalty-refresh-20261111`. Never merge this native branch into Laravel main. Staff, Laravel and production store releases are outside this build continuation.

The owner requested fresh binaries for the latest approved design. Runtime source **257c5e85f645db184dc670581f1cd94872fcf2c3** includes the contextual popups, icon-only dock, direct event registration, consolidated account/preferences screens and confirmed points/check-in/stamp feedback. [Implementation and prior review](../loyalty-member-app/05-NATIVE-DESIGN-20261111.md).

## Build checkpoint

**Delivery complete:** both store-signed production-profile builds finished and their actual packages were inspected. **Android 29 is completed on Play internal testing; iOS 23 is VALID / IN_BETA_TESTING in existing Internal QA.** Testing notes are saved and verified. This is testing delivery, not public review or release.

- Android **2.1.0 / 29**: [7448525e-45e4-4af5-8eca-312a7ca528b8](https://expo.dev/accounts/hoteltechai/projects/hotel-loyalty/builds/7448525e-45e4-4af5-8eca-312a7ca528b8), **FINISHED**. [Upload 4321e3ef-af08-43fd-aebb-c9c872b2039d](https://expo.dev/accounts/hoteltechai/projects/hotel-loyalty/submissions/4321e3ef-af08-43fd-aebb-c9c872b2039d) is **FINISHED**. Google readback confirms **internal / completed / 29**, exact inspected/uploaded AAB SHA-256 parity and current five-language notes. Production remains code **26 / 2.0.0** in track readback.
- iOS **2.1.0 (23)**: [69545c55-638f-4180-92a2-59ce0545880f](https://expo.dev/accounts/hoteltechai/projects/hotel-loyalty/builds/69545c55-638f-4180-92a2-59ce0545880f), **FINISHED**. [Upload f7b32119-290a-4bc3-a650-54bbb8f7f4be](https://expo.dev/accounts/hoteltechai/projects/hotel-loyalty/submissions/f7b32119-290a-4bc3-a650-54bbb8f7f4be) is **FINISHED**. Apple build **ef794e60-04e1-4d13-b871-609a714eaef2** is **VALID / IN_BETA_TESTING**, unexpired, present in Internal QA (two existing testers / all-build access). English testing notes match the source exactly. This is TestFlight availability, not public App Review or App Store availability.

EAS project `865bfb65-5e82-4b4d-b3b4-dc55e9b9ef17`, `@hoteltechai/hotel-loyalty`. Remote version counters continue; existing signing credentials were reused with credential changes frozen. No duplicate build of this source existed before these were started.

## Verified before upload

TypeScript and **71 tests** pass. SDK 58 dependencies match. ESLint adds **zero** diagnostics, retaining the known **16 errors / 16 warnings**. The previous native implementation passed **266 isolated browser checks**; this continuation does not claim new physical-device acceptance.

The actual EAS CLI 27.7.2 archive matches **369 native/runtime/shared files** exactly, including local SVGs, wallpaper, popup routes, translations and the shared member-portal code. No secret files, dependency folders, Staff/backend source or generated native folders are included. The inspected archive has 2,546 files / 25,067,353 bytes (empty excluded directories can remain). Inspection was read-only and scheduled no build itself.

Private EAS responses, logs and artifact-inspection evidence: `C:/Users/user6399/HexaTech-release-private/member-design-build-20261112/`. They can contain signed artifact/log URLs; never print them wholesale. Build helper: `C:/wamp64/tmp/member-eas-20261112.cjs`; archive audit helper: `C:/wamp64/tmp/member-archive-audit-20261112.cjs`. Source remained unchanged while these binaries were queued. Store testing notes/documentation are excluded from the build archive.

## Package checks and delivery outcome

Android artifact is inspected: `C:/Users/user6399/Downloads/HexaTech-Loyalty-2.1.0-29.aab`, 103,833,837 bytes, SHA-256 **ebc2dbb479f1fa3031c02ee250f769bbb998717271572239bc4a25abc46cc6a2**. Package/name/version, minimum SDK 24 / target SDK 36, correct Firebase project/resources, native FileSystem/Sharing, all 26 referenced SVG bytes and compiled latest-design markers pass. `jarsigner -verify` succeeds. Permissions match build 28 exactly; no debug flag, microphone, overlay or external-storage permissions. The packaged icon was extracted and visually checked.

iOS artifact is inspected: `C:/Users/user6399/Downloads/HexaTech-Loyalty-2.1.0-23.ipa`, 43,704,536 bytes, SHA-256 **c070f2218ede9afbc29088e4593010e68bdb801956df646757f3ba41e1ae0953**. Identity/version, production signing/APNs, no debug/microphone/tracking permission, minimum iOS 16.4, iPhone/iPad support, native modules, all 26 referenced SVG bytes and compiled latest-design markers pass. The packaged icon was decoded and visually inspected. The first asset heuristic counted three unused source SVGs; the check was corrected to the 26 actual imports without changing/rebuilding the app.

The initial upload rejected the optional `changelog`/`--what-to-test` parameter before creating a submission. Retrying the same IPA without that parameter succeeded; testing notes were then saved/read back directly through Apple's existing API after processing. No duplicate build or tester group was created. Inspector/download helpers are `member-prepare-inspectors-20261112.cjs` / `member-build-artifacts-20261112.cjs` under `C:/wamp64/tmp/`. Scoped store helpers under the private root end in `member-design-*-20261112.cjs`; they retain credential material outside git and allowlist outputs.

Both exact builds and uploads are finished; do not rebuild or upload duplicates. Existing credentials/tester groups were reused, with no new permissions or invitations. Android notes in **en-GB / ru-RU / de-DE / fr-FR / es-ES** match `store/play/release-2.1.0-design-20261112.json`; Apple's English notes match `store/testflight-2.1.0.txt`. The notes-only Play edit verified production parity and used `ERROR_IF_IN_REVIEW`; inspection/failed edits were cleaned up.

No runtime code changed after the compiled commit. Later source commits contain testing notes and evidence/documentation only. Public review still requires current members-app device QA (including supported iPad), screenshots/video, privacy review and reconciliation of the existing Apple **2.0.0 / REJECTED** record. No new App Review/external-beta submission, production-track/country change, server minimum-version change or Laravel deployment was performed.

Existing Android test entry: https://play.google.com/apps/internaltest/4701572602064076698 with an allowed tester account. Existing Apple Internal QA has two testers and all-build access; this is not a public TestFlight invitation. Do not bypass Play protection or use Staff's video/approval as members-app evidence. Do not change server minimum versions or production availability for an internal testing delivery.
