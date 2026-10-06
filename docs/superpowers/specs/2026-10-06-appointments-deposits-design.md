# HexaTech Appointments — Part H: deposits for online bookings

Status: design approved by the owner in conversation on 2026-10-06 (sections 1–4: "Looks right"). This spec is for
the owner's review before the implementation plan.

Roadmap context:
- A–G — live;
- full-admin top-bar button and the polish pass — live as main `d730811ca` (2026-10-06);
- **H deposits and no-show / late-cancellation fees — this part.**

## 1. Goal

A venue that loses money to no-shows and late cancellations from its **online booking page** can ask those clients for a
deposit:
- The client pays part of the price by card when booking.
- Cancelled in time, the deposit goes back automatically.
- Cancelled late, or a no-show, the venue keeps it.
- Otherwise it counts towards the price at the desk.

## 2. Owner decisions (2026-10-06)

| Question | Decision |
|---|---|
| Which no-shows | Bookings made on the **online booking page**. The member portal (already a full-price card hold) and staff bookings (paid at the desk) are unchanged. |
| The 29 Sep ruling "the public booking page must not change" | Refined: the page changes **only for a venue that switches deposits on**; every other venue's page stays exactly as it is. |
| What the client commits | **A deposit paid now**: refunded automatically when cancelled in time, kept on a no-show or late cancellation, otherwise counted towards the price. No saved cards. |
| The amount | **One percent for the venue**, set by a manager in the workspace Setup; it uses the full admin's existing deposit settings. |
| On cancellation | **Follow the window, a manager can override**: in time → refunded automatically, whoever cancels; late or no-show → kept, and a manager can still give it back (Part E's refund). |
| How the page takes it | **A card form on the page** (Stripe's own fields), reusing the page's existing payment endpoint and confirm step. |
| Sections 1–4 | "Looks right": the setting and the page (§4), money and records (§5), cancellation and screens (§6), edge cases, testing and rollout (§7–§10). |

## 3. What exists (verified on feature tip `86a83dd12`, the source live as main `d730811ca`)

**The public booking page.**
- Every online service booking goes through `/services-widget` (`resources/views/services-widget.blade.php`, served
  in `routes/web.php` with only `frame-ancestors *` as its CSP). Landing pages frame it.
- It takes no card today: `paymentIntent: null` (`:415`), posted as null (`:739`).
- Its API (`ServicePublicController`) has an unused `paymentIntent()` (`:184-250`, charges the full `list_total`) and
  a `confirm()` that verifies a given intent (`:330-341`). After saving the booking, `confirm()` captures it
  (`capturePaymentIntentIfNeeded`, `:481`, `:560-649`).
- `config()` already sends `require_deposit` and `deposit_percent` (`:76-77`); nothing uses them.
- Online bookers get `App\Mail\ServiceBookingConfirmationMail` (`:703-737`).

**Stripe.**
- Per-organisation keys: `stripe_publishable_key`, `stripe_secret_key` (encrypted), `stripe_webhook_secret`,
  `stripe_currency` (default `eur`).
- Payments are on when `booking_payment_enabled` is `true` and a secret key exists (`StripeService.php:23-42`).
- `createPaymentIntent` always uses `capture_method => 'manual'` (`:111`).
- No Stripe Connect, no saved cards, no SetupIntent, no off-session charges.

**Background jobs and refunds.**
- The capture job `bookings:capture-pending-pis` (every 10 minutes): captures `authorized`/`pending` service bookings
  that are not `pending` and are under 6 days old, marking them `paid`; for `cancelled`/`no_show` it releases the
  hold.
- `bookings:release-orphan-portal-holds` (`ReleaseOrphanPortalHolds`) releases portal holds that never became a
  booking, after 45 minutes.
- `charge.refunded` is recorded by `BookingPublicController::recordServiceBookingRefund`.

**Money (Part E).**
- The ledger `service_booking_payments`: kind `payment`/`refund`; method `cash`, `card_desk`, `transfer`, `other`,
  and `online_card` for card refunds made here.
- `AppointmentMoney::amountsFrom()` works out paid online, paid at the desk, money given back, still owed and the
  label (`statusFor`: a part-payment leaves `unpaid`). `refundInLock()` refunds through Stripe.

**Settings.**
- Full admin → Settings → Booking (`BookingTab.tsx`) already edits `services_require_deposit` (default `false`) and
  `services_deposit_percent` (default `100`), plus `services_cancel_hours` (default 24).
- The workspace Setup writes through `App\Services\Booking\Setup\BookingRules` (managers only).

**Cancelling.**
- **Workspace:** `AppointmentActionRunner` cancel (refunds with it are managers' only).
- **Full admin:** `ServiceBookingController::updateStatus()` (`:549`) and `bulk()` (`:240`).
- **Member portal:** `MemberCancellation` refuses late cancellation (no fees).
- **The deadline rule:** `CancellationPolicy` — the start on the venue's clock minus `services_cancel_hours`.

**The chat assistant** books services itself: `WidgetChatController::bookService()` (`:2579`), source
`chat_widget`, status confirmed, unpaid.

## 4. The setting and the booking page

### 4.1 The setting

In the workspace **Setup** (managers): **"Deposits for online bookings"**, an on/off switch and a percent (1–100).

- It writes the existing settings `services_require_deposit` and `services_deposit_percent` through `BookingRules`, so
  the full admin's Booking tab shows the same values (one source).
- It can be switched on only when:
  - the venue's Stripe is connected (`booking_payment_enabled` true and a secret key);
  - and the venue's currency equals `stripe_currency`.

  Otherwise Setup says which is missing and the switch stays off. The server refuses
  `deposits_unavailable` (422).
- Switching on with the untouched stored default (`100`) proposes 20%.

### 4.2 The booking page

**Deposits off, or a venue without the setting:** the page is exactly as today. Its rendered output is compared in a
test with today's.

**Deposits on** — after the client's details, a deposit step:

> Pay a deposit of **€12.00** now (20% of €60.00). You pay the rest at the venue.
> Cancel at least 24 hours before for a full refund of your deposit; after that, or if you don't come, the venue keeps it.

Then Stripe's card fields (Stripe.js Payment Element, the venue's publishable key) and **"Pay €12.00 and book"**:
1. The page asks `paymentIntent()` for the deposit intent: manual capture, amount = the deposit.
2. Stripe confirms the card in the browser (3-D Secure when the bank asks).
3. `confirm()` saves the booking under the scheduler's lock and captures the intent at once.

Outcomes:

| Case | What happens |
|---|---|
| A card refused | Stripe's reason is shown; nothing is booked. |
| The time taken in between | The intent is cancelled (it was never captured): "That time was just taken; your card was not charged." |
| A free service, or a deposit below Stripe's minimum (0.50 in the venue currency) | No deposit step; the booking is made as today. |

**The confirmation screen and `ServiceBookingConfirmationMail`** add: "Deposit paid €12.00. Cancel by {deadline on
the venue's clock} for a full refund."

### 4.3 The amount

deposit = round(quoted total × percent ÷ 100, 2)
- The quoted total includes extras (`list_total`).
- The server works it out, in `quote()`, `paymentIntent()` and `confirm()`; the page never sends an amount.
- `confirm()` refuses an intent whose amount is not exactly the deposit, as the portal's `PortalPaymentIntentGuard`
  does for its total.

### 4.4 The chat assistant

At a venue with deposits on, the chat does not book services itself:
- `bookService()` answers `deposit_required` with the booking page link;
- the assistant's instructions tell it to share that link.

Otherwise chat bookings would skip the deposit.

## 5. Money and records

### 5.1 The deposit is a real payment

On capture it becomes a row in Part E's ledger:

| Field | Value |
|---|---|
| kind | `payment` |
| method | `online_card` |
| amount | the deposit |
| note | "Deposit" |
| Stripe intent | the booking's `stripe_payment_intent_id` |

Every money screen then counts it with no special case:
- the panel shows "Paid online €12.00 · Still owed €48.00";
- **Take payment** asks for €48.00;
- Takings and Insights include it.

`AppointmentMoney::amountsFrom()` counts `online_card` payment rows as **paid online**, not at the desk.

### 5.2 The booking keeps its terms

`meta.deposit = { amount, percent, cancel_hours }`, as agreed at booking.
- The refund deadline is always `AppointmentClock::toInstant(start_at) − cancel_hours`, in real hours, from the
  visit's **current** start. A moved visit keeps its terms against its new start.
- Changing the venue's window or percent later never changes bookings already made.

### 5.3 The label follows the money

After the deposit, the label stays `unpaid` until the rest is paid (Part E's `statusFor`). The whole booking is never
marked `paid` because a deposit came in.

### 5.4 Charging and its fallbacks

- `confirm()` captures right after saving.
- If the capture is delayed, the 10-minute capture job finishes it. For a booking with `meta.deposit` it records the
  deposit row and the label by the rule above, instead of marking `paid`.
- If such a booking is cancelled or marked no-show before the delayed capture, the job follows §6's rule instead of
  its usual release:
  - cancelled in time → the hold is released (nothing charged);
  - cancelled late, or a no-show → the deposit is captured and kept.
- The webhook's `charge.refunded` keeps recording refunds made in the Stripe dashboard.

### 5.5 Abandoned payments

An authorised intent that never became a booking (the client left) is cancelled after 45 minutes.
`ReleaseOrphanPortalHolds` (or a sibling) also covers the booking page's intents, which carry `source:
services_widget` in their metadata.

**No migration:** the terms live in `meta`; the money in the existing ledger.

## 6. Cancelling, no-shows and what staff see

### 6.1 One rule, every path

`DepositRule::onCancel(ServiceBooking, CarbonImmutable $now)` is called by every cancellation:
- the workspace's Cancel (`AppointmentActionRunner`);
- the full admin's `updateStatus()` and `bulk()` cancel.

| Case | What happens |
|---|---|
| **Cancelled at or before the deadline** | The whole deposit goes back through Stripe, automatically, whoever cancels: Part E's `refundInLock` with `online_card`, under the booking's lock, in the same transaction. If Stripe refuses, nothing is cancelled: 422 `deposit_refund_failed`, "The deposit could not be refunded just now. Try again." |
| **Cancelled after the deadline** | The deposit is kept. A manager can still give it back with Part E's refund (the cancel sheet's refund line or **Refund**), as goodwill, with a reason. |
| **No-show** | The deposit is kept, with the same manager override. |

### 6.2 What staff see before confirming

These are `AppointmentActions` consequence lines; the server sends the codes, and the screen prints them in five
languages.

| Action | Line |
|---|---|
| Cancel in time | "The deposit (€12.00) goes back to the client's card." |
| Cancel late | "The venue keeps the deposit (€12.00): cancelled less than 24 h before the visit." For managers, the refund line offers the deposit. |
| No-show | "The venue keeps the deposit (€12.00)." |

### 6.3 What the client is told

Part D's cancellation email, when "Tell the client" is ticked, adds one of:
- "Your deposit of €12.00 is being refunded to your card."
- "The deposit of €12.00 is kept, as cancelled less than 24 hours before."

### 6.4 Earlier parts

- **Reopen (F):** a cancellation whose deposit went back cannot be reopened ("money went back", polish F3). A late
  cancellation can be, and its kept deposit still counts.
- **Moving (F):** terms follow the new start (§5.2).
- **Insights (G):** kept deposits are money taken; refunded ones net out (already, through the ledger).

## 7. Edge cases

- **Deposits switched off later:** existing deposit bookings keep their terms.
- **A price change after booking:** the deposit stays as paid; owed is the new total minus it.
- **Double submit:** the existing unique index (one booking per intent) holds.
- **The venue's time zone:** the deadline is on the venue's clock; exactly at the deadline is **in time** (as in
  Insights).
- **The member portal:** unchanged; its bookings never carry `meta.deposit`.
- **Staff bookings:** unchanged.

## 8. Refusals

| Case | Answer |
|---|---|
| Deposits switched on without Stripe or with a currency mismatch | 422 `deposits_unavailable` (Setup) |
| A deposit intent that does not match | 422 `deposit_mismatch` (`confirm()`) |
| A refund refused on an in-time cancel | 422 `deposit_refund_failed` (nothing cancelled) |
| The chat at a venue with deposits | `deposit_required` + the booking page link |

All are in five languages where staff or clients see them.

## 9. Testing

**PHP, test-first, with Stripe faked as the portal's tests do:**
- the deposit amount: percent, rounding, minimum, free service, extras;
- the page's output with deposits off is identical to today's;
- a deposit booking:
  - records the ledger row;
  - stays `unpaid`;
  - shows paid online and owed correctly;
- a mismatched intent is refused;
- the capture job finishing a delayed deposit records it as a deposit, never `paid`;
- the orphan release covers the page's intents;
- cancelling:
  - cancel in time refunds;
  - cancel late keeps;
  - no-show keeps;
  - a refused refund cancels nothing;
  - the full admin's `updateStatus()` and `bulk()` follow the rule;
  - a manager's goodwill refund of a kept deposit;
- the consequence codes;
- the email lines;
- the chat answers `deposit_required`;
- Setup's guards;
- moving keeps the terms;
- reopen after a refunded deposit is refused, and after a kept one is allowed.

**Frontend:** the Setup switch and percent; the consequence lines; the panel's money; words in five languages.

**Browser, before hand-over:**
- the local copy with the venue's Stripe **test** keys:
  - card `4242 4242 4242 4242`;
  - a declined card;
  - a 3-D Secure card;
  - a cancel in time with its refund;
- 1440 px and 390 px;
- an accessibility check;
- the page with deposits off compared with today's.

## 10. What this part does not do

- No saved cards.
- No fee charged after the fact beyond the deposit.
- No deposits for member-portal or staff bookings.
- No payment links.
- No per-service deposit amounts.
- No client self-cancellation from the booking page.

## 11. Rollout

- No migration.
- The deploy follows the main-cut source-patch recipe, on the owner's explicit yes.
- **The deploy itself changes nothing for clients:** deposits stay off at every venue until a manager switches them on.
- The owner's first live check: switch deposits on at their venue, make a small real booking, then cancel it in time
  and see the refund arrive.
