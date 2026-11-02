# Native apps release handoff — 2 November 2026

This is the native-store release only. Read CLAUDE.md, the 31 October application handoff, and both apps'
`02-RELEASE.md` build records. No Laravel Cloud deployment or main-branch change belongs to this task.

Release checkout: `C:/wamp64/www/hexatech-apps`, branch `feature/loyalty-store-release-20261102`, from
`origin/feature/loyalty-member-app` at `5c0461c37`. Main checkout and its uncommitted files are untouched.
Publish the release work to `feature/loyalty-member-app`; copy `apps/loyalty-staff` and its release runbook as one
commit onto the independent `feature/loyalty-staff-app` history, preserving identical staff files.

Android configuration is now wired through `app.config.js` and the production EAS secret file variable
`GOOGLE_SERVICES_JSON` in each current project. Firebase project `hotel-loyalty-app-1414d` now contains both exact
packages (`com.hotelloyalty.app`, `uk.hexatech.loyalty.staff`). Its original `com.hoteltech.loyalty` and web registrations
are unchanged. FCM V1 API is enabled; the owner approved generating the existing service account's key and EAS confirmed
its FCM V1 assignment to both apps. Private files are under the workstation user's `HexaTech-release-private` directory;
never print their contents or commit them. Do not change the OLD Expo `hotel-staff` project.

All 56 app tests and both TypeScript/dependency checks pass; prebuild configuration resolves the actual private files.
An additional temporary Expo ESLint preset exposed existing source diagnostics (members 27 errors / 16 warnings,
staff 32 errors / 11 warnings). No lint setup existed; automatic lint-related package/config changes were reverted.
Fixes outside the requested release checklist require the owner's direction. No full-app lint success is claimed.

Apple: members 2.0.0 (19) is installed by the owner via existing Internal QA. Staff 1.0.0 (2) is Ready to Test in newly
created Internal QA, owner invited. EAS credentials exist, certificate/profiles expire 2027-05-01. Free Apps Agreement
and DSA Active; Paid Apps Agreement needs owner bank/tax information. Members' store draft still 1.1.0. / build 3;
staff draft largely blank with no build selected. Prepare both using their five-language listing files/screenshots;
submit neither for review. Staff category Business; request unlisted distribution only at the appropriate release step.

Play account FDS Cards ltd (7195613243489270668): existing members listing Hexa Loyalty (`com.hotelloyalty.app`) is in
production. The new staff listing is absent; create it as HexaTech Staff, package `uk.hexatech.loyalty.staff`, English UK,
App, Free. Owner must accept the policy/export declarations and do its first AAB upload manually. Old staff listing
`com.hotelloyalty.staff` is separate and unchanged. Both EAS Play submission credentials remain missing.

Next: commit/push and sync staff, build **Android only** once per current app, record the resulting codes/links; configure
a Play service account with rights to these two apps; members internal upload; owner staff first upload. Complete draft
metadata/privacy/review notes, physical-device acceptance, then wait for the owner's final review-submission instruction.
