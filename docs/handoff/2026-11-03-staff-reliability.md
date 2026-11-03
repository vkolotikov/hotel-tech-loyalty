# Staff reliability and Figma continuation — 3 November 2026

Owner: “lets proceed with your suggested improvements.” This follows the Staff audit, not a new member/admin redesign or store publication request. Implement confirmed reliability fixes now; present new design for review before applying it.

Worktree `C:\wamp64\www\hexatech-apps`, branch `feature/staff-reliability-20261103`, based on audit commit `36c3e594d`. Full scope, checks and remaining items: `docs/loyalty-staff-app/04-RELIABILITY-AND-DESIGN-20261103.md`.

Figma file `HQV6zF7ArPVd7rpdf1UUPr`, session `69cf3a38-3417-47ca-a671-eace288fcac3`. Board `4:186`, core group `4:190`, critical states `4:621`, prototype start `4:851`. Seven editable concepts, visually verified. Native code still uses the previous layout. Do not imply the Figma redesign or future feature controls are implemented.

Checks: TypeScript and 38 Vitest tests passed; Expo dependency check clean; Android/iOS/web bundles exported before the final navigation guard and Home capability gate. No store release or backend deployment in this pass.

Private demo authorizations and credentials remain as in `2026-11-03-native-apps-release.md`; never echo them. Physical iOS, biometric, NFC and push acceptance remain required for release.

## Source and preview

- Native source commits: `e5617cb2f` (main fixes/design records), `7d2b9e7c1` (restored attempt identity and prevent navigation during send), `24a119344` (Home analytics capability gate). Pushed to `feature/staff-reliability-20261103`.
- Standalone Staff source copied by explicit file list to `C:\wamp64\www\hexatech-staff-release-20261102`: commits `07075671a`, `9fde7fe62`, pushed to remote `feature/loyalty-staff-app`. Do not merge native feature history into `main`.
- Final Android preview: `e59809c6-5177-4a43-a443-11b29aded97a`, source `24a119344`, profile `preview`, production EAS environment (for Firebase file), internal APK. Version remains 1.0.0; this is not a store release.
- Earlier preview `75e529da-d360-47b2-9e52-e258540a8ba7` was cancelled; `3b6d1f77-4508-4fe5-be74-c38cbd7bbabe` contains `7d2b9e7c1` and is superseded by the final preview. Use only the final build for delivery.
- Figma design approval requested from the owner; no answer yet. Do not apply the proposed new layouts until reviewed.

## Android runtime acceptance

Pixel 8 API 35 emulator, isolated review organisation 49. Core preview `3b6d1f77-4508-4fe5-be74-c38cbd7bbabe` finished and installed successfully. Its source is `7d2b9e7c1`; the final source adds only the Home analytics capability gate. The Play-signed package could not be updated with the EAS upload-signed APK, so only the emulator's Staff package was uninstalled/reinstalled; no server account or other app was removed.

Observed in the installed core preview:

- Fresh Staff sign-in succeeds. Home, tab badge and Requests show 3 waiting items (2 rewards + 1 benefit), versus 1 in the published binary.
- Reward rows show full member number and code. Handover opens a confirmation containing member identity, reward and code. Cancel leaves the same queue intact.
- Done includes the completed reward alongside given/cancelled benefits.
- Member details/cards load. Entering `1.5` points is rejected; closing the form leaves the member at 210 points.
- Entering `-10` purchase amount is rejected with a positive-amount/currency-decimals message, without recording an amountless visit. Evidence: `docs/loyalty-staff-app/reliability-20261103/core-invalid-purchase.png`.
- Sign-out returns to an empty sign-in form. Android Back exits to Play rather than exposing previous member screens.
- No successful points, check-in or reward write was made during this pass. A small points-validation wording improvement is noted in the delivery report for the design phase.

Final preview `e59809c6-5177-4a43-a443-11b29aded97a` **finished successfully and installed** over the core preview at approximately 17:06 UTC. Package readback: `uk.hexatech.loyalty.staff`, version 1.0.0, code 3. APK SHA-256: `994CBFC7D9FF6BC27347931B7A95E236DC01901273BD1DBB2C2BF134795502B1`. Download: `https://expo.dev/artifacts/eas/_nUidiZnxgLbSEHcAop0OgQ72KQ-KjujPoaI1NK6iIo.apk`; local file `C:\Users\user6399\Downloads\HexaTech-Staff-reliability-preview.apk`.

Final-preview UI smoke check is pending at this checkpoint: the emulator was minimized and the CUA input guard reported manual input, then refused to activate it, while state reads failed on the minimized window. Asked the owner to restore the Pixel 8 emulator; do not claim the final binary's sign-in was observed until that check is done. The preceding core preview was tested as described above.

Live demo API recheck after runtime tests: 25 reads passed, staff blocked from member portal. All 98 tracked Staff app files matched the standalone release tree by SHA-256. No physical biometric, NFC, QR or push-delivery acceptance is implied by these checks; non-manager analytics behavior was inspected in source, not exercised with a live restricted account.
