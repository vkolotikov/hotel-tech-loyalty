# HexaTech Loyalty, release 6 — the remaining limits closed (design)

Status: owner's request of 2026-10-23 ("deploy please and do all remaining improvements"). Builds on release 5b (live
as `main` 5b481aa, built from branch ea8b364). The list is every known limit left in `docs/member-portal.md` and
`docs/loyalty-workspace.md` that can be closed in code; Twilio stays out (owner, 2026-10-23: "No need Twilio for now").

## 1. Bookings and money (part M)

1. **A lost dispute is recorded**: `charge.dispute.closed` with `lost` records the money as gone back on every room of
   the payment (and on a service booking), reverses the points, and leaves the booking's state as staff left it.
2. **Refund events are recorded exactly once without a time window**: the cumulative `amount_refunded` is compared and
   written under the same lock the refund path holds, so the 60-second freshness skip is no longer needed (or is kept
   only where it is still needed, with the reason).
3. **The widget's combination takes the room locks** (every room once, ascending) and re-checks availability under
   them, as the portal's combination does (R4-8's line of work: a room taken meanwhile is refused instead of
   double-booked). Nothing else in the widget changes.
4. **"Any staff member" and a named master serialise**: an "any" confirm also takes the lock of the master it picks.
5. **Stripe calls made under a lock have a short timeout** (connect and read), so a slow Stripe cannot hold `pi:` or a
   booking-row lock for minutes.
6. **Zero-decimal currencies** on every stay money path (webhooks, capture, `markMirrorPaid`, refunds).
7. **The venue's currency, not a literal EUR**, in holds, the Smoobu receipt and the confirm response.
8. **A confirm re-checks its payment under the hold's lock**: a payment cancelled meanwhile (the rescue of a racing
   request) is refused instead of a stay written without a live payment.
9. **A rescue refusal alerts staff** (a realtime notification beside the audit row).
10. **Combination finishing touches**: the full admin shows the payment reference on every room of a group; the PMS
    retry writes the Stripe reference line on following rooms too; the portal's cancel panel lists the rooms.

## 2. Platform, Scan and settings (part P)

1. **A new organisation always gets its own default brand**, whatever tenant is bound; a command repairs any
   organisation without one (dry run by default).
2. **The full admin's NFC linking** (`nfc-cards`, `nfc/issue`) stores and compares card IDs the way `NfcCards` does.
3. **Scanners on French (AZERTY) and Spanish keyboard layouts** are typed back like German and Russian.
4. **The pay-at-venue fallback setting** can be read and switched by a command when the Appointments workspace is off.
5. **A reward's, offer's or boost's brand can be changed** on edit (with more than one brand).
6. **Boosts flagged "check the time"** can be confirmed together by a manager ("These times are right").
7. **Campaign tags inside a link are URL-encoded**; `{{current_year}}` follows the venue's clock.

### Independent review of part M (commit 4f8d74f)

A read-only review of part M's money changes found six things, all fixed with tests on SQLite and PostgreSQL:

1. A refund Stripe answered too late, retried after its webhook recorded the money without the refund's id (API
   versions since 2022-11-15 send no `refunds` list), was recorded twice. Now a refund Stripe hands back
   (`Idempotent-Replayed`, or an id already recorded) is recorded only as far as Stripe's own refunded total, read
   under the lock, exceeds what the rooms hold; staff are told "No new refund was made" (409). A refund that times out
   is "may or may not have been made — retry only the same amount" (504), never "failed".
2. A widget confirm whose payment could not be checked under the lock left the guest's card held for days with no
   booking: the widget cannot confirm again with it. Now the rescue runs and staff get the enquiry.
3. A lost dispute counted against Stripe's refunds-only `amount_refunded`, so later refunds were under-recorded. Now
   it is kept apart (`dispute_lost_amount`, migration 2026_10_23_160000) and left out of the compare.
4. A lost dispute on a stay was recorded room by room, and a failure was acknowledged to Stripe. Now one transaction;
   a failure keeps nothing and Stripe delivers the event again.
5. The rescue alert could be raised by anyone posting a made-up id, and by a double submit. Now only for a payment
   Stripe could read in the venue's account.
6. The widget's combination booked a room on its base price when the PMS had answered for that room and a second read
   failed. Now only a room the per-day answer leaves out altogether is judged on its base price.

Left as it is: a webhook refund larger than a single room's price is recorded as made (the money did go back).

## 3. Test-suite health (part T, after M and P)

The older tests that fail on PostgreSQL only because of their own data get data the real schema accepts, so every
suite passes on SQLite and on PostgreSQL built from every migration; a script runs the suites on PostgreSQL. No
application code changes in this part: a real bug it finds is reported.

## 4. Rollout

One deploy by the source-patch recipe after the owner's word; migrations, if any, add nullable columns or indexes only
and are tried on PostgreSQL first.
