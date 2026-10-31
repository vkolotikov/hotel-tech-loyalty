# HexaTech Loyalty (the members' app, Android and iOS)

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
| Version | `2.0.0` (the old app is 1.2.0); build numbers continue from EAS (`appVersionSource: remote`) |
| Link scheme | `hotel-loyalty://` (unchanged), e.g. `hotel-loyalty://join?org=<venue token>` |
| Server | `https://app.hexa-tech.uk/api` (the old app used `loyalty.hotel-tech.ai`, the same backend: sessions stay valid) |

Expo SDK 58 (React Native 0.88, React 19), Expo Router, TanStack Query, Zustand, i18next, `react-native-svg`.

## Shared with the member portal

The app does not copy the portal; it reads it. `src/lib/i18n/portalBundles.ts` loads the portal's own words
(`frontend/src/portal/i18n/*.json`, five languages) and `src/shared/portal.ts` its framework-free logic and types (money,
dates, plurals, the card's progress and membership phrases). A sentence or rule fixed in the portal is fixed in the app
at its next build. Only modules with no React, web client or browser API may be imported there.

`metro.config.js` watches the portal folder and resolves a package a shared file imports (`i18next`) from this app's
own `node_modules`, as `vitest.config.ts` does, so there is one i18next instance. EAS uploads the whole repository, so
the portal files are there on the build machine.

The app's own words (`member.*`: sign-in, join by QR, lock, updates, push) are `src/lib/i18n/{en,ru,de,fr,es}.ts`, formal
in every language as the portal is (usted, Sie, vous, вы); `lib.test.ts` checks the keys and placeholders match.

## Layout

| Path | What |
|---|---|
| `src/app/` | Screens (Expo Router). `(tabs)/`: Home, Rewards, Card (raised), Activity, More. `sign-in`, `join` |
| `src/components/` | `ui.tsx` (building blocks), `MemberCard`, `ActivityRow`, `TabBar`, `Sheet`, `UpdateGate` |
| `src/lib/theme.ts` | Navy, text and states fixed; the accent and heading face are the venue's (`useLook`) |
| `src/lib/api.ts` | The one HTTP client: `/v1/member/*`, `/v1/auth/*`, `/v1/public/join/*`, bearer token, 15 s timeout |
| `src/lib/session.ts` | Sign-in, join, sign-out; the old app's keys `auth_token`/`auth_user`, so members stay signed in |
| `src/lib/queries.ts` | The portal bootstrap (`GET /v1/member/portal`) and the venue's look, kept for the next start |

## Rules

- The app decides nothing: every number, tier, phrase and refusal is the server's or the portal's shared logic.
  A new feature uses an existing `/v1/member/…` endpoint, or a server change first.
- The venue's accent is read through `C.gold`/`accentGradient()`/`fonts.*` at render time, never inside
  `StyleSheet.create` (which reads once); the root redraws the screens when the look changes.
- Every string is the portal's (`tp('portal.…')`) or the app's (`t('…')`) in all five languages.

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
2. **Push:** the Apple push key is already on the `hoteltechai` account (shared with Hotel Staff). Android needs FCM V1:
   upload a Firebase service-account key for `com.hotelloyalty.app` with `npx eas-cli credentials`.
3. **Store texts** in five languages under the new name; the listing, its reviews and its members stay.
4. **Minimum version:** the server answers `GET /api/v1/apps/member/version` (`MEMBER_APP_*` in Laravel Cloud). Version
   1.x never asks, so the gate only matters from 2.0 on.

## Acceptance on phones (phase 1)

1. Install over the old Hotel Loyalty app: still signed in, the venue's colours on the first screen after one load.
2. Sign out and in; a staff account's email and password are refused here.
3. Join a venue by scanning its sign-up QR code, and by pasting its link: the welcome points arrive.
4. Card: the QR code reads at the desk (HexaTech Staff scans it); Add to Apple Wallet / Google Wallet.
5. Home: progress to the next tier in the programme's measure; membership end date where there is one.
6. Five languages; Airplane mode shows "No connection"; the lock; notifications switch.
