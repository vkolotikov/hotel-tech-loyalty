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
and DSA Active; Paid Apps Agreement needs owner bank/tax information. Members' draft is now 2.0.0 and staff's is 1.0.0.
EAS Metadata synced all five languages and manual release, and set staff to Business. Screenshots are uploading/processing;
build selection and privacy/reviewer checks are pending. Submit neither for review. Request staff unlisted distribution
only at the appropriate release step. The members' privacy guide now includes Stripe Product Interaction for Analytics.

Play account FDS Cards ltd (7195613243489270668): existing members listing Hexa Loyalty (`com.hotelloyalty.app`) is in
production. Owner created HexaTech Staff (`uk.hexatech.loyalty.staff`, id `4973001253686610054`) and accepted its declarations.
Both EAS Play credentials now use approved `hexatech-play-submit@hotel-loyalty-app-1414d.iam.gserviceaccount.com`.
Play account is Active with read-only app/quality information and testing release/track permissions on these two apps only.
Google Play Android Developer API is enabled. Old staff listing `com.hotelloyalty.staff` is unchanged.

Android builds finished: members **25** (`8038e20d-f716-4833-b37b-eed95ba04f39`), staff **3**
(`2b108395-90fb-4913-86de-103b77feef5f`). Both downloaded AABs in Downloads contain their correct package and Firebase
project/sender/app-id resources. Members internal submission `50426361-d349-4594-9adb-e3e998941a5e` is scheduled with
`changesNotSentForReview: true`; final outcome is pending verification. Owner was asked to upload staff's AAB on the prepared
internal release page. No iOS rebuild.

Next: finish and verify store metadata/screenshots, select iOS builds 19/2, check members Play submission and owner staff
upload, prepare privacy/review notes, save records and sync staff, then physical-device acceptance. No review submission.
