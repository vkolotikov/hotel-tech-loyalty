# HexaTech Loyalty, release 5 — Scan that works (camera, NFC, any code), combination stays with the lead room paying (design)

Status: deployed 2026-10-23 as `main` 8a04f86 (from branch 6adf121). Owner's answers of 2026-10-23 ("do next improvements. No need Twilio for now. Scan feature not works correctly,
and need also NFC and qr scan option on the app"). Builds on release 4 (live as `main` 097432a, built from branch
a7e87ae). Runbooks: `docs/loyalty-workspace.md`, `docs/member-portal.md`.

## 1. Owner decisions

| # | Question | Answer |
|---|---|---|
| R5-1 | Where camera and NFC scanning live | **The workspace's Scan page** (`/loyalty/scan`) on a phone, tablet or desk computer. The member mobile app (another repository) is not changed. |
| R5-2 | NFC | **All three**: tap a card on an Android phone or tablet (Chrome, Web NFC); a USB NFC reader at the desk (Chrome, WebHID, as the full admin has); link cards to members on the member's page (link, list, switch a lost one off). Keyboard-style readers keep working in the field. |
| R5-3 | The full admin's camera scan | **Fix it**: it reads the member app's QR code and the wallet pass through the same tolerant lookup; its answer stays the same shape. |
| R5-4 | Combination stays | **Build now, the lead room pays**, and fix the public widget's paid combination the same way (R4-8, approved then). |
| R5-5 | Twilio | Not now: SMS stays as release 4 left it; the token encryption waits. |

## 2. Why Scan "does not work" (found 2026-10-23 on a local copy)

- The wallet pass shows the number as `#LS-001001`; typed so, it finds nobody; `LS001001` and `001001` neither.
- A USB/Bluetooth QR reader set to a US layout on a computer with another keyboard layout (German, Latvian, Russian…)
  types the app's QR code (`{"type":"hotel_loyalty","member_number":"…","version":2}`) with its braces, quotes and
  colons changed: nobody found.
- The older app QR code (`{"type":"hotel_loyalty","token":"…","version":1}`) is not understood.
- Many keyboard-style NFC readers type a card's ID in decimal, not the hex the cards were linked with.
- The workspace has no camera and no NFC; the full admin's camera sends only the code's `token` field, which the
  current QR code does not have, so it always answers "Invalid QR code".

## 3. Scan (part S)

- **One tolerant reader of codes** (`App\Services\Loyalty\CardLookup`), for the workspace and the full admin's QR scan:
  `#`, spaces and case ignored; a member number with or without its hyphen; the digits alone when exactly one member
  of the organisation has them; the app's JSON however a keyboard layout bent its punctuation (the member number is
  found inside); the v1 JSON's token; a link that carries a member number; an NFC ID in hex with any separators or in
  decimal (as many readers type it). Only ever this organisation's members; every scan logged as today.
- **Workspace Scan page**: "Scan with camera" (rear camera; the decoder loads only when used), "Tap NFC card" where the
  browser can (Android Chrome; the page says plainly where it cannot, e.g. iPhone), "USB reader" on a desk computer
  (Chrome), and the field. A card no member has: "Link this card" to a member found by name or number.
- **A member's NFC cards** (member's page): link a card (tap, USB reader or type its ID), see the member's cards (when
  linked, last used), switch one off. One active card belongs to one member of the organisation. Linking does not
  change the member's QR code or wallet pass.
- **The full admin's Scan page**: its camera sends the whole code to the same lookup; nothing else on the page changes.

## 4. Combination stays (part C)

- One hold, one confirm, one PaymentIntent for the whole party; one `booking_mirror` row per room sharing
  `booking_group_id`. **The lead room (the first) carries the intent**; the other rooms carry none
  (`booking_mirror_org_pi_unique` holds) and follow the lead through `booking_group_id`.
- Locks at confirm: every room's `room:{org}:{unit}` once, ascending, then the hold row, then `pi:`; never a booking row
  while `pi:` is held. Availability and price re-checked under the locks; all or nothing (Smoobu reservations made
  for it are cancelled when anything fails).
- Every path that finds rows by the intent also brings the siblings along (spec 2026-10-22 §7): the capture job, the
  `payment_intent.succeeded` / `.canceled` / `charge.refunded` / dispute webhooks, `applyRefund()`, cancellation, the
  bookings list, points. A member cancels the whole combination: money back once, then every room cancelled.
- The public widget's own paid combination writes the intent on the lead room only, the same way; nothing else in the
  widget changes.
- Tests create the partial unique index (SQLite has partial indexes), so they fail the way PostgreSQL would.

## 5. Rollout

One deploy by the source-patch recipe after the owner's "yes, deploy". Migrations, if any, add nullable columns or
indexes only and are tried on PostgreSQL first.
