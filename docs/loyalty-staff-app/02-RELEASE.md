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
   `npx eas-cli credentials` → Android → Google Service Account → FCM V1, with a Firebase Android app for
   `uk.hexatech.loyalty.staff`. App Store Connect API key for submitting: `npx eas-cli credentials` → iOS.
5. **Create the Play app:** Play Console → Create app "HexaTech Staff", app, free; the first upload fixes the package
   `uk.hexatech.loyalty.staff`. Play App Signing on (the default).
6. **Check the cards:** iPhones read NTAG, Ultralight and DESFire cards, not MIFARE Classic (Android reads all). Check
   the production cards before promising NFC on iPhone.

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
https://app.hexa-tech.uk/data-deletion, support: the owner's address or page.

Screenshots: `store/screenshots/ios-6.9` (1320×2868), `ipad-13` (2064×2752; the app supports iPad as a desk tablet),
`play-phone` (1080×2160), rendered from the app's web preview against test data.

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
