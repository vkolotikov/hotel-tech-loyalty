# HexaTech Staff 1.0 — release runbook

Latest Apple continuation (5 November 2026): **1.0.5 (3)** built from the current Android release source, uploaded and processed as **VALID**; existing Internal QA shows **Testing**. Previous Staff/Loyalty rejections are **Guideline 2.1 information requests**, including a mandatory physical-device recording. Staff's editable version/expanded review notes are prepared, with manual release retained; resubmission awaits accurate device evidence and replacement screenshots. See `19-IOS-RELEASE-20261105.md` and `apps/loyalty-staff/store/apple/recording-checklist.md`.

Latest Android update checkpoint (5 November 2026, 13:24 UTC / 15:24 Europe/Riga): **1.0.5 (4) and three store-image changes were submitted for production review** through the owner's authenticated Playwright browser. By 13:30 UTC, automated quick checks had finished and Publishing overview confirmed **Your changes are now in review** (submission 3). Approval/public availability of 1.0.5 remain pending. The last confirmed public version is 1.0.0 (3). All existing countries are preserved, translated text is unchanged and translations inherit the new English images. Full artifact checks, submission and verification: `18-PLAY-RELEASE-20261105.md`.

The desk app (`apps/loyalty-staff`, branches `feature/loyalty-staff-app` and `feature/loyalty-member-app`, identical
there) ships as a **new listing**: bundle and package `uk.hexatech.loyalty.staff`, Apple team `HNWSAQ5CQ9`, Expo owner
`hoteltechai`. On the App Store it is meant to be **unlisted** (only venues get the link). Store texts:
`apps/loyalty-staff/store/listing.json` (five languages, Spanish addressing staff as usted, checked against every store
limit by `src/lib/store.test.ts`). Screenshots: `apps/loyalty-staff/store/screenshots/`.

Prepared 2026-10-31. Release checks run in the cloud container: tsc, 22 tests, `expo install --check` clean,
`expo-doctor` 18/20 (the two checks that need the Expo API), a local `expo prebuild` read for permissions (camera, NFC
and Face ID texts only; no microphone; NFC entitlement `TAG` only; Android's unused permissions blocked).

## 0. Before the first build (owner)

1. **Let the build run:** a computer signed in to Expo as `hoteltechai`, or this cloud environment with `api.expo.dev`,
   `expo.dev` and `storage.googleapis.com` allowed and an `EXPO_TOKEN` secret for `hoteltechai` (environment
   settings, never the chat or the repository).
2. **Create the Expo project:** `cd apps/loyalty-staff && npx eas-cli init`. It writes `extra.eas.projectId` into
   `app.json`; commit that. Push alerts need it.
3. **Create the App Store Connect record** (the API cannot create apps): App Store Connect → Apps → New App, platform
   iOS, name "HexaTech Staff", primary language English, bundle id `uk.hexatech.loyalty.staff` (register it first
   under Certificates, Identifiers & Profiles if it is not offered, with the NFC Tag Reading capability), any free SKU.
   Put its Apple id in `eas.json` → `submit.production.ios.ascAppId`.
4. **Credentials:** the first `eas build` creates the iOS distribution certificate and profile and, when asked, the
   Apple push key (or `npx eas-cli credentials`); it creates and keeps the Android upload keystore. Android push:
   configure both the Firebase Android file and FCM V1 credential below for `uk.hexatech.loyalty.staff`.
   App Store Connect API key for submitting: `npx eas-cli credentials` → iOS.
5. **Create the Play app:** Play Console → Create app "HexaTech Staff", app, free; the first upload fixes the package
   `uk.hexatech.loyalty.staff`. Play App Signing on (the default).
6. **Check the cards:** iPhones read NTAG, Ultralight and DESFire cards, not MIFARE Classic (Android reads all). Check
   the production cards before promising NFC on iPhone.

### Android push configuration

Use Firebase project **`hotel-loyalty-app-1414d`** (Hotel-Loyalty APP), Android package **`uk.hexatech.loyalty.staff`**.
Keep the old `com.hoteltech.loyalty` registration unchanged. Download this app's `google-services.json` from Project
settings → General → Your apps. Keep the file and any service-account JSON key outside the repository. From
`apps/loyalty-staff`:

```powershell
npx -y eas-cli@latest env:create --name GOOGLE_SERVICES_JSON --type file --value '<absolute private path to google-services.json>' --environment production --visibility secret --non-interactive
$env:GOOGLE_SERVICES_JSON = '<absolute private path to google-services.json>'
npx expo config --type prebuild
Remove-Item Env:GOOGLE_SERVICES_JSON
```

`app.config.js` extends `app.json` and supplies `android.googleServicesFile`; the production profile explicitly uses
the production EAS environment. Secret files are available on the EAS build worker, not downloaded by `eas env:pull`.
Local config without this variable remains usable for iOS/web; it does not prove Android push is configured. Android
development/preview builds that need notifications require the same file variable in their own EAS environment.

Separately, assign this Firebase project's service-account key via `npx -y eas-cli@latest credentials -p android`
→ production → Google Service Account → FCM V1. That key is not `google-services.json` and is not the Play submission
credential. See [Expo's FCM setup](https://docs.expo.dev/push-notifications/fcm-credentials/).

Before building: `npx tsc --noEmit`, `npx vitest run`, `npx expo install --check`, then resolve the prebuild config
with the actual private Firebase file. Commit and push first. For this correction run **Android only**:
`npx -y eas-cli@latest build -p android --profile production --non-interactive`. Keep iOS build 2; no iOS rebuild is
needed. After installation, verify a request alert reaches an Android phone and opens Requests.

## 1. Build and submit

```bash
cd apps/loyalty-staff
npx eas-cli build --profile production --platform all     # version 1.0.0; build numbers kept by EAS
npx eas-cli submit --profile production --platform ios     # to App Store Connect → TestFlight
npx eas-cli submit --profile production --platform android # to Play, internal testing track
```

## 2. Test on phones before review

TestFlight and Play internal testing, with the acceptance list in `apps/loyalty-staff/README.md`: NFC on both phones
with the real cards, QR in poor light, typed codes, door answers, points, check-in, linking a card, requests (and their
alert reaching the phone), the lock, five languages.

## 3. Store listing

Paste from `store/listing.json` per language. Category **Business**; Apple age rating **4+**. Google's IARC ratings
include ESRB Everyone, PEGI 3 and USK 16+ (communication risk from private user content). Links: privacy
https://app.hexa-tech.uk/privacy, terms https://app.hexa-tech.uk/terms, data deletion (Play)
https://app.hexa-tech.uk/data-deletion, support: https://hexa-tech.uk/about-us (published HexaTech contact details).

Screenshots: `store/screenshots/ios-6.9` (1320×2868), `ipad-13` (2064×2752; the app supports iPad as a desk tablet),
`play-phone` (1080×2160), rendered from the app's web preview against test data.

`store.config.js` reads the five-language source file and English iPhone/iPad screenshots for EAS Metadata.
Run `npx -y eas-cli@latest metadata:push --non-interactive` from this app to update the editable Apple draft using
the existing EAS Apple credential. It selects version 1.0.0, Business and manual release; it does not submit for review.
Reviewer credentials stay in the console, not this config. The Android submit profile targets internal testing and
sets `changesNotSentForReview: true`; the owner still performs the first Play AAB upload.

### App Store: App Privacy

Data used to track: **none**. Data linked to the person, all for **App Functionality**:

| Category | Types | Why |
|---|---|---|
| Contact Info | Name, Email Address | The staff member's account |
| Identifiers | User ID | The staff account; a member's number or card id when the staff member scans or links a card |
| Identifiers | Device ID | This phone's notification token, stored against the staff account for request alerts |
| Purchases | Purchase History | An amount the staff member enters to award points for a purchase |
| User Content | Other User Content | Staff-entered transaction notes and request-decline reasons |
| Search History | Search History | Member search requests; full query URLs can be retained by server error logs |
| Usage Data | Other Usage Data | Recorded desk actions, including check-ins, awards and request decisions |

The camera reads QR codes on the phone and stores nothing; NFC reads a card's id only; Face ID is the phone's own.
The last three types were identified in the 3 November source audit after the initial five-type declaration was
published. All eight are now configured and published; see the continuation record below.

### Google Play: Data safety

- Collected (not shared): Personal info (name, email address, user IDs), Financial info (purchase history: amounts
  entered for points), Device or other IDs (the push token for request alerts), and App activity (in-app search
  history, other user-generated content, other actions).
- Name, email and user IDs: required, App functionality and Account management. The other five types: optional,
  App functionality. Notifications can be refused; purchase amounts and free-text notes are manually supplied;
  searching and desk actions are initiated by the user. The app's business actions are recorded server-side.
- Notes/reasons and search requests also leave the device (`src/lib/api.ts`). Notes/reasons persist; 500-error logs
  can retain full request URLs including search queries (`bootstrap/app.php`). Do not claim ephemeral processing.
  These three app-activity types were missing from the initial five-type guide and were added during the source audit.
- Encrypted in transit: yes. Staff accounts are made and removed by the venue's administrator; deletion requests by
  the data-deletion page. No in-app account creation; outside-app employment/enterprise accounts. No independent
  MASA security-review badge. Privacy and deletion URLs both returned HTTP 200 on 3 November.

The Google form can be exported/imported as CSV. Preserve its header exactly, UTF-8 without a BOM; answers use
`TRUE`/`FALSE`. Review the imported preview before saving. See
[Google's data-safety definitions and CSV format](https://support.google.com/googleplay/android-developer/answer/10787469).

### Review notes (App Store "App Review Information" and Play "App access")

The reviewer needs a staff account. On production, in the full admin of a demo organisation (or the owner's venue): add a
staff user with a password and a desk role, and a member with some points and a pending benefit request. Enter in the
review notes, never in this repository:

```
Sign in with: <demo staff email> / <demo staff password>
HexaTech Staff is the desk app for venues' staff. Without a member's NFC card, open Scan → Type instead → the member
number <demo member number> to see a member, award points or check them in. Requests lists the demo member's request.
NFC needs a venue's physical card; the camera reads a member's QR code from the HexaTech Loyalty app.
```

## 4. Release

1. Submit the complete final version for review, including any evidence Apple requested. App Store: note the intention in Review Notes, then request **unlisted distribution** with Apple's Unlisted App Distribution request
   form once the app is submitted to App Review (prior approval is not required; beta/prerelease apps are ineligible). The form needs the app's App Store Connect id; once Apple grants it, the app is reachable only by its link. Retain manual release until this is resolved. Play:
   promote the internal release to production (Play has no unlisted mode; a private app needs managed Google Play).
2. In Laravel Cloud set `STAFF_APP_IOS_URL` to the App Store link (the unlisted link once granted) and, if the Play
   link differs from the default, `STAFF_APP_ANDROID_URL`; then redeploy. `STAFF_APP_MIN_VERSION` and
   `STAFF_APP_LATEST_VERSION` stay `1.0.0` until the next release.
3. Record the release (date, build numbers, submission ids) in `docs/loyalty-staff-app/00-PLAN.md`.

## Build record

**2026-11-02** (from `feature/loyalty-member-app`, EAS as the `hoteltechai` robot user, Developer role):

- Expo project created: `@hoteltechai/hexatech-loyalty-staff`, id `aacc3c67-7f27-487d-842b-4fe6b923034b` (in
  `app.json`). Its dashboard picture could not be set by the robot user; upload the icon on expo.dev if wanted.
- Android 1.0.0 version code **2**: finished (`https://expo.dev/accounts/hoteltechai/projects/hexatech-loyalty-staff/builds/9524ada0-d35a-4f4e-bc9e-2a3435bd42a8`),
  with a new upload keystore EAS created and keeps. The Play app does not exist yet; Google takes a new app's first
  upload only through Play Console, by hand (download the `.aab` from the build page).
- iPhone: EAS cannot create the distribution profile without an Apple sign-in ("Distribution Certificate is not
  validated for non-interactive builds"), so the owner ran `npx eas-cli@latest credentials -p ios` in
  `apps/loyalty-staff` on the workstation. Apple first refused with "PLA Update available" (403) until the latest
  Program License Agreement was accepted at developer.apple.com/account. Then: bundle id registered with Push
  Notifications and NFC Tag Reading, the team's distribution certificate reused (serial `5C0025…`, to 2027-05-01),
  provisioning profile `3MHB7GK36R` created. Build 1.0.0 (**2**) started from here
  (`https://expo.dev/accounts/hoteltechai/projects/hexatech-loyalty-staff/builds/fa46634b-6511-4c31-b1d1-fe0b2cb89bd9`).
- App Store Connect record created by the owner: Apple ID **6829777674** (`eas.json` → `submit.production.ios.ascAppId`).
- Push key `8WAF9T6SVD` (the team's, shared with Hotel Staff and Hotel Loyalty) and the App Store Connect API key
  `S7Y8H6Q477` assigned by the owner. Build 2 **uploaded to App Store Connect** the same day
  (`https://expo.dev/accounts/hoteltechai/projects/hexatech-loyalty-staff/submissions/f84d604f-92ea-46ac-847d-aa226721add1`);
  the TestFlight internal testing group is made by hand.
- expo 58.0.22, expo-dev-client 58.0.18, expo-router 58.0.29, TypeScript ~6.0.3 (`expo install --check` clean).

**2026-11-02, workstation release continuation (Codex):**

- Verified iOS **1.0.0 (2)** is processed in App Store Connect. Created **Internal QA**, added the owner's existing
  Apple account, and verified the group has **1 tester / 1 build**, build 2 **Ready to Test**, owner **Invited**.
  Group: `https://appstoreconnect.apple.com/teams/c52a2796-9002-4a39-a576-be011699b6ef/apps/6829777674/testflight/groups/d88de1ab-db9a-4592-a8f7-ba9929f6df88`.
- EAS still holds the Apple push key, submission key, distribution certificate and active provisioning profile; the
  certificate/profile expire 2027-05-01. Apple's Free Apps Agreement and Digital Services Act status are Active.
  Paid Apps Agreement is Pending User Info (bank/tax information), for the owner. Staff's distribution draft is
  still largely empty and has no build selected; store metadata, Business category and build 2 remain to prepare.
- Registered **uk.hexatech.loyalty.staff / HexaTech Staff** in Firebase **hotel-loyalty-app-1414d**, alongside the
  members' correct package and existing old apps. FCM V1 API is enabled; no old app was changed or deleted.
- Added `app.config.js`, ignored `google-services.json`, and made the production EAS environment explicit. Uploaded
  the correct Firebase config as project-scoped production **secret file** `GOOGLE_SERVICES_JSON`. Local prebuild
  config resolves the actual private file, correct package, version and EAS project. Files stay outside git under
  the workstation user's `HexaTech-release-private` directory.
- With the owner's explicit confirmation, generated the existing Firebase service account's private key and assigned
  it to **both current Expo projects for FCM V1**. EAS confirmed the assignment to `uk.hexatech.loyalty.staff`. This
  is not a Google Play submission credential; that remains unassigned.
- Checks: TypeScript passes; **22 tests pass**; `expo install --check` passes. Additional `expo lint` had no existing
  app configuration and auto-installed its preset, then failed its ESLint version detection. Direct ESLint with that
  temporary preset reported **32 errors / 11 warnings in unchanged app source** (React hooks and import checks).
  The auto-generated lint config and package changes were removed; no unrelated lint fixes were made. Config syntax,
  whitespace and ignored-file checks pass. This is not a clean full-app lint baseline.
- Play Console currently has no `uk.hexatech.loyalty.staff` listing; its creation requires the owner's policy/export
  declarations. The old staff listing uses `com.hotelloyalty.staff` and was left alone. New Android build, first manual
  Play upload and physical push testing remain pending at this commit. No iOS rebuild, review submission, production
  rollout or Laravel Cloud deploy was performed.

**2026-11-02, Android build and store setup (Codex):**

- Source commit `ee46c0c34` pushed to `feature/loyalty-member-app`; staff-only copy `48770c8ba` pushed to its independent
  branch with exact staff-file parity. Main remains untouched.
- Android **1.0.0 / version code 3** finished successfully:
  `https://expo.dev/accounts/hoteltechai/projects/hexatech-loyalty-staff/builds/2b108395-90fb-4913-86de-103b77feef5f`.
  Downloaded `HexaTech-Staff-1.0.0-3.aab` to the workstation user's Downloads folder. Inspected the AAB itself: correct
  package, Firebase project, sender ID and `google_app_id` resource are present. Physical push delivery is still untested.
- The owner completed the legal declarations and created Play app **HexaTech Staff**, id `4973001253686610054`, package
  `uk.hexatech.loyalty.staff`. Its internal testing release draft is prepared; owner was asked to perform its first upload.
  `https://play.google.com/console/u/0/developers/7195613243489270668/app/4973001253686610054/app-dashboard`.
- Owner approved dedicated `hexatech-play-submit@hotel-loyalty-app-1414d.iam.gserviceaccount.com` and its JSON key.
  Google Play Android Developer API is enabled. Play shows Active with app information/app quality, testing releases
  and tester/track management on only the two current packages. No production, finance or account-wide access.
  EAS confirmed this key's staff Play submission assignment; FCM continues to use the separate Firebase key.
- EAS Metadata synced all five Apple language texts, Business category, version 1.0.0 and manual release. English
  screenshots are uploading/processing at this checkpoint. Review credentials remain owner-entered in the console.

**2026-11-02 completion, verified again 2026-11-03 (Codex):**

- The owner completed the first AAB upload. Internal release **1.0.0 / version code 3** was saved and published to
  internal testing on 2 November at 18:06; Play showed **Available to internal testers**, **Not reviewed**. The existing
  Admin tester list was selected and saved. Test link: `https://play.google.com/apps/internaltest/4700822212750987105`.
- Apple draft **1.0.0** selects valid build **2**, Business category and manual release. All five locales have
  descriptions. All **10** English screenshots (five iPhone, five iPad) are now **COMPLETE**, with no processing errors.
  The version remains **PREPARE_FOR_SUBMISSION**; neither store has a new public Staff release yet.
- Saved credential-free Apple review notes and `demoAccountRequired: true`; kept the same notes in
  `store/review-notes.txt`. Contact information and demo sign-in fields are incomplete. The owner confirmed demo
  accounts still need setup. The Apple privacy draft currently contains **Name only**, is incomplete and unpublished.
  Complete the remaining data types/purposes from this runbook, plus Play listings and data safety, before review.
- On 3 November the owner confirmed Staff works and explicitly authorised publishing it on Android and iOS.
  Continue release preparation and submission under that instruction. Owner-entered sign-ins, demo credentials and
  legal declarations remain necessary; no production rollout or App Review submission has happened yet.

**2026-11-03, reviewer accounts and live acceptance (Codex):**

- Owner authorized creating isolated demo accounts. Created **HexaTech App Review Demo** (organisation 49), with
  member 549 and a staff manager restricted to that organisation. No existing customer account or membership changed.
  Generated credentials are held in the workstation user's private release directory, outside git, with a user-only ACL.
- Tested real member/staff sign-in and **25 authenticated reads** across the apps' home, members, card, history,
  rewards, offers, requests, programme and booking-history APIs. Confirmed a staff session gets `403 member_only`
  from the member portal. Demo booking inventories are absent, so booking entry points are disabled as expected.
- Awarded 500 demo points and repeated the same idempotency key: one ledger line, no duplicate points. Redeemed and
  fulfilled a demo reward, checked in for 10 points, requested/approved/completed a benefit. Left a second reward
  redemption and a late-checkout benefit request pending for reviewers. Demo member number: **HL-2026-000493**.
- Apple review information now has the verified demo staff sign-in, concrete demo steps, and owner-supplied contact
  Vitalijs Kolotikovs / info@hexa-tech.uk / +44 736 651 0477. The company is FDS Cards Ltd, 25 Cabot Square,
  Canary Wharf, London E14 4QZ, United Kingdom. Password values were never printed or committed.
- Staff privacy data types now include all five intended categories. Purpose/linkage/tracking setup and publication
  are still being completed; do not treat the privacy declaration or store release as finished at this checkpoint.

**2026-11-03, Apple review submission (Codex):**

- Completed all five privacy categories: Name, Email Address, User ID, Device ID, Purchase History; each linked to
  the user, App Functionality only, no tracking. The owner clicked the legal privacy Publish confirmation; the UI
  confirmed publication by Vitalijs Kolotikovs.
- Completed the age-rating questionnaire (including Apple's required social-media fields); Apple shows **4+**.
  Set the initial price to **Free**, base territory **GBR**, after verifying that no prior price schedule existed.
- The owner confirmed content rights. The UI initially still showed unset, so the same confirmed answer was saved
  and visibly verified: the app has the necessary rights to third-party content.
- Apple validation passed, and **1.0.0 (2)** was submitted for review under the owner's publishing authorization.
  The UI now shows **Waiting for Review**, with submission
  `https://appstoreconnect.apple.com/apps/6829777674/distribution/reviewsubmissions/details/1e91c8e9-d6c2-402a-9f15-b35bf8e1074d`.
  **Manual release remains enabled.** After approval, request unlisted distribution before releasing it publicly.
- Play's privacy-policy link and no-advertising declaration are saved as draft changes. Other app-content forms,
  listing and production submission remain in progress. Added original-brand Play assets in `store/play/`:
  a 512x512 icon export and 1024x500 feature graphic, visually inspected. These do not require new app binaries.

**2026-11-03, Play app-content preparation (Codex):**

- Saved the Government apps declaration as **No** and Health as **no health features**. Financial features explicitly
  lists **Rewards, points, frequent flier miles, and other incentives**; selected this because the app awards and
  redeems loyalty points. Google requires no additional financial or regional health documentation for these answers.
  The dashboard confirmed **5 of 11** app-setup tasks complete.
- Google's target-audience form is blocked until Sign-in details (formerly App access) are complete. Prepared the
  isolated staff review account's label, email and 436-character workflow instructions, with full demo feature
  access confirmed. Password entry and Add/Save were handed to the owner under the original release instructions.
  A private owner-only text file contains the demo sign-ins without API tokens. Never put its contents in git/chat.
- Audience, content rating, data safety, category/contact, full Play listings and production review remain pending
  at this checkpoint. The Staff production release has not been submitted or published.

**2026-11-03, Play setup and privacy audit completion (Codex):**

- Owner entered and saved the isolated Staff reviewer password. Verified Google's saved sign-in details and full
  demo workflow. Owner accepted the IARC Terms of Use; completed the questionnaire with private staff user-content
  sharing and server-provided online content disclosed. No objectionable packaged content, public social feed,
  digital purchases, cash prizes or location sharing. Ratings: ESRB Everyone, PEGI 3, Brazil All ages, USK 16+
  (increased communication risks), rest of world 3+; Users Interact. Target audience is **18 and over**.
- Saved Data safety for the eight types described above, including notes/reasons, searches and recorded actions
  identified by source inspection. Required personal-account fields have App functionality and Account management;
  five optional types have App functionality. No sharing, no ephemeral-processing claim, encryption in transit,
  enterprise accounts created outside the app and the data-deletion URL are declared. No independent security badge.
- Saved Business category, public contact **info@hexa-tech.uk** and **https://hexa-tech.uk/about-us**. All five Play
  locales (en-GB, de-DE, es-ES, fr-FR, ru-RU) match the source title, short description and full description exactly,
  verified with a read-only Play API snapshot. Added `store/play/translations.json` for Google's translation importer.
  One 512x512 icon, one 1024x500 feature graphic and five 1080x2160 phone screenshots are saved; translations inherit
  English images. The icon/feature exports were labelled AI-assisted in Google's asset declaration; screenshots were
  not. Google dashboard confirms all **11 app-setup tasks complete**.
- Apple privacy now publishes **all eight types**, each linked to the user, App Functionality only, no tracking.
  Added Other User Content, Search History and Other Usage Data through their setup forms; no new legal agreement was
  presented by this edit flow. Verified eight completed types and no outstanding setup warning. Staff iOS remains
  **WAITING_FOR_REVIEW**; no withdrawal or new binary was needed.
- Created a Play production draft from the existing tested **1.0.0 (3)** bundle with release notes in all five
  languages. Initial validation found only missing country availability. Owner explicitly selected **all supported
  countries**; country setup and final production submission continue below.

**2026-11-03, Google production submission (Codex):**

- Saved **177 named countries/regions plus Rest of world (178 total)** under the owner's worldwide-release choice.
  Release validation now says **Ready to release**, with build **3 (1.0.0)** and five-language release notes.
- Google's pre-review checks required an additional Advertising ID declaration. Verified app source/dependencies
  and the actual build 3 AAB manifest: no advertising SDK or `com.google.android.gms.permission.AD_ID`. Saved **No**.
- Sent all **15 changes for review** at approximately **10:44 UTC**. Publishing overview shows **Changes in review**,
  with automated quick checks still running at this checkpoint (up to 14 minutes displayed). Google will advance the
  submission when these checks succeed. **Managed publishing is off**, so review approval can publish the full rollout.
  This is a review submission, not evidence that the public Play listing is already available.
  `https://play.google.com/console/u/0/developers/7195613243489270668/app/4973001253686610054/publishing`
- A read-only API snapshot reverified exact source matches for all five locales, one icon, one feature graphic and
  five phone screenshots. Both production and internal track objects name version code 3; API release status
  `completed` describes the requested full rollout and does not establish review approval or public availability.
  The empty inspection edit was removed without committing any API change. Production access was not added to the
  testing service account; submission was through the owner's authorized Play Console session.
- Final verification the same session: automated quick checks completed, the running-check banner disappeared and
  Google explicitly states **Your changes are now in review. We may find additional issues when reviewing your app.**
  No additional pending action or pre-review issue is shown. Approval and public availability remain pending.

**2026-11-03, publication and credential follow-up (Codex):**

- Google approved the production release. Publishing overview now says **Last published on 3 November 2026**,
  and the public listing at `https://play.google.com/store/apps/details?id=uk.hexatech.loyalty.staff` visibly
  shows **HexaTech Staff**, FDS Cards ltd and **Install**. Android Staff is publicly available.
- Apple Staff is still **WAITING_FOR_REVIEW**, build 2 VALID, manual release. Unlisted distribution remains the
  intended step after approval. Do not describe iOS as published.
- Owner explicitly authorized equivalent Apple API-key rotation through the browser. Both Expo project assignments
  and Apple API access were verified with the replacement before revoking the exposed key. Revocation was verified
  in Apple's UI. Credentials and helper scripts remain outside git.
- An emulator clipboard mismatch may have exposed the shared demo password. Owner explicitly authorized replacing
  both isolated demo passwords and entering them in both stores and the emulator, overriding the earlier owner-only
  demo-password entry restriction. Both demo passwords were replaced, other sessions revoked, old-password refusal
  and new-login identities verified. Both stores' Staff reviewer fields match the replacement by private readback.
- The Staff Play reviewer-password change was sent separately and now shows **Changes in review**. This does not
  undo the already published production binary. Apple reviewer access was updated without withdrawing the submission.
