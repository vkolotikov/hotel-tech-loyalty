# HexaTech Loyalty Staff — native Android and iOS app: plan

Owner, 2026-10-31: "make also separate mobile android and ios app for loyalty, for loyalty software admin who could
scan membership cards by nfc, qr, manualy, see all benefits points etc. … use our existing app base or build
seperate one."

Status: **plan for the owner's decision; nothing built yet.** Earlier scope (handoff 2026-10-29): "mobile web + PC now,
native apps later" — this is that later step.

## What already exists

| Base | What it is | Fit for this app |
|---|---|---|
| **Loyalty mobile web** (`/loyalty` under 768 px, this repo, live since 2026-10-29) | Home / Members / Scan / Requests / More from the owner's 32 Figma phone frames (file `d6IGmk3hOoMw0V5rONbI1A`, report `docs/loyalty-redesign/22-MOBILE-WEB-REPORT.md`); five languages; every rule on the server (`/v1/admin/loyalty/*`) | The whole staff experience, already designed, tested and deployed. Missing only what a browser cannot do: NFC on iPhone, a native camera scanner, push notifications, a device lock |
| **Hotel Staff** Expo app (`vkolotikov/hotel-tech-loyalty-staff`, App Store 6764690635, Google Play, team HNWSAQ5CQ9) | A hotel operations app: bookings, guests, chat, planner, analytics and a loyalty tab. NFC (`react-native-nfc-manager`, iOS `TAG` entitlement) and camera scanning work in production | Proven native pieces (NFC, camera, secure sign-in, push, iOS crash defences, EAS and store set-up). But hotel-only, and its scans and points use the full admin's older endpoints (`/v1/admin/scan/qr`, `/scan/nfc`, `/points/*`), which bypass today's rules: tolerant codes, places and events at the door, visits, stamps, credit, idempotent retries |
| **Hotel Loyalty** Expo app (`vkolotikov/hotel-tech-loyalty-mobile`) | The members' app (points, rewards, bookings) | Same toolchain; not a staff app |

The GitHub copies of both Expo apps date from 2026-08-20. The Hotel Staff guide describes Expo SDK 55 while its
`package.json` says SDK 54, so the live build's source may be newer, on the workstation's `hotel-tech` monorepo.

## Recommendation: a separate app on our existing Expo base, showing the mobile web, native where it matters

Build **one new app, "HexaTech Loyalty Staff"** (working name), not an extension of Hotel Staff and not a full
native rebuild:

- **Same toolchain as the two existing apps** (Expo, React Native, EAS, the same Apple and Google accounts). Take
  Hotel Staff's proven native parts as the starting code: the NFC hook and its iOS entitlement settings, the camera
  scanner, secure storage, push registration and the iOS crash defences.
- **Every screen comes from the Loyalty mobile web**, shown inside the app (a WebView of `/loyalty` on the production
  host). The screens just designed in Figma and released stay the one source: every web deploy updates the app the
  same minute, with no store release, and nothing is built twice.
- **Native parts, which the browser cannot do:** NFC on iPhone and Android; a fast native QR scanner; push
  notifications (e.g. a new benefit request); Face ID / fingerprint or PIN lock for shared desk phones; haptics; and
  an offline screen. A small bridge lets the web's Scan screen ask the app to read a card or a code. The result goes
  through the same `POST /v1/admin/loyalty/scan` as today, so no business rule is copied into the app.

Why not the alternatives:

- **Extending Hotel Staff** mixes a hotel operations app with an every-industry loyalty product (salons, gyms,
  venues), and its loyalty screens would have to be rewritten on the new API anyway. Hotel Staff stays as it is for
  hotels.
- **Rebuilding every screen natively** doubles the work (weeks, not days) and leaves the app behind the web, which
  changes almost daily. If desk tests show the scan → award loop needs to be faster, that one loop can become native
  later without changing the plan.

Risk to manage: Apple may reject an app that is mostly a website (guideline 4.2). Native NFC, native scanning, push
and the device lock make it more than a website. Unlisted distribution (link-only, suited to a staff tool) and a demo
account for review lower the risk. If Apple still refuses, the fallback is the native scan loop above.

## What staff can do in the app (version 1)

- **Sign in** with the existing staff account; stay signed in; optional Face ID / PIN on open.
- **Scan** by NFC card, member QR code (camera) or typed number, name, email or phone. See the member at once: tier,
  points, progress, benefits, stamps, credit, membership dates, and at a place or event whether they may enter.
- **Act**: award or deduct points with a reason, check in a visit, link an NFC card to a member, approve or complete
  benefit requests and redemptions. The server decides each right, as today.
- **Members**: search, profile, history, add a member.
- **Door mode** at a place or event: continuous on Android; one system sheet per card on iPhone.
- **Everything else** (Program, Ways to earn, Rewards, Events, Campaigns, Insights, Card & app, Settings, Guide)
  through More, as in the mobile web.
- Five languages, light and dark, as the web.

## Phases

| Phase | Work | Who |
|---|---|---|
| 0. Decisions | Name, icon, bundle ids, which Apple team publishes, unlisted or public, test phones and cards, a demo login for Apple's review | Owner |
| 1. App shell | New repository, Expo project from Hotel Staff's native parts, WebView of `/loyalty`, splash and icon, Android back button, external links in the browser, offline and error screens, native words in five languages | Agent |
| 2. Native scanning | Bridge (`scanNfc`, `scanQr`, `haptic`, `appInfo`); the web's Scan screen uses the app's readers inside the app (a small change in `frontend/src/loyalty`, with tests); NFC card ids in the form the server's `CodeReader` reads; door mode; linking a card. First step: a real-card spike on both phones | Agent, owner tests |
| 3. Push and lock | Expo push token registered for the staff user; a push to managers when a member sends a request (server change, with tests); Face ID / PIN lock; sign-out | Agent |
| 4. Phones and stores | EAS development builds on the owner's phones; acceptance list (NFC iPhone and Android with your real cards, QR in poor light, award and deduct, offline, push); store texts in five languages, privacy and data-safety forms, review demo account; TestFlight and Play internal test, then release | Agent prepares, owner signs in and submits |

Rough effort: phases 1–3 are about two weeks of development. Store review adds a few days, and testing on your phones
runs alongside.

## Changes in this repository

Small and additive:

- The web Scan screen gains an "app" reader when it runs inside the app.
- An `embedded` mode hides web-only bits (install prompts, browser hints) inside the app.
- A staff push for new requests.
- An app-configuration answer: the minimum app version, so an old app can be asked to update.

Every change follows `CLAUDE.md`: server decides, five languages, tests, the deploy recipe.

## Checks before building

- **Your NFC cards' chip type.** iPhones read NTAG, Ultralight and DESFire cards, but not MIFARE Classic; Android
  reads all of them. Check what the 8 production cards (and the cards you sell) are.
- **iPads have no NFC reader.** On iPad, use the camera (QR) or an external reader; NFC tablets are Android only.
- **Desktop readers stay on the computer.** USB readers such as the ACR122U belong to the PC workspace; Bluetooth
  readers for phones are a later option.
- **Builds and store submission need your Expo, Apple and Google sign-ins.** Run them on your machine, or add an
  `EXPO_TOKEN` as a secret in this environment's settings (never in chat) so builds can start from here.
