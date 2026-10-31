# HexaTech Loyalty 2.0 — release runbook

The members' app (`apps/loyalty-member`, branch `feature/loyalty-member-app`) ships as **version 2.0.0 of the existing
Hotel Loyalty listing**: App Store app `6765608479` (bundle `com.hotelloyalty.app`, team `HNWSAQ5CQ9`), Google Play
`com.hotelloyalty.app`. Store texts: `apps/loyalty-member/store/listing.json` (five languages, checked against every
store limit by `src/lib/store.test.ts`). Screenshots: `apps/loyalty-member/store/screenshots/`.

Prepared 2026-10-31. Release checks run in the cloud container: tsc, 34 tests, `expo install --check` clean,
`expo-doctor` 18/20 (the two checks that need the Expo API), a local `expo prebuild` read for permissions (camera and
Face ID texts only; no microphone; Android's unused permissions blocked).

## 0. Before the first build (owner)

1. **Let the build run.** From a computer signed in to Expo as `hoteltechai`, or from this cloud environment once its
   network allows `api.expo.dev`, `expo.dev` and `storage.googleapis.com` (EAS uploads the project there) and it has an
   `EXPO_TOKEN` secret for `hoteltechai` (environment settings, never the chat or the repository).
2. **Stop the old app's release workflow** in `vkolotikov/hotel-tech-loyalty-mobile` (`.github/workflows/release.yml`):
   it publishes an over-the-air update on every push to `main` and builds binaries on every `v*` tag, against the
   same Expo project and store listing. Remove its `push` trigger (keep `workflow_dispatch` if wanted) or delete the
   file, and remove the repository's `EXPO_TOKEN` Actions secret. The old 1.x apps keep running; they simply get no
   more updates.
3. **Credentials are already on EAS** for project `865bfb65-5e82-4b4d-b3b4-dc55e9b9ef17` (the old app's): the iOS
   distribution certificate and profile, the Apple push key, and the Android upload keystore. The new app uses the same
   project, so a build reuses them. Play only accepts an update signed with the same upload key; EAS's stored keystore is
   that key. Check once: `npx eas-cli credentials` (Android → production keystore: the SHA-1 matches the upload key shown
   in Play Console → App integrity).
4. **Android push (FCM V1):** `npx eas-cli credentials` → Android → Google Service Account → FCM V1, with the Firebase
   project of `com.hotelloyalty.app`. Without it Android phones get no notifications (iPhones use the Apple key).
5. **App Store Connect API key for submitting:** `npx eas-cli credentials` → iOS → App Store Connect API Key (once),
   or answer the prompt on the first `eas submit`.

## 1. Build and submit

```bash
cd apps/loyalty-member
npx eas-cli build --profile production --platform all     # version 2.0.0; build numbers continue on EAS (remote)
npx eas-cli submit --profile production --platform ios     # to App Store Connect → TestFlight
npx eas-cli submit --profile production --platform android # to Play, internal testing track
```

Build numbers come from EAS (`appVersionSource: remote`, `autoIncrement`), continuing the old app's counters, so the
Android version code is higher than every 1.x build, which Play requires.

## 2. Test on phones before review

TestFlight (iPhone) and Play internal testing (Android), with the acceptance lists in `apps/loyalty-member/README.md`
(phases 1 to 3). The ones only a phone can show:

- **Install over 1.x:** still signed in, the venue's colours after one load.
- **Payment sheet:** a real card at a venue in Stripe live mode, or a test card at a venue in Stripe test mode. Pay,
  close without paying, a declined card, and a card that asks for 3-D Secure.
- **A stay** at a hotel with its PMS connected (not possible in the cloud container).
- **Push:** an offer or points message reaches the phone, and tapping it opens the inbox.
- **Wallet:** Apple Wallet and Google Wallet buttons on the card.

## 3. Store listing

Paste from `store/listing.json` per language (App Store: name, subtitle, promotional text, keywords, description,
"What's New"; Play: title, short and full description). Keep the listing's existing category and age rating (no
objectionable content: 4+ / Everyone). Links:

| | |
|---|---|
| Privacy policy | https://app.hexa-tech.uk/privacy |
| Terms | https://app.hexa-tech.uk/terms |
| Data deletion (Play) | https://app.hexa-tech.uk/data-deletion |
| Support | the owner's support address or page |

Screenshots: `store/screenshots/ios-6.9` (iPhone 6.9", 1320×2868), `ipad-13` (iPad 13", 2064×2752; the app supports
iPad), `play-phone` (1080×2160). They are the app's own screens rendered from its web preview against test data.

### App Store: App Privacy

Data used to track you: **none** (no advertising or analytics SDK, no tracking). Data linked to the member, all used
for **App Functionality**:

| Category | Types | Why |
|---|---|---|
| Contact Info | Name, Email Address, Phone Number | The member's account and profile |
| Identifiers | User ID | The membership number and account |
| Purchases | Purchase History | Bookings, redeemed rewards, points history |
| Financial Info | Payment Info | Cards entered in Stripe's payment sheet go straight to Stripe; HexaTech never sees the number |
| User Content | Other User Content | Notes and requests on a booking |

Before answering, read Stripe's own "App privacy details" page for its iOS SDK and add any further type it lists
(Stripe collects some device data for fraud prevention). The camera reads QR codes on the phone and stores nothing; Face
ID is the phone's own and the app never sees it. Neither is collected data. The privacy page doesn't mention either; one
sentence there would make that explicit.

### Google Play: Data safety

- Collected (not shared; Stripe acts as a service provider): Personal info (name, email address, phone number, user
  IDs), Financial info (purchase history, payment info via Stripe), App activity (other user-generated content: booking
  notes), Device or other IDs (the push token).
- All for App functionality and Account management; name and email required, phone optional.
- Encrypted in transit: yes. Members can delete their account in the app (Profile → Delete account) and by the
  data-deletion page above.

### Review notes (App Store "App Review Information" and Play "App access")

The reviewer needs a member account at a venue (the app has no content without one). On production, in the full admin of
a demo organisation (or the owner's own venue): add a member with a password, give them some points, one reward they can
afford and an offer; take bookings at that venue **paid at the venue** (so the reviewer is never asked for a real card).
Then enter in the review notes, never in this repository:

```
Sign in with: <demo member email> / <demo member password>
The app is the membership card of a venue that uses HexaTech. Try: Card (QR code), Rewards (redeem a reward),
More → Bookings → Book (an appointment, paid at the venue), More → Profile → Delete account.
```

## 4. Release

1. Submit 2.0.0 for review (App Store) and promote the internal release to production (Play), staged if wanted.
2. Laravel Cloud needs nothing for 2.0.0: the version answer defaults to 2.0.0 and the existing store pages
   (`config/apps.php`). For a later release, raise `MEMBER_APP_LATEST_VERSION` (and `MEMBER_APP_MIN_VERSION` to make
   it compulsory), then redeploy.
3. Record the release (date, build numbers, submission ids) in `docs/loyalty-member-app/00-PLAN.md`.
