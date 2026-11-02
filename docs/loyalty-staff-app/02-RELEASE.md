# HexaTech Staff 1.0 — release runbook

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

Paste from `store/listing.json` per language. Category **Business**; age rating 4+ / Everyone (no objectionable
content). Links: privacy https://app.hexa-tech.uk/privacy, terms https://app.hexa-tech.uk/terms, data deletion (Play)
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
| Purchases | Purchase History | An amount the staff member enters to award points for a purchase |

The camera reads QR codes on the phone and stores nothing; NFC reads a card's id only; Face ID is the phone's own.

### Google Play: Data safety

- Collected (not shared): Personal info (name, email address, user IDs), Financial info (purchase history: amounts
  entered for points), Device or other IDs (the push token for request alerts).
- For App functionality and Account management; all required for a staff account.
- Encrypted in transit: yes. Staff accounts are made and removed by the venue's administrator; deletion requests by
  the data-deletion page.

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

1. Submit 1.0.0 for review. App Store: request **unlisted distribution** with Apple's Unlisted App Distribution request
   form (it needs the app's App Store Connect id); once Apple grants it, the app is reachable only by its link. Play:
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
