# HexaTech Loyalty (the members' app, Android and iOS)

**Public release update (12 November 2026):** Android **2.1.0 (31)** is published and **Available on Google Play**.
iOS **2.1.0 (25)** is **Waiting for Review**, with the owner's newer `loyalty2.mp4` recording and updated review
notes. Apple is configured to publish after approval. Countries are preserved. See the
[current handoff](../../docs/handoff/2026-11-12-member-public-release.md) and
[release record](../../docs/loyalty-member-app/07-PUBLIC-RELEASE-20261112.md), including the device-video limits.
Earlier internal-only statements below record historical build tasks.

**Calendar/platform follow-up (12 November 2026):** Events stays in the dock without upcoming events/history. Device-lock, notification/sign-out races, account-switch safety and input accessibility fixes pass TypeScript, **101 tests and 284 browser checks**. **iOS 2.1.0 (25) is available in TestFlight Internal QA; Android 2.1.0 (31) is completed on Play internal testing**, from `90ab7db2b`. Actual packages, uploaded checksum/group status and testing notes are verified. Earlier 24/30 were superseded before tester delivery. [Current handoff](../../docs/handoff/2026-11-12-member-platform-review.md) and [review](../../docs/loyalty-member-app/06-PLATFORM-REVIEW-20261112.md). Physical-device acceptance and public release remain separate.

**Latest design testing delivery (12 November 2026):** signed **iOS 2.1.0 (23)** is available in TestFlight Internal QA, and **Android 2.1.0 (29)** is completed on Play internal testing. Both packages include the new luxury UI and were inspected; testing notes and store readbacks are verified. See `docs/handoff/2026-11-12-member-design-builds.md`. These replace the earlier testing binaries for design QA; public review/release still requires device acceptance and current store media/privacy checks.

**Luxury design implementation (11 November 2026):** the approved Figma screens now have native source: icon-only dock, contextual popups, direct event registration, reward confirmation/code in one popup, consolidated Preferences and confirmed points/check-in/stamp feedback. See `docs/loyalty-member-app/05-NATIVE-DESIGN-20261111.md` for exact scope and verification. Existing iOS 22 / Android 28 testing binaries **predate this design**; a fresh signed build and device QA are required before release.

**2.1.0 update (11 November 2026):** this release focuses on loyalty and enabled event registration. Appointment/accommodation routes redirect; their source below is deferred/historical. New features include programme/access details, assigned membership dates/benefits, authenticated private vouchers and safer account/reward flows. `docs/loyalty-member-app/03-LOYALTY-REFRESH-20261111.md` records checks and release requirements. New native FileSystem/Sharing modules require a fresh signed binary; source/export validation does not install the update on phones.

The membership in the member's pocket: the card and its QR code for the desk, points and the way to the next tier,
benefits, rewards and offers, the history, messages from the venue. Each venue's own colours and heading face.
Decisions and phases: `docs/loyalty-member-app/00-PLAN.md`.

It replaces the old Hotel Loyalty app (`vkolotikov/hotel-tech-loyalty-mobile`) **under the same store listing**, so
members get it as an ordinary update and stay signed in.

| | |
|---|---|
| Name | HexaTech Loyalty (owner 2026-10-31) |
| Bundle id / package | `com.hotelloyalty.app` (unchanged) |
| App Store Connect | app 6765608479, team HNWSAQ5CQ9 |
| EAS | project `865bfb65-5e82-4b4d-b3b4-dc55e9b9ef17`, owner `hoteltechai`, slug `hotel-loyalty` (unchanged) |
| Version | `2.1.0` (the old app is 1.2.0); build numbers continue from EAS (`appVersionSource: remote`) |
| Link scheme | `hotel-loyalty://` (unchanged), e.g. `hotel-loyalty://join?org=<venue token>` |
| Server | `https://app.hexa-tech.uk/api` (the old app used `loyalty.hotel-tech.ai`, the same backend: sessions stay valid) |

Expo SDK 58 (React Native 0.88, React 19), Expo Router, TanStack Query, Zustand, i18next, `react-native-svg`.

## Shared with the member portal

The app does not copy the portal; it reads it. `src/lib/i18n/portalBundles.ts` loads the portal's own words
(`frontend/src/portal/i18n/*.json`, five languages) and `src/shared/portal.ts` its framework-free logic and types (money,
dates, plurals, the card's progress and membership phrases, offers' values, the inbox, help's questions, message
switches, events, stamps, the industry's nouns). A sentence or rule fixed in the portal is fixed in the app
at its next build. Only modules with no React, web client or browser API may be imported there.

`metro.config.js` watches the portal folder and resolves a package a shared file imports (`i18next`) from this app's
own `node_modules`, as `vitest.config.ts` does, so there is one i18next instance. EAS uploads the whole repository, so
the portal files are there on the build machine.

The app's own words (`member.*`: sign-in, join by QR, lock, updates, push) are `src/lib/i18n/{en,ru,de,fr,es}.ts`, formal
in every language as the portal is (usted, Sie, vous, вы); `lib.test.ts` checks the keys and placeholders match.

## Layout

| Path | What |
|---|---|
| `src/app/` | Screens (Expo Router). `(tabs)/`: Home, Rewards (benefits, catalogue, offers, codes), central Card, enabled/historical Events, More. `activity` is the balance popup/full history; `programme` is a long sheet. `profile` has on-demand password/delete controls; `preferences` owns language/device/message settings. `inbox`, `help`, `sign-in` and `join` remain. Appointment/accommodation routes redirect to Home. |
| `src/components/book/` | The appointment flow's steps (service, who, when, review with coupons, pay), on the portal's `steps.ts`; `stay.tsx`, the stay flow's (dates on a month grid, rooms and combinations, review, pay), on its `staySteps.ts` |
| `src/lib/calendar.ts` | The stay dates picker's month grid and taps (the portal uses the browser's own date inputs) |
| `src/lib/payment.ts` | Stripe's payment sheet for the one intent the server made (`payment.web.ts`: none in the browser preview) |
| `src/components/` | `ui.tsx` (building blocks, `Toggle`, `Picture`), `Bookings` (rows, Home's next booking), `MemberCard`, `ActivityRow`, `Programme` (stamps, credit, next event), `TabBar`, `Sheet`, `UpdateGate` |
| `src/lib/theme.ts` | Navy, text and states fixed; the accent and heading face are the venue's (`useLook`) |
| `src/lib/api.ts` | The one HTTP client: `/v1/member/*`, `/v1/auth/*`, `/v1/public/join/*`, bearer token, 15 s timeout |
| `src/lib/session.ts` | Sign-in, join, sign-out; the old app's keys `auth_token`/`auth_user`, so members stay signed in |
| `src/lib/queries.ts` | The portal bootstrap (`GET /v1/member/portal`) and the venue's look, kept for the next start |

## Rules

- The app decides nothing: every number, tier, phrase and refusal is the server's or the portal's shared logic.
  A new feature uses an existing `/v1/member/…` endpoint, or a server change first.
- The venue's accent is read through `C.gold`/`accentGradient()`/`fonts.*` at render time, never inside
  `StyleSheet.create` (which reads once); the root redraws the screens when the look changes.
- Every string is the portal's (`tp('portal.…')`) or the app's (`t('…')`) in all five languages, with every
  placeholder the portal passes (`{{venue}}`, `{{noun}}`, `{{phone}}`): a portal phrase is called with the same values
  as the portal page calls it.
- Booking and paying follow the member-portal money rules unchanged: every decision is the portal's `steps.ts`
  (`bookReducer`, `afterConfirmError`, `canLeavePay`, …) and every sentence its `bookErrors.ts`; a failed call is read
  with `serverCodeOf()` (the server's own code, or null, as the portal's `apiErrorCode`). The card is taken only by
  Stripe's payment sheet for the payment intent the server made; the app sends the visit's Idempotency-Key and the
  intent's id, never an amount. While a card is held against a booking not yet confirmed the sheet cannot be closed.
  Apple Pay and Google Pay are off until the owner's merchant id is set (`app.json`, the Stripe plugin).
- A member's figures are never trusted from the first load (`src/lib/queries.ts`): React Query learns the app's
  foreground from AppState (`focusManager`), the venue's facts are fresh for 10 s (`LIVE_MS`), each tab asks its stale
  queries again when shown (`useRefreshOnFocus`), Home asks again every 30 s while shown (`useLiveWhileShown`, also
  where push does not reach), and a push or a pull to refresh reads every member fact again (`refreshMemberFacts`).
  A query that makes a hold or a payment intent says `refetchOnWindowFocus: false` itself.
- A stored picture goes through `Picture` (`mediaUrl()`: `/storage/…` beside the API), which shows nothing rather than
  an empty frame when it cannot load.

## Run

```bash
npm install
npm run typecheck && npm test
npx expo start                 # a development build (expo-dev-client), not Expo Go
```

Browser preview against a local API (no camera, push or wallet):
`EXPO_PUBLIC_API_URL=http://127.0.0.1:8000/api npx expo export --platform web --clear`, served with a fallback to
`index.html`. In the cloud container prefix Expo commands with `EXPO_OFFLINE=1`.

## Build and release

The store release, step by step (accounts, credentials, listing texts in `store/listing.json`, screenshots in
`store/screenshots/`, privacy answers, review notes): `docs/loyalty-member-app/02-RELEASE.md`.

Needs the `hoteltechai` Expo sign-in (or an `EXPO_TOKEN` secret).

```bash
npx eas-cli build --profile development --platform ios
npx eas-cli build --profile production --platform all
npx eas-cli submit --profile production --platform ios       # ASC app 6765608479
npx eas-cli submit --profile production --platform android   # Play internal track
```

Before the first release of 2.0.0:

1. **Stop the old app's over-the-air updates.** `vkolotikov/hotel-tech-loyalty-mobile` publishes an EAS update on every
   push to its `main` (`.github/workflows/release.yml`). Disable that workflow so the old 1.x installs get nothing new;
   this app has no `expo-updates` at all.
2. **Push:** the Apple push key is already on the `hoteltechai` account (shared with Hotel Staff). Android needs both
   the Firebase Android app configuration for **`com.hotelloyalty.app`** and an FCM V1 service-account key on EAS.
   Keep `google-services.json` outside git and upload it as this project's production **file** environment variable
   `GOOGLE_SERVICES_JSON` (secret visibility). `app.config.js` reads its path into `android.googleServicesFile`.
   Upload the separate service-account key through `npx -y eas-cli@latest credentials -p android` → production →
   Google Service Account → FCM V1. Full setup and local verification: the release runbook's Android push section.
3. **Store texts** in five languages under the new name; the listing, its reviews and its members stay.
4. **Minimum version:** the server answers `GET /api/v1/apps/member/version` (`MEMBER_APP_*` in Laravel Cloud). Version
   1.x never asks, so the gate only matters from 2.0 on.

## Acceptance on phones (2.1.0)

Use `store/testflight-2.1.0.txt` for this release's testing instructions. Test Android and both supported Apple device families (iPhone/iPad) with isolated member data:

1. Upgrade from the installed members app; sign in/out, join using a venue link/QR, verify the desk can scan the member card.
2. Membership start/end and assigned benefits, including a venue with points disabled; programme/access details use the venue's current decisions.
3. Redeem after confirming once; open codes, offer terms and authenticated PDF/image vouchers from Offers and Inbox. Save/share/cancel on the actual OS sheet.
4. Register/cancel an enabled event; check full/cancelled/refused states and attended history. Disabled events expose no registration action.
5. Profile/birthday save and refresh, message switches, account change, password and deletion; all five languages, offline recovery and device lock.
6. Where configured, receive a push and open Inbox; verify Apple/Google Wallet on the corresponding physical device.
7. Appointment/accommodation entry points and legacy booking links return to loyalty Home.

Record the tested device/OS and results. Current native screenshots, optional birthday privacy declarations and a members-app physical walkthrough are required before public review. Browser fixtures and the Staff recording do not supply those checks.

The phase lists below document earlier releases and include deferred booking scope.

## Historical acceptance on phones (phase 1)

1. Install over the old Hotel Loyalty app: still signed in, the venue's colours on the first screen after one load.
2. Sign out and in; a staff account's email and password are refused here. A staff session saved by the old app
   returns to sign-in with the member-account explanation, without revoking the staff token. A legacy session without
   a saved account type gets the same recovery when the portal answers `member_only`.
3. Join a venue by scanning its sign-up QR code, and by pasting its link: the welcome points arrive.
4. Card: the QR code reads at the desk (HexaTech Staff scans it); Add to Apple Wallet / Google Wallet.
5. Home: progress to the next tier in the programme's measure; membership end date where there is one.
6. Five languages; Airplane mode shows "No connection"; the lock; notifications switch.

## Historical acceptance on phones (phase 3)

1. Book an appointment at a venue that takes cards: service, person, time, review (member price, a coupon), pay with
   the payment sheet (a test card; one that asks for 3-D Secure too); the booking opens with "You're booked".
2. Close the payment sheet without paying: nothing is taken, Pay is offered again; a declined card says so.
3. Take a time someone else has just booked: back to the times, with the sentence why.
4. Cancel a paid booking inside its window: the money promise before, the refund after; a held card is released.
5. A venue that takes no cards: "Nothing to pay now", Confirm, the booking says "Pay at the venue".
6. Book a stay at a hotel: arrival and departure on the month grid (a too-short stay says the venue's minimum), the
   rooms free with the member's total and a night's price, a party no room sleeps offered rooms together, review
   (add-ons, requests, a coupon, "to reserve on your card at the next step"), pay with the sheet; the stay opens with
   "You're booked". Let the hold lapse on Pay: back to Review for a fresh price, nothing taken.

## Historical acceptance on phones (phase 2)

1. Rewards: a benefit request is sent and cancelled; a reward is redeemed (its code under My codes, the points gone);
   an offer is claimed; a reward the member cannot afford says how many points are missing.
2. Home: the stamp card, the credit balance and the next event, each only where the venue has it.
3. Inbox: a message opens and is marked read; "Mark all as read"; the More tab's badge follows.
4. Events: sign up and cancel; a refusal says why (the server's reason).
5. Profile: name and phone saved; each message switch saved on its own; the invite link shared from the phone;
   password changed; delete account asks for the password and signs out.
6. Help: the questions search in each language; an answer's link opens the app's own screen.
