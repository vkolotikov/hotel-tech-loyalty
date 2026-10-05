# HexaTech Appointments — Part E: money at the desk

Status: design approved by the owner in conversation on 2026-10-05 (sections 1–4: "Looks right"). This spec is for
the owner's review before the implementation plan.

Roadmap context:
- A one clock — live;
- B Setup — live;
- C sell on its own — live;
- D client messages — live as main `e3c947f62` (2026-10-05);
- **E money at the desk — this part;**
- F calendar power;
- G insights.

## 1. Goal

The desk handles the money side of an appointment inside the workspace. It records what was paid, how, by whom and
when; it gives money back; it prices a member's appointment the way the portal does. Nobody needs Stripe's dashboard
or a paper note.

Success means:
- every appointment shows what it costs, what was paid (online and at the desk), what went back and what is still
  owed;
- a manager can refund (card through Stripe, or money handed back at the desk) and cancel-with-refund in one step;
- a member booked by staff gets the member price and can use their coupons;
- a manager can count the till for any day.

## 2. Owner decisions (2026-10-05)

| Question | Decision |
|---|---|
| Scope | Desk payments, refunds from the workspace, member price + coupons at staff bookings. **Not** no-show or late-cancel fees. |
| Payment methods | A fixed short list: cash, card at the desk (terminal), bank transfer, other (with a note). The same for every venue. |
| Who may | Any staff member records a payment; only managers refund. |
| Cancelling a paid appointment | The refund is offered in the same step (manager), Stripe first; a failed refund leaves the appointment standing. |
| Full admin | Shows payments read-only and links to the workspace; its Payment dropdown and bulk "Mark Paid" go. |
| Staff's own discount | None: only the programme's member price and the member's own coupons. |
| Points after a refund | A full refund takes the visit's points back; a part-refund keeps them. |
| Takings | Yes: one managers-only day screen for cashing up. |
| Approach | A payment ledger (`service_booking_payments`) and one money service. |
| Rollout | No switch: these are staff tools. |

## 3. What exists (verified on feature tip `da91f2439`, the source live as main `e3c947f62`)

- **The booking's money columns** (`ServiceBooking`):
  - `service_price`, `extras_total`, `total_amount`, `currency`;
  - `list_amount`, `discount_amount`, `discount_source`, `discount_source_id`, `discount_label`;
  - `payment_status`, `stripe_payment_intent_id`;
  - `refunded_amount`, `refunded_at`, `last_refund_id`.
- **`payment_status` values in use:**
  - `unpaid`;
  - `pending` and `authorized` (a card held online);
  - `paid`, `partially_refunded`, `refunded`, `failed`;
  - `cancelled` (a hold let go).

  About 20 places read it: analytics, the dashboard, the connector (`app/Mcp`), the widget chat, the capture job,
  the portal and the presenter. **No new value is added.**
- **The workspace's "Mark paid at venue" action** (`AppointmentActions` / `AppointmentActionRunner`):
  - it only sets `payment_status = paid`;
  - it is allowed from confirmed, in_progress or completed, only while `unpaid` with no PaymentIntent.
- **`AppointmentActions::carriesCardPayment()`** tells a real Stripe PaymentIntent (`pi_…`, not `pi_mock_…`).
- **Portal pricing:**
  - `ServiceQuoteBuilder::build()` gives the list price (master, duration, extras);
  - `MemberPricing::quote(member, list, currency, BookingScope::Services, CouponSelection)` gives the member price;
  - `MemberPricing::columns()` gives the price columns;
  - `MemberPricing::consume()` uses the coupon inside the confirm transaction.
- **Portal coupons:** `CouponResolver` (`candidate`, `resolveCode`, `consume`, `rereference`). The portal lists the
  member's claimed offers not yet used and reward redemptions still `pending`.
- **Refunding a service booking:**
  - `ServiceBookingRefund::giveBack()` lets go of a held card or refunds a captured payment in full. It reads Stripe
    first and refuses with `CancellationException('refund_unavailable', …)` when online payments are off.
  - `StripeService::refund(pi, amount, reason, idempotencyKey)` refunds an amount.
  - `MemberCancellation` shows the safe order (row lock, `pi:` advisory lock, Stripe, then cancel).
- **Points:**
  - `BookingPointsService::awardForServiceBooking()` awards on completion from `total_amount`. It skips a booking
    whose `payment_status` is `refunded` or whose total is 0. It writes a `PointsTransaction` with
    `reference_type = 'service_booking'` and `reference_id = booking id`.
  - `LoyaltyService::reverseTransaction()` reverses one (used for stays by `BookingRefundService`).
- **Staff bookings:** `StaffBookingWriter::create()` prices at the slot's list price. Its Idempotency-Key hash covers
  client, service, master, start, source and notes.
- **Manager rule:** `SetupAccess::canManage(User)`.
- **Access map:** `admin/appointments` → staff/staff (a manager rule lives in the controller, as Setup's does).
- **Full admin, `ServiceBookingController`:**
  - `updateStatus` accepts `payment_status`;
  - `bulk` accepts `mark_paid`.

  Their only caller is `frontend/src/pages/ServiceBookings.tsx`; the stays' `BookingAdminController` is separate and
  untouched.

## 4. The money of an appointment

**What the client owes** is `total_amount`. For a member it is the member price with any coupon (§6).

**The ledger.** A new table, `service_booking_payments`, holds one row per money movement:

| Column | Meaning |
|---|---|
| `organization_id`, `service_booking_id` | whose |
| `kind` | `payment` or `refund` |
| `method` | `cash`, `card_desk`, `transfer`, `other`, or `online_card` (a refund through Stripe of the online card payment; refunds only) |
| `amount` | decimal(10,2), always > 0, in the booking's currency |
| `note` | required for `other`, and as the reason of every refund; ≤ 200 characters |
| `stripe_refund_id` | for `online_card` refunds |
| `actor_user_id` | who recorded it |
| `created_at` | when (a real instant) |

Rows are never edited or deleted; a correction is a refund.

**Online payments stay where they are.** A card paid or held through the widget or the portal is still the booking's
`stripe_payment_intent_id` and `payment_status`; nothing copies it into the ledger.

**The figures** (one service computes them — `App\Services\Appointments\Money\AppointmentMoney::summary()`):

| Figure | Rule |
|---|---|
| `held_online` | `total_amount` while a real card is held (`authorized`/`pending`), else 0 |
| `paid_online` | `total_amount` once a real card payment was taken (`paid`, `partially_refunded`, `refunded` with a real PaymentIntent), else 0 |
| `refunded_online` | the booking's `refunded_amount` (Stripe refunds, wherever made) |
| `paid_desk` | sum of ledger payments |
| `refunded_desk` | sum of ledger refunds with a desk method |
| `legacy_marked_paid` | `payment_status` is `paid` with no real PaymentIntent and no ledger rows (marked paid before Part E) |
| `owed` | 0 when cancelled or no-show, or when `legacy_marked_paid`; else max(0, `total` − `held_online` − `paid_online` − `paid_desk`). A refund never makes money owed again, at the desk as online (corrected at planning, plan ruling R1). |
| `refundable_online` | `paid_online` − `refunded_online` |
| `refundable_desk` | `paid_desk` − `refunded_desk`; for `legacy_marked_paid`, `total` − `refunded_desk` |

**The status label.** After every movement, the service writes `payment_status` from the figures, using only today's
values. It never touches a booking whose card is held online (`authorized`/`pending`): the capture job owns those.

The first matching row wins:

| Condition | `payment_status` |
|---|---|
| nothing was ever paid (online, at the desk, or marked paid before Part E) | `unpaid` |
| everything that was paid has gone back | `refunded` |
| some money went back and some is still kept | `partially_refunded` |
| something is still owed (a part-payment shows from the ledger) | `unpaid` |
| otherwise (paid and nothing owed) | `paid` |

**Take payment** replaces "Mark paid at venue":
- **Who and when:** any staff member, while `owed` > 0 and the appointment is pending, confirmed, in progress or
  completed.
- **Amount:** it defaults to `owed` and cannot exceed it (no overpaying, no tips).
- **Method:** one of the four desk methods, with a note for "other".

**Locking.** Every movement runs in one transaction with a row lock on the booking and re-checks the figures inside
the lock, so a double click cannot record the same money twice.

## 5. Refunds and cancellation

**Refund** (managers only; `SetupAccess::canManage`). The manager enters an amount, how it goes back and a reason
(required):

| How | Allowed | What happens |
|---|---|---|
| Card through Stripe | up to `refundable_online`, only with a real captured PaymentIntent | `StripeService::refund(pi, amount, reason, key)`. The key is `appt-refund-{booking}-{ledger row id}`: the ledger row is written first with `stripe_refund_id` null, and filled in from Stripe's answer. The booking's `refunded_amount`, `refunded_at` and `last_refund_id` move with it. |
| Cash, card at the desk, transfer, other | up to `refundable_desk` | a ledger row only |

- **One refund, one way.** Each refund is one ledger row and one method; a mixed refund is two refunds.
- **Locks.** A Stripe refund runs under the booking's row lock and `AdvisoryLock::within('pi:'…)`, the lock the
  portal and the capture job take.
- **Order.** The refund row and the Stripe call happen inside the transaction. A Stripe failure rolls the row back and
  shows Stripe's reason.
- **Online payments switched off** at the venue refuse a Stripe refund (`refund_unavailable`). A desk refund is still
  possible.
- **A card that is only held** is not refunded: it is released, as today, when the appointment is cancelled (the
  capture job).

**Cancel with refund.** The Cancel confirmation shows what was paid and a refund line:
- **The default** is everything refundable, by the way it was paid: Stripe for the online card, cash for desk
  payments, split into two lines when both exist.
- **A manager** may lower each line, down to nothing.
- **Order, under one lock:** the refunds first, then the cancellation. A failed Stripe refund leaves the appointment
  standing, with the reason shown.
- **A non-manager** can cancel. The confirmation says "€45 was paid — a manager can refund it", and the appointment
  then shows "€45 to refund".
- **The coupon** is still not given back on a staff cancellation, as today. The confirmation already says so.
- **The client's email** is Part D's cancellation message, unchanged: it says nothing about money.

**Points.** When a refund brings what was paid to 0 (`paid_online` + `paid_desk` − all refunds = 0) on a booking with
`points_awarded_at` set, the service reverses that booking's earn transactions once, as stays do, and records it in
the audit log. A part-refund keeps them. A booking refunded before completion earns nothing later, because the award
already skips `refunded`.

**Audit.** Every payment and refund writes an `AuditLog` row with the actor (`service_booking.payment_taken`,
`service_booking.refunded`).

## 6. Member price and coupons when staff book

**Quote.** New appointment asks the server for the price whenever its client, service, person or time changes:
- **The call:** `GET admin/appointments/quote`.
- **For a member:** `ServiceQuoteBuilder::build()` then `MemberPricing::quote(member, list, currency, Services,
  coupon)`. It answers with list, discount (with its label), coupon, total and currency.
- **For a non-member:** the list price, as today.

**Coupons.** `GET admin/appointments/clients/{id}/coupons` lists the member's claimed offers not yet used and reward
codes still `pending`, as the portal shows them. `POST admin/appointments/clients/{id}/coupons/resolve {code}` takes a
code the client shows:
- it goes through `CouponResolver::resolveCode()`, which claims an offer code for that member, as the portal does;
- every lookup asserts the member and the organisation.

**Save.** `POST bookings` gains `coupon` (`member_offer_id` or `redemption_id`) and `expected_total`:
- **The writer** recomputes the quote inside its lock and refuses with 409 `price_changed` when the total differs
  from `expected_total`.
- **It stores** `MemberPricing::columns()` and uses the coupon (`MemberPricing::consume`) in the same transaction.
- **The Idempotency-Key hash** also covers `coupon` and `expected_total`, so a retry with a different coupon is a
  different request. A replay never uses the coupon twice.

**Unchanged:**
- moving an appointment keeps its price;
- the full admin's create keeps the list price (it is not linked to a member);
- points on completion follow `total_amount` (the discounted total), as for portal bookings.

## 7. Screens

**Workspace, appointment panel.** The payment line becomes a Money block:
- **The figures:** total (with "member price" and the discount or coupon named), paid online, card held online, paid
  at the desk, refunded and still owed (or "€X to refund" after a staff cancellation). "Marked paid (no amount
  recorded)" appears for older bookings.
- **The list:** every ledger row, newest first, with method, amount, who, when, and note or reason.
- **Take payment** (staff) opens a step: amount (defaults to owed), method, note.
- **Refund** (managers) opens a step: amount, how, reason. The allowed maximum for each way is shown.
- **The actions** "Mark paid at venue" goes from the server's action list; `take_payment` and `refund` join it with
  the same `allowed` / consequence pattern.

**Workspace, Cancel confirmation.** The refund lines from §5 for managers; the "a manager can refund it" line for
staff.

**Workspace, New appointment.** For a member:
- the price breakdown (list, member discount, coupon, total);
- a coupon picker: the member's coupons, plus "Enter a code";
- the save sends `expected_total`; a `price_changed` refusal shows the new price.

**Workspace, Takings** (new menu item, managers only; `GET admin/appointments/takings?date=`). For a day on the
venue's clock:
- **Totals:** money in, money out and net for each method: cash, card at the desk, transfer, other, refunds through
  Stripe.
- **The list:** every movement (time, client, reference, method, amount, who, note).
- **For reference:** the line "Paid online for this day's appointments: €X" (bookings starting that day with a card
  payment taken).
- **Non-managers:** they do not see the menu item, and the endpoint answers 403 `not_allowed`.

**Full admin, Service bookings.**
- **The drawer:** the Payment dropdown goes. It shows the same Money summary and list, read-only, with
  "Take payment / Refund in HexaTech Appointments" (`/appointments?open={id}`). Its detail answer gains `money`.
- **The bulk bar:** its "Mark Paid" button goes.
- **The API:** `updateStatus` no longer accepts `payment_status`, and `bulk` no longer accepts `mark_paid` (422). Their
  only caller was this page, so no booking can be labelled paid without money behind it.

**Strings:** every new string in the five workspace bundles and the five `common.json`.

## 8. Rollout

No switch. On deploy, for every organisation:
- "Mark paid at venue" becomes "Take payment" (staff) and "Refund" (managers);
- staff bookings for members get the member price and coupons;
- the full admin loses its Payment dropdown and bulk "Mark Paid";
- older bookings labelled paid show "Marked paid (no amount recorded)".

One additive, reversible migration (`service_booking_payments`). No change to the widget, the portal, the capture job
or online payments.

## 9. Edge cases

| Case | Behaviour |
|---|---|
| A card is held for the full total | Take payment is not offered (`owed` = 0); the capture job charges it as today. |
| The capture job charges the held card while a desk payment is being recorded | Not possible: Take payment is refused while a card is held, and the row lock serialises with the job's own lock order. |
| Paid online, then the client also pays cash by mistake | Refused: `owed` is 0 once paid online. |
| Desk payment of €20 on a €45 total | `payment_status` stays `unpaid`; the appointment shows "€20 paid, €25 owed". |
| A refund larger than allowed | 422 `refund_too_large`, with the maximum. |
| A Stripe refund made in the Stripe dashboard | The existing `charge.refunded` webhook (`BookingPublicController::recordServiceBookingRefund`) stores Stripe's cumulative refunded amount in `refunded_amount` and the matching status, so `refundable_online` shrinks. A refund made in the workspace also triggers that webhook, which writes the same cumulative figure. Before the webhook arrives, Stripe answers an over-refund with an error, shown in words. |
| A stale screen (someone changed the appointment) | The same revision check as today's actions: 409 `stale` with the current appointment. |
| Refund on a no-show | Allowed (a manager may give the money back); `owed` is 0 for a no-show. |
| Multiple currencies | One currency per booking; amounts are in the booking's currency. Takings sums by the venue's currency and lists any booking in another currency on its own line. |
| A coupon that stopped applying between quote and save | 409 `price_changed`, with the new price; nothing is used. |
| Points awarded, then a part-refund, then the rest | The second refund brings what was paid to 0; the points are reversed then, once. |

## 10. Testing

**PHP feature tests** (sqlite fixture, as Parts B–D):
- the figures and the status label for every combination in §4, including a held card, an online payment and an older
  booking marked paid;
- Take payment: staff allowed, amount ≤ owed, the note for "other", a double submit records once;
- Refund: managers only (403 for staff); desk and Stripe (a stubbed `StripeService`), the limits, the idempotency key,
  a Stripe failure rolling back, online payments off;
- Cancel with refund: the order (a failed Stripe refund leaves the appointment standing), the staff variant;
- points reversed once on reaching 0, kept on a part-refund;
- quote and save: member price, coupon used once on save and not on replay, `price_changed`, a non-member at list
  price, the coupon list and code resolve scoped to the member and the organisation;
- takings: managers only, the venue's day bounds, totals per method, the online line;
- the full admin: the detail's `money`; `payment_status` and `mark_paid` refused.

**Frontend (Vitest static render):** the Money block, Take payment and Refund steps, the cancel refund lines, the
price breakdown and coupon picker, Takings, the full admin's read-only drawer; the locale families.

**Browser check** as Part D: the local database gets the new table for the check and drops it afterwards (owner's
standing ruling for local checks).

## 11. Documentation

`docs/appointments-workspace.md`:
- a "Money at the desk (Part E)" section: methods, who may, owed, refunds, cancel-with-refund, points, takings, the
  full admin;
- the actions table updated;
- "Deploying it" gains the migration and the full admin changes.

## 12. Not in this part

- No-show and late-cancellation fees.
- Tips and overpayments.
- Gift vouchers as a payment method.
- Card-terminal integration.
- Receipts or invoices.
- Refund emails to the client.
- A staff discount of their own.
- Member price in the full admin's create.
- Editing or deleting a ledger row.
- Takings reports beyond one day (Part G).

## 13. Owner to-do after deploy

- Try Take payment and Refund on a test booking at your own venue.
- Check Takings for that day.
- Book a member in the workspace to see the member price.
