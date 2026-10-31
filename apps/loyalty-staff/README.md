# HexaTech Staff (Android and iOS)

The loyalty desk on a phone: scan a member by NFC card, QR code or typed number, see their card, benefits and
points, give or use points, check in a visit, link a card, and answer requests. Decisions and status:
`docs/loyalty-staff-app/00-PLAN.md`.

Expo SDK 58 (React Native 0.88, React 19), Expo Router, TanStack Query, Zustand, `react-native-nfc-manager`,
`expo-camera`.

## Layout

| Path | What |
|---|---|
| `src/app/` | Screens (Expo Router). `(tabs)/`: Home, Members, Scan, Requests, More. Sheets: `scanned`, `points`, `check-in`, `link-card`. `member/[id]`, `sign-in` |
| `src/components/` | `ui.tsx` (the building blocks), `MemberCard`, `VerdictBanner`, `MemberActions`, `BenefitList`, `TabBar`, `Sheet`, `Done` |
| `src/lib/theme.ts` | Colours, gradients, fonts, spacing. Every colour and type style comes from here |
| `src/lib/api.ts` | The one HTTP client: `/v1/admin/loyalty/*` with `brand_id=all`, bearer token, 15 s timeout, one retry for reads |
| `src/lib/desk.ts` | Pure desk rules (code clean-up, scan keys, points limits, error words), tested in `lib.test.ts` |
| `src/lib/nfc.ts` | Card reading (Android continuous reader mode; iPhone system sheet). `nfc.web.ts` is the web stub |
| `src/lib/i18n/` | `en.ts` is the master; `ru`, `de`, `fr`, `es` (usted) must have the same keys and placeholders |

## Rules

- The app decides nothing about loyalty. Rights come from the bootstrap's `staff.can`, results and refusals from the
  server. A new action is an existing `/v1/admin/loyalty/…` endpoint, or a server change first (with its `AccessMap`
  key and tests, per the repository's `CLAUDE.md`).
- Every write sends an `idempotency_key` from `freshKey()`, kept while the attempt is unanswered (see `desk.ts`).
- Every string is `t('…')` with the key in all five bundles. The parity test fails otherwise.
- Colours and fonts only from `theme.ts`. Venue times and days through `format.ts` (never a bare `new Date(day)`).

## Run

```bash
npm install
npm run typecheck && npm test        # TypeScript and unit tests
npx expo start                       # Metro; open in a development build (NFC and camera need one, not Expo Go)
```

The web preview, for looking at screens against a local API (no NFC or camera in a browser):

```bash
EXPO_PUBLIC_API_URL=http://127.0.0.1:8000/api EXPO_PUBLIC_WEB_URL=http://localhost:5173 npx expo export --platform web
# serve dist/ with every unknown path answered by index.html; the API needs CORS_ALLOWED_ORIGINS to include it
```

In a cloud container where `api.expo.dev` is blocked, prefix Expo commands with `EXPO_OFFLINE=1`
(`EXPO_OFFLINE=1 npx expo install <package>` uses the SDK's bundled version list).

## Build and release (EAS)

Needs the owner's Expo account, or an `EXPO_TOKEN` secret in the environment (never in chat or in the repository).

```bash
npx eas-cli build --profile development --platform android   # APK with the dev client, for testing on a phone
npx eas-cli build --profile development --platform ios       # register the iPhone first: npx eas-cli device:create
npx eas-cli build --profile preview --platform android       # stand-alone test APK against production
npx eas-cli build --profile production --platform all        # store builds (version numbers kept by EAS)
npx eas-cli submit --profile production --platform ios       # App Store Connect, team HNWSAQ5CQ9
npx eas-cli submit --profile production --platform android   # Play, internal track
```

The production server is set in `eas.json` (`EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WEB_URL`). iOS NFC needs the
"NFC Tag Reading" capability on the App ID; EAS turns it on from the config plugin when it manages the credentials.

## Request alerts (push)

The app registers the phone with the server after sign-in and on every start (`src/lib/push.ts`, `PUT
/v1/admin/loyalty/devices`), removes it before signing out, and opens Requests when an alert is tapped. More has the
switch. The server side is `StaffAlerts` (`docs/loyalty-workspace.md` "Request alerts on staff phones").

Push needs three things set up once, all in the owner's accounts:

1. **The EAS project id.** The first `npx eas-cli init` (or the first build) writes `extra.eas.projectId` into
   `app.json`; commit it. Without it the app shows "Alerts work in the installed app on a phone" and sends nothing.
2. **iPhone:** an Apple Push Notifications key. `npx eas-cli credentials` → iOS → "Push Notifications: Manage your
   Apple Push Notifications Key" (or answer yes when the first iOS build asks).
3. **Android:** Firebase Cloud Messaging (FCM V1). Create or reuse a Firebase project with an Android app for
   `uk.hexatech.loyalty.staff`, then upload its service account key with `npx eas-cli credentials` → Android →
   "Google Service Account" → "FCM V1". (A `google-services.json` is not needed for Expo's push service.)

## Acceptance on phones

1. Sign in, close the app, reopen it: still signed in. Turn the lock on, leave for two minutes, return: Face ID or
   fingerprint asked.
2. NFC on Android: hold several cards in turn on the Scan tab without pressing anything. On iPhone: press "Tap a
   card", hold the card near the top of the phone.
3. QR: a member's app code in daylight and in a dim room, and from a printed card.
4. Typed: a member number with and without dashes, a name, an email.
5. At a place for some tiers only: one member let in, one refused, with the reason.
6. Give 50 points and use 20: the member's app shows both, with the reasons.
7. Check in with an amount (desk earn on) and without; a second check-in the same day answers "Already checked in
   today" and adds nothing.
8. Link a new card to a member, then scan it; scan a card that belongs to someone else (refused).
9. Approve, decline (the member reads the reason) and mark a request as given; hand over a claimed reward.
10. Switch to each of the five languages; in Airplane mode a screen says "No connection" and offers Retry.
11. Request alerts: allow notifications at first start; from the member app ask for a benefit and claim a reward —
    a phone signed in as a manager hears both, a desk account without "redeem points" only the benefit; tap one and
    Requests opens. Switch alerts off in More (nothing arrives), sign out (nothing arrives), sign in again.
