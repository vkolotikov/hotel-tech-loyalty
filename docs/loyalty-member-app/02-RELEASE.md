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
2. **The old app's release workflow is retired** (done 2026-10-31, `vkolotikov/hotel-tech-loyalty-mobile` commit
   `2ac9a17`): `.github/workflows/release.yml` (an over-the-air update on every push to `main`, binaries on every `v*`
   tag, against the same Expo project and listing) is deleted, and that repository's `CLAUDE.md` says the app moved
   here. No run started from that push. What is left there is the repository's `EXPO_TOKEN` Actions secret, which no
   workflow uses any more; delete it in Settings → Secrets and variables → Actions when convenient.
3. **Credentials are already on EAS** for project `865bfb65-5e82-4b4d-b3b4-dc55e9b9ef17` (the old app's): the iOS
   distribution certificate and profile, the Apple push key, and the Android upload keystore. The new app uses the same
   project, so a build reuses them. Play only accepts an update signed with the same upload key; EAS's stored keystore is
   that key. Check once: `npx eas-cli credentials` (Android → production keystore: the SHA-1 matches the upload key shown
   in Play Console → App integrity).
4. **Android push:** configure both the Firebase Android file and the FCM V1 credential below. Without the file the
   app cannot register with FCM; without the service-account credential EAS cannot deliver Android notifications.
5. **App Store Connect API key for submitting:** `npx eas-cli credentials` → iOS → App Store Connect API Key (once),
   or answer the prompt on the first `eas submit`.

### Android push configuration

Use Firebase project **`hotel-loyalty-app-1414d`** (Hotel-Loyalty APP), Android package **`com.hotelloyalty.app`**.
The existing registration `com.hoteltech.loyalty` is a different app; do not use its config or change/delete it.
Download the correct Android app's `google-services.json` from Project settings → General → Your apps. Keep the
file outside the repository, including any service-account JSON key. From `apps/loyalty-member`:

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

Separately, assign the same Firebase project's service-account key via `npx -y eas-cli@latest credentials -p android`
→ production → Google Service Account → FCM V1. That key is not `google-services.json` and is not the Play submission
credential. See [Expo's FCM setup](https://docs.expo.dev/push-notifications/fcm-credentials/).

Before building: `npx tsc --noEmit`, `npx vitest run`, `npx expo install --check`, then resolve the prebuild config
with the actual private Firebase file. Commit and push first. For this correction run **Android only**:
`npx -y eas-cli@latest build -p android --profile production --non-interactive`. Keep iOS build 19; no iOS rebuild is
needed. After installation, verify a real push reaches an Android phone and opens the inbox.

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
| Support | https://hexa-tech.uk/about-us (published HexaTech contact details) |

Screenshots: `store/screenshots/ios-6.9` (iPhone 6.9", 1320×2868), `ipad-13` (iPad 13", 2064×2752; the app supports
iPad), `play-phone` (1080×2160). They are the app's own screens rendered from its web preview against test data.

`store.config.js` reads the five-language source file and the English iPhone/iPad screenshots for EAS Metadata.
Run `npx -y eas-cli@latest metadata:push --non-interactive` from this app to update the editable Apple draft using
the existing EAS Apple credential. It selects version 2.0.0 and manual release; it does not submit for review.
Reviewer credentials stay in the console, not this config. The Android submit profile targets internal testing and
sets `changesNotSentForReview: true`; production rollout remains a separate owner decision.

### App Store: App Privacy

Data used to track you: **none** (no advertising or cross-app tracking). Data linked to the member, used for
**App Functionality**, with Stripe Product Interaction also used for **Analytics**:

| Category | Types | Why |
|---|---|---|
| Contact Info | Name, Email Address, Phone Number | The member's account and profile |
| Contact Info | Physical Address | Stripe PaymentSheet automatically collects billing-address fields required by the payment method |
| Identifiers | User ID | The membership number and account |
| Identifiers | Device ID | This phone's notification token, stored against the account to deliver requested notifications |
| Purchases | Purchase History | Bookings, redeemed rewards, points history |
| Financial Info | Payment Info | Cards entered in Stripe's payment sheet go straight to Stripe; HexaTech never sees the number |
| User Content | Other User Content | Notes and requests on a booking |
| Search History | Search History | Booking availability criteria can be retained in server error logs with the account ID |
| Usage Data | Product Interaction | Stripe payment-component usage for App Functionality and Analytics; may be linked to identity; not tracking |

Stripe's [mobile SDK privacy details](https://support.stripe.com/questions/stripe-mobile-sdk-privacy-details), checked
2026-11-02, explicitly include Product Interaction for analytics and fraud prevention. The current Stripe initialization
uses the SDK defaults, so do not declare that the app collects no analytics at all. The camera reads QR codes on the phone and stores nothing; Face
ID is the phone's own and the app never sees it. Neither is collected data. The privacy page doesn't mention either; one
sentence there would make that explicit.

### Google Play: Data safety

- Collected (not shared; Stripe acts as a service provider): Personal info (name, email address, phone number, address, user
  IDs), Financial info (purchase history, payment info via Stripe), App activity (other user-generated content: booking
  notes), Device or other IDs (the push token).
- Account name, email, phone and user ID are used for App functionality and Account management. Name, email and
  user ID are required; phone is optional. Other types support their named optional features and App functionality.
- Billing address and payment information are optional app features: they are collected only when a member chooses
  an online payment. The installed Stripe SDK defaults to automatic billing-field collection; keep the disclosure
  even though the HexaTech account form does not ask for an address.
- Include Stripe payment-component interactions under App activity / App interactions, with Analytics and fraud
  prevention purposes where applicable. Check the final disclosure against the current SDK and actual payment flow.
- Include App activity / In-app search history: booking availability criteria can be retained in server error logs.
  This is optional, linked to the account, and used for App functionality. The local help-text filter stays on-device.
- The previous listing declared Photos or Videos. Version 2.0 only scans QR codes on-device and has no image upload;
  remove that old declaration when publishing the new binary's privacy update.
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

## Build record

**2026-11-02** (from `feature/loyalty-member-app`, EAS as the `hoteltechai` robot user, Developer role):

- iPhone 2.0.0 build **19**: finished (`https://expo.dev/accounts/hoteltechai/projects/hotel-loyalty/builds/1cde298f-0590-470d-8f65-1d67f7ad934b`),
  signed with the existing distribution certificate and profile (both valid to 2027-05-01). **Uploaded to App Store
  Connect** the same day (`https://expo.dev/accounts/hoteltechai/projects/hotel-loyalty/submissions/f5a02565-d0a0-4d8a-8c70-56ccb54332cb`)
  with the App Store Connect API key `S7Y8H6Q477` ("[Expo] EAS Submit …", role Admin), which the owner generated in
  `eas credentials` and assigned to both apps; EAS's automatic TestFlight group was refused by Apple (403), so the
  internal testing group is made by hand in App Store Connect.
- Android 2.0.0 version code **24**: finished (`https://expo.dev/accounts/hoteltechai/projects/hotel-loyalty/builds/0e33845d-4327-48b6-aa5f-56368e1e1caf`),
  signed with the existing upload keystore. Not yet on Play: needs a Google service account key on EAS.
- Three things the first builds found, all fixed in `app.json` and checked by a local `expo prebuild` (build 18 and
  version codes 22 and 23 are the failed attempts):
  1. iOS `pod install`: stripe-react-native 0.81 fetches stripe-ios through Swift Package Manager, which needs
     dynamic frameworks. The Stripe plugin's own option `disableSPM: true` puts `$StripeDisableSPM = true` in the
     Podfile, so stripe-ios comes from CocoaPods and nothing else links differently. Stripe calls that path
     deprecated: a later stripe-react-native may need `useFrameworks: "dynamic"` (expo-build-properties) instead.
  2. Android lint: Stripe's compileOnly push-provisioning library lists Google's private Tap and Pay SDK as a
     runtime dependency, which lint tries to fetch. `plugins/withoutStripePushProvisioning.js` excludes
     `play-services-tapandpay` in `android/build.gradle`.
  3. Android R8: Stripe's code refers to the absent push-provisioning classes; the same plugin adds
     `-dontwarn com.stripe.android.pushProvisioning.**` to `android/app/proguard-rules.pro`. The app never adds a
     card to Google Wallet, so neither library is packaged either way.
- expo 58.0.22, expo-dev-client 58.0.18, expo-router 58.0.29, TypeScript ~6.0.3 (`expo install --check` clean).

**2026-11-02, workstation release continuation (Codex):**

- Verified all recorded builds finished. App Store Connect shows 2.0.0 (19) processed, in existing Internal QA;
  the owner's account shows it installed on an iPhone. No duplicate group or invitation was created for members.
- Apple's Free Apps Agreement and Digital Services Act status are Active. Paid Apps Agreement is Pending User Info
  (bank account/tax information); the owner handles those. The members' distribution draft still says `1.1.0.` and
  selects old build 3; it needs version 2.0.0, build 19, and the prepared store metadata before review.
- Firebase audit found `hotel-loyalty-app-1414d` held only old Android package `com.hoteltech.loyalty` plus a web app.
  Registered **com.hotelloyalty.app / HexaTech Loyalty** alongside them. FCM V1 API is enabled. Kept the old apps intact.
- Added `app.config.js`, ignored `google-services.json`, and made the production EAS environment explicit. Uploaded
  the correct Firebase config as project-scoped production **secret file** `GOOGLE_SERVICES_JSON`. Local prebuild
  config resolves the actual private file, correct package, version and EAS project. Files stay outside git under
  the workstation user's `HexaTech-release-private` directory.
- With the owner's explicit confirmation, generated the existing Firebase service account's private key and assigned
  it to **both current Expo projects for FCM V1**. EAS confirmed the assignment to `com.hotelloyalty.app`. This is not
  a Google Play submission credential; that remains unassigned.
- Checks: TypeScript passes; **34 tests pass**; `expo install --check` passes. Additional `expo lint` had no existing
  app configuration and auto-installed its preset, then failed its ESLint version detection. Direct ESLint with that
  temporary preset reported **27 errors / 16 warnings in unchanged app source** (React hooks and import checks).
  The auto-generated lint config and package changes were removed; no unrelated lint fixes were made. Config syntax,
  whitespace and ignored-file checks pass. This is not a clean full-app lint baseline.
- Play Console: the existing production listing is named **Hexa Loyalty**, package `com.hotelloyalty.app`, account
  FDS Cards ltd. New Android push-capable build and Play upload are still pending at this commit. No iOS rebuild,
  review submission, production rollout or Laravel Cloud deploy was performed.

**2026-11-02, Android build and store setup (Codex):**

- Source commit `ee46c0c34` pushed to `feature/loyalty-member-app`; staff-only copy `48770c8ba` pushed to its independent
  branch with exact staff-file parity. Main remains untouched.
- Android **2.0.0 / version code 25** finished successfully:
  `https://expo.dev/accounts/hoteltechai/projects/hotel-loyalty/builds/8038e20d-f716-4833-b37b-eed95ba04f39`.
  Downloaded `HexaTech-Loyalty-2.0.0-25.aab` to the workstation user's Downloads folder. The AAB contains the correct
  package, Firebase project, sender ID and `google_app_id` resource. No iOS rebuild was started.
- Owner approved a dedicated `hexatech-play-submit@hotel-loyalty-app-1414d.iam.gserviceaccount.com` identity and JSON key.
  Google Play Android Developer API is enabled. Play Console shows the account Active, with four app-scoped permissions
  on only `com.hotelloyalty.app` and `uk.hexatech.loyalty.staff`: app information, automatically included app quality,
  testing releases, and tester/track management. No production, finance or account-wide permissions were selected.
  EAS confirmed the Play submission key assignment to both apps. The key remains outside git.
- Updated the Apple draft to **2.0.0** and synced all five language texts with EAS Metadata, using the prepared source.
  English screenshots are uploading/processing at this checkpoint. Build selection and final console checks remain.
  Store config sets manual release and keeps reviewer credentials out of source.
- Scheduled members **internal testing** upload of version code 25 with `changesNotSentForReview: true`:
  `https://expo.dev/accounts/hoteltechai/projects/hotel-loyalty/submissions/50426361-d349-4594-9adb-e3e998941a5e`.
  Scheduling is confirmed; final Play upload outcome must still be checked.

**2026-11-02 completion, verified again 2026-11-03 (Codex):**

- The Play internal submission above succeeded; version code **25** was verified in Play Console on 2 November.
  On 3 November the Play API also returned its generated, signed APK for local emulator testing.
- Apple draft **2.0.0** selects valid build **19**. All five locales have descriptions. All **12** English screenshots
  (six iPhone, six iPad) are now **COMPLETE**, with no processing errors. The version remains **PREPARE_FOR_SUBMISSION**.
- Added credential-free review notes in `store/review-notes.txt`. The Apple review-information write was refused
  because contact fields were missing. The owner confirmed demo accounts still need preparation; no demo credentials
  were created or stored in source. App privacy and Play listing/data-safety completion remain outstanding.
- On 3 November the owner reported an iOS error immediately after member sign-in and nonworking menu screens.
  Investigation is in progress: the app's first member request is `GET /api/v1/member/portal`; unauthenticated live
  checks return 401 as expected. No root cause or correction has yet been verified. Keep this version out of review
  until the authenticated failure is reproduced, corrected and retested on iOS.

**2026-11-03, saved-session diagnosis and correction (Codex):**

- Production logs and a read-only account check identified an old iOS **staff** session restored from the original
  app's shared keychain. That account has no membership. The portal correctly returns `403 member_only`; the legacy
  points-history endpoint then fails on its missing member. Firebase is unrelated to this sign-in failure.
- The app now forgets an incompatible saved staff session, clears cached member data, and explains the required
  member account on sign-in in all five languages. Untyped legacy sessions recover on the portal's explicit
  `member_only` answer. Valid memberships stay signed in; a delayed old response cannot discard a newer session.
  No real account, membership, staff token or backend source was changed.
- Checks: **41 tests / 3 files pass**, TypeScript passes, touched-file ESLint passes, and Expo dependencies match
  SDK 58. Regression tests cover saved staff sessions, untyped legacy sessions, valid members, ordinary access
  refusals, stale responses, cache clearing and rejection of a staff login response.
- Owner authorized isolated demo accounts and testing. Demo venue **HexaTech App Review Demo** (organisation 49)
  was created with two tiers; a real public registration created its member. Credentials are private outside git.
  Authenticated member home, card, points history, benefits, rewards, offers, inbox, programme and bookings reads
  succeed. Booking catalogues correctly return `not_bookable` until demo inventory is configured.
- This bug requires new member binaries on both platforms; the earlier instruction to avoid an iOS rebuild applied
  to the Firebase-only change. Keep member review paused until the replacement iOS build is tested on a device.

- Fix source **505d8d659** pushed to `feature/loyalty-member-app`. Replacement production builds queued:
  Android **2.0.0 / 26**, `https://expo.dev/accounts/hoteltechai/projects/hotel-loyalty/builds/9cfb4b4c-1866-4f46-8368-3bd8375860a0`;
  iOS **2.0.0 (20)**, `https://expo.dev/accounts/hoteltechai/projects/hotel-loyalty/builds/002b73b1-8b73-4a1d-bb2e-3ea0d2d1f159`.
  Both were still **IN_PROGRESS** when checked on 3 November; no replacement submission yet at this checkpoint.
- Apple review contact, demo member sign-in and accurate demo notes are now saved and verified by presence checks.
  The isolated demo has sample points, a reward and a requestable benefit. The staff release guide records the
  completed live workflow checks. Native device acceptance remains separate from API and automated regression tests.

**2026-11-03, replacement build delivery (Codex):**

- Both replacement builds above are now **FINISHED**. iOS submission
  `https://expo.dev/accounts/hoteltechai/projects/hotel-loyalty/submissions/168bb90a-d569-42ca-b23a-14da322be01f`
  and Android submission
  `https://expo.dev/accounts/hoteltechai/projects/hotel-loyalty/submissions/ae6e8a43-1735-4691-a2ec-664e106265c9`
  both report **FINISHED** through EAS's submission query.
- Apple build **20** is **VALID**, selected on the 2.0.0 draft, and assigned to existing **Internal QA**
  (`5efab3f1-3e12-4793-a462-2d7e0367c73a`), with internal state **IN_BETA_TESTING**. No public member review was submitted.
- Play generated the signed APK for **26**. It was installed over 25 on the Pixel 8 API 35 emulator;
  package inspection confirms `versionName=2.0.0`, `versionCode=26`. Authenticated native UI testing is still pending.
- Updated source reviewer notes to reflect the actual demo: membership, points, reward and benefit request;
  no bookable demo inventory or real purchases. Credentials remain outside git and in the stores' private review fields.

**2026-11-03, submission audit and testing access (Codex):**

- Rechecked the delivered binaries and the saved-session correction: **41 regression tests pass** and all **25
  authenticated API reads pass**, including refusal of a staff session. The final store-text change also passes
  all six existing store-limit tests. This is not a native iPhone acceptance result.
- Android internal testing: `https://play.google.com/apps/internaltest/4701572602064076698`. The Pixel 8 has
  version 26 installed, but Play automatic protection refuses a sideload. The owner must join the internal test
  with the emulator's signed-in Google account and install through Play before native menu testing can continue.
  Chrome's initial sign-in/Terms step is reserved for the owner. Do not bypass Play protection.
- iPhone: use the existing TestFlight invitation and select **HexaTech Loyalty 2.0.0 (20)**. Internal QA contains
  two testers, one installed and one invited; build 20 is unexpired and IN_BETA_TESTING. There is no public
  TestFlight join URL. A Windows Android emulator cannot verify iOS keychain migration or physical iPhone behaviour.
- Play listing now uses **HexaTech Loyalty**, all five source-language texts, the current 512px icon, a new
  1024x500 feature graphic and six actual app captures. Removed obsolete phone/tablet imagery. Icon/feature
  artwork is labelled AI-assisted; screenshots are not. Source assets/provenance live in `store/play/`.
  API readback confirms exact title, short-description and full-description parity for all five locales,
  with one icon, one feature graphic and six phone screenshots. Changes are saved in Publishing overview,
  not submitted for public review.
- Backed up the existing Play Data safety form outside git: it previously answered **no data collected**.
  Replaced it with the audited **11 data types** above; all handling rows validate as complete. Saved the form
  for review and updated the privacy URL to `https://app.hexa-tech.uk/privacy`. Both privacy and deletion pages
  return HTTP 200 and contain the expected policy/request content. The public text still uses the older app
  names and needs a technical-disclosure/branding refresh before final release approval.
- Play Advertising ID is **No**, matching the actual version 26 APK manifest (no AD_ID permission). Existing
  target audience is **18 and over**, with Google's optional minor-user block unselected; left unchanged.
  Existing Play reviewer-access entry is older and still needs the isolated member demo sign-in.
- Apple age-rating answers were completed for the two new social-media fields (both false). Reviewer contact,
  demo access and build 20 selection were verified. Updating first-release What's New is refused by Apple in
  this version state; the five source texts now accurately distinguish valid member sessions from old staff sessions.
- **Credential replacement pending owner:** an Apple inspection helper logged authentication context while
  inspecting pricing. Its output is now explicitly allowlisted. Apple API operations are paused until the owner
  replaces that key, both current EAS assignments are updated, and the old key is revoked. No secret is in git;
  the private incident follow-up is in the workstation's `HexaTech-release-private` directory.
- Staff remains in review on both stores. No new native builds or member production rollout was performed during
  this audit. The later public-policy source-patch deployment is recorded below.

**2026-11-03, public policy and deletion refresh (Codex):**

- Separate source-patch deployment **d9117b475** (source **2f0158565**) updates the public privacy/deletion pages
  for both current app names, Stripe billing-address/payment-component handling, Expo/APNs/FCM, local QR scanning,
  the member More → Profile → Delete account route and partial-data requests. Verified the new content live.
  Existing retention and legal-basis commitments were preserved.
- Included explicit `.tsx` account-page imports to resolve the Windows build ambiguity. TypeScript, all 5,827
  frontend tests, scoped Support/Landing/API-authentication PHP suites and production build passed on the deploy
  artifact. No native source or migration was deployed. Main was updated only through the source-patch worktree.
- Play member reviewer-access replacement is prepared, with accurate demo limitations and no purchase required;
  owner password entry followed by Add and Save remains pending. No final member store submission yet.
- All eleven Apple data categories are now fully configured and saved, no Set Up warnings: linked to accounts,
  App Functionality, no tracking; Product Interaction also Analytics. The final legal Publish confirmation is
  open for the owner. Do not describe the revised privacy label as published until the owner completes it.
- Member Play production **26 (2.0.0)** now uses the library bundle and five localized notes from
  `store/play/release-notes.txt` (288–317 characters each). Preview validates **Ready to release**, no lost device
  support; saved to Publishing overview, which explicitly requires a separate Send for review action. It has
  not been submitted. Keep it staged until native acceptance and reviewer-access password entry are complete.

**2026-11-03, owner confirmations and security follow-up (Codex):**

- Owner completed member Play reviewer access and published Apple's eleven-type privacy declaration. Apple UI
  confirms Published, with all types complete, linked to accounts, no tracking; Product Interaction also Analytics.
- Owner then explicitly authorized equivalent Apple API-key replacement through the browser. The replacement was
  assigned to both existing Expo projects and verified before the old exposed key was revoked. Apple UI confirms
  revocation. No key material was committed or printed by the replacement helpers; use scalar-only API output.
- CUA emulator text entry pasted an unexpected Android clipboard value into Google search, potentially the shared
  demo password. Owner was informed and explicitly authorized replacement and direct configuration of both isolated
  demo sign-ins in Apple, Google Play and the emulator. This overrides the earlier owner-only demo-password entry
  restriction. Both passwords were changed independently, other demo sessions revoked, old passwords rejected and
  new identities verified. Both apps' Apple and saved Play reviewer passwords match the new values by private readback.
- Staff's Play credential update was separately submitted for review. Member's remains saved with the staged release.
  Apple member is still PREPARE_FOR_SUBMISSION, manual release, selected build 20 VALID, reviewer credentials verified.
- Internal Android enrollment is confirmed for the emulator's Google account. Play Console shows active 2.0.0
  Available to internal testers, with the expected selected tester list; API track readback names version 26.
  The first Play install nevertheless delivered public version 20 / 1.1.0, verified by package inspection. Do not
  count tests against that installed version as acceptance of the correction. Native acceptance remains in progress.
- Do not use CUA typeText or paste inside the Android emulator. Use direct key events and verify the destination.
  All credentials remain in the private release directory and store review fields, never in git or chat.

**2026-11-03, Android native acceptance (Codex):**

- Play test enrollment propagated after the first public-version install. The listing then showed **Internal Beta**
  and Update. Installed through Play; package inspection confirms **versionCode 26, versionName 2.0.0,
  installerPackageName com.android.vending** on Pixel 8 API 35. Play protection was not disabled or bypassed.
- Signed in using the rotated isolated member account. **Home, Card, Rewards, Activity and More all render and
  navigate without “Something went wrong.”** Home shows the correct demo venue/member, card and points; Card renders
  the QR. Rewards Benefits, Catalogue, Offers empty state and My codes work. More opens Inbox, Profile and Help;
  Help expands answers and follows its Home link. Profile's password and guarded account-deletion form are accessible.
- A native demo redemption succeeded, reduced points **310 to 210**, and appeared in My codes and Activity. Marking
  the demo inbox read updated More's unread state. Cancelled the isolated late-checkout request and requested it
  again successfully, leaving a pending request for reviewers. No real booking, purchase or customer data was changed.
- Existing 41 regression tests and 25 authenticated reads passed earlier in this audit; no native source changed
  during these device checks. Physical iPhone/keychain migration, NFC, biometrics, push delivery and real payment
  acceptance are separate. Owner was asked to check **TestFlight 2.0.0 (20)** on the iPhone; that result is pending.

**2026-11-03, member Android production submission (Codex):**

- Following native acceptance and private readback of updated reviewer credentials, sent all **15 changes for
  review**: production 26 (2.0.0), five-language listing/images and the audited content declarations.
- Google's automatic quick checks completed successfully. Publishing overview explicitly confirms **Your changes
  are now in review**. **Managed publishing is off**, so approval can publish the requested full rollout. This is
  evidence of an accepted review submission, not yet of public 2.0.0 availability.
- Rechecked all **25 authenticated API reads** after the native writes. They pass, the staff session remains refused
  by the member portal, and Staff sees one pending demo benefit request. No new native binary or backend deployment
  was required by this continuation. Apple's member release remains staged pending the physical iPhone result.

**2026-11-03, TestFlight access check (Codex):**

- Owner could not find build 20. API readback confirms it is VALID, unexpired, minimum iOS **16.4**, and
  **IN_BETA_TESTING**. Existing Internal QA includes build 20 and has access to all builds.
- App Store Connect's tester row explicitly shows **Installed 2.0.0 (20), Nov 3, 2026** for the owner's existing
  tester. The browser had been displaying **HexaTech Staff / build 2**; switched to **HexaTech Loyalty** and its
  Internal QA page. No tester was added or removed, and no invitation or new build was needed.
- Owner was directed to the member app in TestFlight. This confirms availability/installation telemetry only;
  the iPhone sign-in and five-menu acceptance result is still pending, so member iOS public review remains staged.
