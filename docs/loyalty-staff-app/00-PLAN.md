# HexaTech Staff — native Android and iOS app for loyalty staff

Owner, 2026-10-31: "make also separate mobile android and ios app for loyalty, for loyalty software admin who could
scan membership cards by nfc, qr, manualy, see all benefits points etc." Then, on the plan: "yes go ahead, use the
new branch and your defaults. Use design more from our previous mobile app not from web mobile figma. Make something
modern, luxury, poverfull, easy to use nice design".

## Status (2026-10-31)

- **Version 1 is built** on branch `feature/loyalty-staff-app`, in `apps/loyalty-staff/` (how to run and build:
  `apps/loyalty-staff/README.md`).
- **What was checked:** typecheck, unit tests (desk rules, error words, formats, five-language parity), and the web
  preview against the local API with real data: every screen photographed at phone size, sign in and sign out (the
  token is revoked on the server), a scan by typed code at the desk and at a tiers-only place, and points given
  through the sheet (one request, balance moved by exactly the amount).
- **Request alerts (2026-10-31):** a member's new benefit request reaches every active staff phone, a claimed
  reward the phones of those who may hand it over; tapping one opens Requests. Server tests on SQLite and PostgreSQL.
- **Not yet checked: a phone.** NFC and the camera only run in a phone build. The next step is the owner's EAS
  development build and the acceptance list in the README.
- **On the server:** the screens use endpoints that were already live; request alerts added server code (phones,
  `StaffAlerts`), deployed to production on 2026-10-31 (`docs/loyalty-workspace.md` "Deploying"). The app itself is
  not part of the Laravel Cloud deploy: it reaches phones through EAS and the stores.

## Decisions

| Question | Answer |
|---|---|
| Existing app or a new one? | A new app, separate from Hotel Staff (a hotel operations app) and from the members' Hotel Loyalty app. Same toolchain: Expo, React Native, EAS, the same Apple and Google accounts |
| Web view or native screens? | **Native screens** (owner's choice of design, above). The earlier proposal to show the mobile web inside the app is dropped. No business rule moves into the app: every answer still comes from `/v1/admin/loyalty/*` |
| Design | The previous Expo apps' look: gold on deep navy, Cormorant Garamond headings, Inter for the rest, a luxury member card lit by the tier's colour, a raised gold Scan button in the tab bar. Not the web mobile Figma |
| Setup pages | Program, Rewards, Events, Campaigns, Insights, Settings and Guide open the web workspace in the browser from More. The app is the desk; setting up stays on the web |
| Name and ids | HexaTech Staff; bundle id and package `uk.hexatech.loyalty.staff`; scheme `hexatech-staff` |
| Publisher | Apple team FDS Cards Ltd (`HNWSAQ5CQ9`); Google Play under the same account as Hotel Staff |
| Distribution | App Store **unlisted** (link only; Apple grants it on request after review); Google Play internal test, then unlisted or closed |
| Server | `https://app.hexa-tech.uk/api` (`EXPO_PUBLIC_API_URL` in `eas.json`); `loyalty.hotel-tech.ai` is another host of the same backend |

## What staff can do (version 1)

- **Sign in** with the staff account (`POST /v1/auth/login`, `user_type: staff`); stay signed in (token in the phone's
  secure store); optional Face ID or fingerprint lock after two minutes away; five languages; forgotten password opens
  the web page.
- **Home:** greeting, one large "Scan a member", find a member, requests waiting, the last 30 days' figures and the
  latest activity.
- **Scan:** NFC card (Android reads continuously; iPhone opens the system sheet per card), member QR by camera, or a
  typed number, name, email or phone. "Scanning for" picks the desk, an active place or today's published event, and
  the answer shows whether the member may enter, and why not.
- **Member:** the luxury card (tier, number, points, valid until, credit), tier progress, benefits, linked cards,
  history. Give or use points with a reason, check in a visit (with the amount when desk earn or cashback is on), link
  an NFC card. The server decides who may do each, and the app shows only what the server allows.
- **Requests:** rewards to hand over, benefit requests to approve or decline (with a reason the member reads) and then
  mark as given.
- **More:** the profile, the web pages above, language, the lock, sign out.

## How it keeps the server's rules

- Every call is `/v1/admin/loyalty/…` with `brand_id=all`, as the web workspace. Codes are read by the server's
  `CodeReader` (NFC ids are sent as read; the server accepts hex with or without separators and decimal).
- Every write carries an `idempotency_key`. A key is kept while an attempt is unanswered and is renewed when the form
  changes. A scan of the same code at the same place within ten minutes reuses its key, as the web does.
- Error words come from the server's refusal codes (`not_enough_points`, `card_in_use`, `desk_earn_off`, …). A
  signed-out token (401) returns to sign-in.

## What is left

| Step | Work | Who |
|---|---|---|
| 1. Phone builds | EAS development build for Android and iPhone; install on the owner's phones | Owner signs in to Expo (or adds an `EXPO_TOKEN` secret to this environment); agent runs it |
| 2. Acceptance | The list in the README: NFC on both phones with the real cards, QR in poor light, typed codes, door answers, points, check-in, linking a card, requests, lock, five languages | Owner with the agent |
| 3. Push for new requests | **Built 2026-10-31**: server (`StaffAlerts`, `staff_devices`, deployed) and app (`src/lib/push.ts`, the switch in More). Needs the EAS project id, an Apple push key and FCM V1 credentials (README, "Request alerts") before a phone hears one | Owner sets up the credentials |
| 4. Minimum version | **Built 2026-10-31**: `GET /api/v1/apps/staff/version` (`config/apps.php`, Laravel Cloud variables `STAFF_APP_*`); below the minimum the app shows only "Time to update" | Owner sets the variables at a release |
| 5. Stores | **Prepared 2026-10-31** (`02-RELEASE.md`): store texts in five languages (`apps/loyalty-staff/store/listing.json`, limits tested), screenshots, the privacy and data-safety answers, the review notes, the unlisted request; the release config checked by a local prebuild. Left: the Expo project and credentials, the builds, TestFlight and Play internal test, the demo staff login, then release | Owner: accounts, demo login, submitting; agent: the builds once Expo is reachable |

## Checks before release

- **The NFC cards' chip type.** iPhones read NTAG, Ultralight and DESFire, not MIFARE Classic; Android reads all of
  them. Check the production cards and the cards you sell.
- **iPads have no NFC reader.** On iPad use the camera or a typed code; NFC tablets are Android only.
- **Desk USB readers stay on the computer** (ACR122U and similar, through the web workspace).
