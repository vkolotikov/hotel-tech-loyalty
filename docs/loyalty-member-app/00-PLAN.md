# HexaTech members' app — plan

Owner, 2026-10-31: "If or when it is done can we develope as well user membership app or improve existing one."

Owner's decisions (2026-10-31): **a new app, published under the existing listing; store name "HexaTech Loyalty";
each venue's own colours.**

Status: **phase 1 built** on `feature/loyalty-member-app` in `apps/loyalty-member` (README there): sign-in, join by
QR or link, the old app's session carried over, Home, the card with its QR code and wallet buttons, Activity, More,
the venue's accent and heading face, five languages (the portal's own words, shared), push per phone with sign-out
clearing it, the version check. Checked in the browser preview against the local API: Home, card, activity and More
for a real member, a new member joining through the form (201, welcome points on Home), Russian. Phases 2 and 3 next.
Evidence for the decision: a read-only audit of the existing app (`vkolotikov/hotel-tech-loyalty-mobile` at `c3deea3`,
`01-AUDIT-2026-10-31.md`), with its key facts checked again by hand.

## What exists

The **Hotel Loyalty** members' app (Expo), live in the stores:

| | |
|---|---|
| Toolchain | Expo SDK 54.0.34, React Native 0.81.5, expo-router 6, the old architecture (`newArchEnabled: false`; SDK 54 is the last SDK that allows it) |
| Store identity | `com.hotelloyalty.app` (iOS and Android), App Store Connect app 6765608479, team HNWSAQ5CQ9, EAS project under `hoteltechai`, scheme `hotel-loyalty://`; iOS build 17, Android versionCode 8 |
| Releases | `.github/workflows/release.yml` publishes an over-the-air update to every member on each push to its `main`, checked only by `tsc` |
| Languages | English only (the platform speaks five) |
| Tests | none; 128 `any` in strict TypeScript |
| Industry | about 62 hotel-only phrases and tiles ("Contact Hotel", Book Stay/Spa/Dining for everyone) |
| Push | one token per member on the server, never removed at sign-out; Android push never worked (no FCM credentials); a tapped push opens nothing (it expects types the server never sends) |
| Sign-out | does not revoke the token on the server |

Broken or out of date today:
- **Bookings** reads `/v1/member/bookings`. That endpoint reads the old `bookings` table, which nothing writes any
  more, so members see no current bookings. The portal reads the real tables (`member/portal/bookings`).
- **"Book"** opens the public widget in a web view, so a booking made there is an anonymous guest's, without member
  prices or coupons.
- **Progress** always says points, even where the venue counts visits or spend.
- **Tier colours** come from tier names, not the colour the venue chose.
- **Tapping an inbox message** does nothing.

Missing compared with the portal (`frontend/src/portal`, `/v1/member/portal/*`):
- booking stays and appointments as a member (member prices, coupons, payment), and cancelling them;
- tier benefits and benefit requests (the staff app's new alerts wait for these);
- stamps, credit and events with sign-up;
- the membership's end date, and the venue's currency, time zone and what it offers;
- help in five languages, and SMS and marketing consent.

## Recommendation: a new app on the staff app's toolchain, published as an update of the existing listing

Build the members' app again, in this repository at `apps/loyalty-member`, on the staff app's foundations (Expo SDK
58, the same API client, sign-in, theme, five languages, push, lock, version check). Publish it under the **existing
store identity** (`com.hotelloyalty.app`, the same App Store and Play listings, EAS project and link scheme), so every
member gets it as an ordinary update and keeps their reviews and installs.

Why not upgrade in place:
- The jump from SDK 54 to 58 forces the new architecture, the class of iOS crash the old app's own notes record
  (about 1–2 weeks with that risk).
- After that, nearly every screen still needs rewriting: five languages, every industry, the venue's colours, the
  portal's features, tests (another 4–6 weeks).
- A new app on proven foundations costs about the same (4–6 weeks to the portal's features), carries no legacy, and
  shares code with the staff app and the portal.

What carries over:
- every server endpoint;
- the portal's pure logic (booking steps, payment outcomes, stamps, money and venue-time rules) and its words in five
  languages;
- the staff app's foundations;
- from the old app: the store identity, the join-link and Apple Wallet flows, and the visual ideas.

## Version 1 (what members can do)

- **Join and sign in** with the venue's join link or QR (as now); stay signed in after the update (the new app reads
  the old app's stored session); sign-out revokes the token and the phone's push registration.
- **Card:** the member's card in the venue's colours, QR for the desk, the Apple Wallet pass (and Google Wallet's once
  the platform publishes it; it is still pending, handoff 2026-10-30).
- **Points and progress:** by the programme's own measure (points, visits or spend), with history.
- **Benefits and requests:** ask for a benefit and see staff's answer (this completes the staff app's request alerts).
- **Rewards and offers:** claim a reward (code for the desk), offers and coupons.
- **Stamps, credit and events:** stamp cards, credit balance, events with sign-up and the door QR.
- **Bookings:** the member's stays and appointments, with booking and paying at member prices and cancelling by the
  portal's rules. Every price and outcome comes from the server, as in the portal; payment by Stripe's native sheet.
  Apple allows card payment for real-world services, so in-app purchase does not apply.
- **Inbox and push:** messages open what they name; push per phone, removed at sign-out; Android push working (FCM).
- **Help, settings and account:** FAQ in five languages, language, notification categories, SMS and marketing consent,
  delete account. Every industry's own words, never hotel words for a gym.

## Phases

| Phase | Work | Rough effort |
|---|---|---|
| 1. Foundation and card | Shell from the staff app; join, sign-in, the old session carried over; card, QR, wallet; points, progress, history; five languages; push per phone; version check | 1 week |
| 2. Programme | Benefits and requests, rewards, offers and coupons, stamps, credit, events, inbox, referrals, help, settings, delete account | 1.5–2 weeks |
| 3. Bookings and payments | Stays and appointments, member prices, coupons, Stripe payment sheet, cancellation; the portal's tests mirrored | 2 weeks |
| 4. Release | Same bundle id and listings; new runtime version; the over-the-air workflow stopped; Android FCM; store texts and screenshots in five languages; TestFlight and Play internal test, then release | owner signs in and submits |

Server work, small and additive: a members' phone table like `staff_devices` (one token per phone, removed at
sign-out), push data the app can open, `member` in `config/apps.php` for the version check.

## Decisions for the owner

1. **Approach:** the new app above (recommended), or upgrade the old one in place.
2. **Name in the stores:** keep "Hotel Loyalty", or rename the listing (for example "HexaTech Loyalty"), since the
   platform now serves every industry. The listing, its id and its members stay either way.
3. **Look:** each venue's own colours (from Card & app), on the gold-on-navy default (recommended); or one look for
   every venue.
4. **Access:** the Expo project belongs to the `hoteltechai` account; builds need that sign-in (or an `EXPO_TOKEN`),
   and Android needs a Firebase key for push and a Play service account for submission.
