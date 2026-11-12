# Members calendar and platform review — 12 November 2026

**Final source checkpoint:** the additional sign-out/credential ordering, persisted-receipt and delayed-account cleanup corrections are implemented. TypeScript, **101 tests / 11 files** and **284 browser checks / ten scripts** pass; Android/iOS Hermes/web exports pass and lint adds no diagnostics (15 existing errors / 14 warnings). Independent real-four-second reproductions pass on both mocked native platforms, including a later member signing in before/after the handoff. No remaining concrete Important blocker was found in these exact fixes. Final browser evidence: `C:/wamp64/tmp/member-signout-browser-final-20261112.json`; export/lint evidence uses `member-signout-final-*` under that same temp directory.

**Final replacement delivery is being prepared:** expected **iOS25 / Android31**. The earlier **iOS24 was inspected but never uploaded**; **Android30 is CANCELED**, and neither was delivered to testers. Those builds are superseded because the later integration check confirmed that the old logout timeout could revoke a credential still needed for queued push withdrawal. Do not deliver/restart them or create duplicates of the final source.

Final evidence/helpers use `C:/Users/user6399/HexaTech-release-private/member-platform-final-20261112/`, `C:/wamp64/tmp/member-eas-final-20261112.cjs` and `member-final-archive-audit-20261112.cjs`. The final exact source/build/upload IDs and availability must be added after the frozen-source build/inspection/delivery. Offline/server-failure cleanup remains best effort; the deterministic online ordering race is corrected. Current testing notes also cover slow sign-out and account changes.

## Initial correction checkpoint — superseded before delivery

Source: `C:/wamp64/www/hexatech-apps`, branch `feature/member-loyalty-refresh-20261111`, members app `com.hotelloyalty.app`, version **2.1.0**. The previous design delivery is verified as **TestFlight 23 / Play internal 29** in [the earlier build handoff](2026-11-12-member-design-builds.md). The changes below require replacement signed binaries; they do not change those installed builds automatically.

The reported missing Events/calendar dock button is reproduced and corrected. Also corrected: cold-start/native-popup device lock gaps, push registration/Off and reconnect races, direct-link notification reconciliation, unavailable-toggle recovery and missing input accessibility labels. The approved design, five languages, venue branding and canonical loyalty/event decisions are preserved. See [the detailed review](../loyalty-member-app/06-PLATFORM-REVIEW-20261112.md).

## Verification checkpoint

TypeScript and **95 tests / 11 files** pass. **282 isolated browser checks / nine scripts** pass on the final export, including the calendar with no events/history, device-lock cold start, actionable notification preferences and accessible password fields. Android/iOS Hermes and web exports pass; dependencies are SDK-aligned. ESLint has **15 existing errors / 14 warnings, zero added diagnostics**. Fresh review found no remaining concrete Important source blocker and independently verified the corrected storage race on both platform branches.

Local evidence: `C:/wamp64/tmp/member-platform-final2-all-20261112/`, `member-platform-final2-exports-20261112.log`, `member-platform-final2-lint-20261112.json`, `member-platform-browser-final3-20261112.json`. Browser tests and demo setup are repeatable under `apps/loyalty-member/e2e/`. Early fixed-delay snapshots sampled tablet relayout and a transient pulse too late/early; the tests now wait for observable settled geometry and a rendered pulse frame. The final run passes without changing those production layouts/animations.

## Testing delivery

Source is frozen, committed and pushed at **1fbf984fe6c9115fe076495cf86b7b1824ba0cd6**. The EAS archive has **374 matching runtime/shared files**, **2,554 files / 25,086,004 bytes**, no forbidden credentials/dependencies and no backend/Staff files. Exactly one replacement build per platform is **IN_PROGRESS**, reusing existing signing credentials with credential changes frozen:

- Android **2.1.0 / 30**: [19985c32-0637-40d8-9484-a47724995646](https://expo.dev/accounts/hoteltechai/projects/hotel-loyalty/builds/19985c32-0637-40d8-9484-a47724995646).
- iOS **2.1.0 (24)**: [3474d3e0-5ebc-4520-aa2a-56dce7f1c9f2](https://expo.dev/accounts/hoteltechai/projects/hotel-loyalty/builds/3474d3e0-5ebc-4520-aa2a-56dce7f1c9f2).

Neither replacement is yet verified available to testers at this checkpoint. EAS project remains `@hoteltechai/hotel-loyalty` / `865bfb65-5e82-4b4d-b3b4-dc55e9b9ef17`. Do not build duplicates; finish these exact builds, inspect their actual packages and continue the delivery below.

Private evidence folder for this correction: `C:/Users/user6399/HexaTech-release-private/member-platform-fixes-20261112/`. Raw EAS responses/logs may contain signed URLs; never print them wholesale. Safe helper: `C:/wamp64/tmp/member-eas-platform-20261112.cjs`. Archive: `C:/wamp64/tmp/member-platform-archive-20261112/`; audit helper: `C:/wamp64/tmp/member-platform-archive-audit-20261112.cjs`.

After package inspection, deliver only to existing TestFlight Internal QA and Play internal testing, save/read back `store/testflight-2.1.0.txt` and five-language `store/play/release-2.1.0-platform-fixes-20261112.json`, and verify availability. Do not submit a public release, alter selected countries or server minimum versions. Update this handoff with exact source/build/upload IDs and actual outcomes; do not create duplicate builds.

Physical iPhone/iPad/Android acceptance remains required for hardware/provider/native presentation details. No Staff changes, Laravel deployment, main merge or public App Review submission is part of this correction.
