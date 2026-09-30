# Member portal (web) — how it is built and checked

The member portal is the customer-facing half of the SPA: `/portal/*`, one lazy chunk
(`frontend/src/portal/`), served on the admin hosts for users with `user_type = member`.
Spec: `docs/superpowers/specs/2026-09-23-member-portal-v2-design.md`.

A member can view their profile, benefits and booking history; book a service appointment
(phase 2, `## Booking (phase 2)` below) or a hotel stay (phase 3, `## Stays (phase 3)`); and
cancel either kind themselves inside the venue's cancellation window (`## Cancellation (phase 3)`).

## Backend

- `GET /api/v1/member/portal` (`Member\Portal\PortalController`) is the shell's one startup call:
  venue identity + accent tokens (`App\Services\Portal\PortalTheme`, contrast-checked by
  `App\Support\Accent`), capabilities (`App\Services\Booking\BookingCapability`), policies,
  the member summary, counts.
- `GET /api/v1/member/portal/bookings` and `…/bookings/{service|stay}/{id}`
  (`App\Services\Portal\MemberBookingQuery`): the member's bookings across `service_bookings`
  and `booking_mirror`. A booking belongs to the member when, inside their organisation, it
  names their `member_id` (on either table), or a guest linked to them, or simply their email —
  the email rule only once `users.email_verified_at` is set (claiming an account stamps it; a
  self-registered member has no email-matched history until verified).
- The `member/portal` prefix sits behind `member.only` (403 `member_only` for staff tokens,
  403 `portal_disabled` when the `portal_enabled` setting is false).
- Everything else the portal calls is the mobile app's member API, unchanged.
- Public: `GET /api/v1/public/join/{token}` carries `theme`; `GET /manifest.webmanifest?app=portal`
  is the portal's install manifest.

## Frontend rules (enforced by `frontend/src/portal/tokens.test.ts`)

- Only `p-*` colour classes (`bg-p-surface`, `text-p-text-2`, `bg-p-accent/10`, …) from
  `frontend/src/portal/theme/portal.css`; never `dark-*`, `t-*`, `primary-*`, `text-white`.
- Never call `/v1/admin/*`.
- Every string: `t('portal.<key>', 'English fallback')`, with the key in all five
  `frontend/src/portal/i18n/portal.<lang>.json` files (`localeCompleteness.test.ts` and
  `portalLocales.test.ts` enforce it). Industry nouns come from `useVocab()`.
- Light first, dark by OS preference; the accent arrives from the server and is written by
  `applyPortalTheme()`; display face per industry from the self-hosted landing fonts.

## Running it locally

```
cd /c/wamp64/www/<worktree> && /c/wamp64/bin/php/php8.4.20/php.exe artisan serve --host=127.0.0.1 --port=8010
cd frontend && VITE_API_URL=http://127.0.0.1:8010/api npm run dev
```
Open the dev server as **`localhost`**, not `127.0.0.1`: the SPA only uses `VITE_API_URL` when the page's
own hostname is exactly `localhost` (`frontend/src/lib/api.ts`); at `127.0.0.1` it falls back to Vite's `/api`
proxy, which on this machine can reach a *different* checkout's backend. Join a venue at
`http://localhost:5173/portal/join?org=<organizations.widget_token>`.

`CORS_ALLOWED_ORIGINS` (`.env`) must include the dev origin (e.g. `http://localhost:5183`) or the browser
refuses every API call silently. Set it as a process environment variable on the PHP server rather than
editing the shared `.env`.

The local `.env` may point `MAIL_MAILER` at a real remote SMTP transport (a shared setting). Never edit
`.env` for a local pass: run every process (server, `php artisan tinker`, commands) with `MAIL_MAILER=log
QUEUE_CONNECTION=sync LOG_LEVEL=debug` in the process's own environment instead — `LOG_LEVEL=notice` (a
level above `debug`) makes the log mailer write nothing, so `LOG_LEVEL=debug` is not optional if you need
to read a mail afterwards. `QUEUE_CONNECTION=sync` also keeps a test mail out of the shared `jobs` table,
where another checkout's own worker could send it with its own transport.

`php artisan bookings:release-orphan-portal-holds --dry-run` and `php artisan bookings:capture-pending-pis --dry-run` still call
Stripe's list/retrieve API even in dry run, for every Stripe-enabled venue in the shared local database —
always pass `--org=<organisation id>` locally so a run only touches the venue you mean.

Under the Vite dev server the display faces do not load: `/landing/fonts/*.woff2` is served by Laravel
(`public/landing/fonts`), not by Vite, so titles fall back to the next face in the stack. To judge type in a
dev screenshot, serve those URLs from `public/landing/fonts` (a Playwright route does it) or look at a built SPA
on the Laravel host.

## Checks

- Backend: `php artisan test tests/Feature/Member/` (with the PHP 8.4 binary named in `CLAUDE.md`; portal tests live in `tests/Feature/Member/Portal/`),
  plus `tests/Feature/Booking/BookingCapabilityTest.php`, `tests/Feature/Pwa/`, `tests/Feature/Mail/`.
- Frontend: `cd frontend && npx tsc -b && npx vitest run` (3 `plannerMeta` failures are pre-existing).
- Eyes first: screenshots at 390 and 1440, light and dark, against spec §4's quality bar.

## Booking (phase 2)

Spec: `docs/superpowers/specs/2026-09-23-member-portal-v2-design.md` §6. Backend entry point
`App\Http\Controllers\Api\V1\Member\Portal\PortalServiceBookingController`; frontend flow
`frontend/src/portal/pages/book/` (`Book.tsx`, five steps, one lazy chunk).

### Endpoints

- `GET /api/v1/member/portal/services` — `::index()`: catalogue (categories, services, masters,
  extras, rules) plus `member_price` per service (the automatic tier discount only) and the
  automatic benefit summary. Extras carry numeric prices; the public widget's own
  `ServicePublicController::config()` keeps the legacy string form on purpose (unrelated payload,
  not touched).
- `GET /api/v1/member/portal/services/calendar` — `::calendar()`: dates with a working window,
  clipped to `services_max_advance_days`.
- `GET /api/v1/member/portal/services/availability` — `::availability()`: slots for one date.
- `POST /api/v1/member/portal/services/quote` — `::quote()`: itemised price, payment mode, policy
  text. Re-quoting is free.
- `POST /api/v1/member/portal/services/payment-intent` — `::paymentIntent()`: a Stripe
  PaymentIntent for the discounted total (throttled `30,1`).
- `POST /api/v1/member/portal/services/confirm` — `::confirm()`: writes the booking under an
  `App\Support\AdvisoryLock` transaction; requires an `Idempotency-Key` header, 8–80 characters
  (throttled `30,1`).
- `POST /api/v1/member/portal/coupons/resolve` — `PortalCouponController::resolve()`: resolves an
  offer code or a `REW-` reward code (throttled 5/minute per member, limiter `portal-coupon` in
  `App\Providers\PluginServiceProvider`).

### Error codes

| Code | HTTP | Meaning | What the portal does |
|---|---|---|---|
| `not_bookable` | 404 | the venue has no bookable services (`BookingCapability::appointmentsBookable`), or the caller has no `LoyaltyMember` row (the bootstrap's `capabilities.services` is false for the same reason) | `index()` only; shown as a not-bookable notice |
| `not_found` | 404 | the service id is missing, inactive, or belongs to another tenant | generic sentence (`bookErrorFallback`); a confirm attempt is sent back to Review |
| `too_soon` | 422 | the start is inside `services_lead_minutes` of now | booking-window sentence; back to When, `startAt` cleared |
| `too_far_ahead` | 422 | the start is beyond `services_max_advance_days` | same as `too_soon` |
| `extra_lead_time` | 422 | an extra's own lead time cannot be met by the chosen slot | sentence; confirm sends back to Review |
| `slot_taken` | 409 | the scheduler's slot was just taken (`ServiceQuoteBuilder` throws `SlotTakenException`, shared with the widget), or the start does not exist on the venue's clock (the hour a daylight-saving change skips — refused in `buildQuote()` before anything is priced or reserved) | back to When, `startAt` cleared |
| `coupon_not_found` / `coupon_used` / `coupon_expired` / `coupon_wrong_tier` / `coupon_no_capacity` / `coupon_untyped` | 422 | the selected or typed coupon does not resolve (`CouponException::$errorCode`) | Review's `afterQuoteError()` clears `state.coupon` and shows the matching sentence |
| `no_membership` | 422 | the caller has no provisioned `LoyaltyMember` yet (`quote`, `payment-intent`, `confirm`) | generic sentence; confirm sends back to Review |
| `payment_required` | 422 | payment mode is `online` but no `payment_intent_id` was sent | generic sentence; nothing to release |
| `pay_at_venue` | 409 | the quote's payment mode is not `online` (`payment-intent` only) | the Pay step skips Stripe |
| `nothing_to_pay` | 409 | the discounted total is 0 | same as `pay_at_venue` |
| `payment_unavailable` | 503 | Stripe threw while creating the intent | member is asked to retry |
| `payment_mismatch` | 409 | the PaymentIntent's org/member/service/slot/amount/status do not match at `verify()`, it already pays for another booking (`assertUnused()`, or the unique index refusing the insert — then nothing is released), or the mode no longer needs it | the hold is released unless a booking already carries the intent; back to Review |
| `payment_mismatch` (re-check) | 409 | `writeBooking()`'s own re-read of the intent, under the `pi:` lock right before the row is written, finds it no longer payable (cancelled by a concurrent confirm, or reached by the sweeper) | logs a `ServiceBookingSubmission` failure row (`error_message = payment_not_payable`); the intent is **not** released — this code cannot prove it is dead, only that it cannot confirm it is still payable; back to Review |
| `payment_check_failed` | 503 | the Stripe retrieve itself failed (threw, or returned nothing) at `verify()` or at the re-check under the `pi:` lock (`PaymentUnverifiable`, not a mismatch) | logs a failure row (`error_message = payment_check_failed`); nothing released, cancelled or written, coupon untouched; the member confirms again with the same intent |
| `idempotency_key_required` | 422 | the `Idempotency-Key` header is missing or the wrong length | rejected before anything runs |
| `idempotency_conflict` | 409 | the same key was already used for a different request body | stays on Pay; the same confirm is retried |
| `confirm_failed` | 500 | an unexpected exception during confirm | hold released; back to Review |

### Pricing — `MemberPricing` over `DiscountService::quoteForBooking()`

The list total comes from the shared `ServiceQuoteBuilder` (service price, master override
respected, plus extras). Automatic tier benefits apply only when their `applies_to` is `all` or
the booking's `BookingScope` (`services` here); a coupon (one claimed offer or one typed reward
code) is a candidate only when the member selected or entered it — nothing is applied silently.
The best single rule wins and nothing stacks; when the automatic benefit beats the chosen coupon,
the quote reports the coupon as `outbid` and it is never consumed at confirm. The server
recomputes the whole quote three times — at `quote()`, at `paymentIntent()` (both through the
shared `buildQuote()`), and again inside `confirm()`'s advisory-lock transaction — and the client
never sends a total.

### Coupon codes

Offer codes (`special_offers.code`, nullable, unique per organisation, 4–24 uppercase characters)
resolve through `CouponResolver::resolveOfferCode()`: active offer, correct `tier_ids`, capacity,
and the per-member limit — enforced by construction (`member_offers` is unique on
`(member_id, offer_id)`, so a member can hold at most one claim), not by counting. Reward codes
(`REW-…`) resolve through `resolveRewardCode()` to the member's own pending
`RewardRedemption`; only a redemption whose reward has a typed `discount_type`/`discount_value`
is a coupon. Refusal codes: `coupon_not_found` (code doesn't exist, or belongs to someone else),
`coupon_wrong_tier`, `coupon_expired`, `coupon_used`, `coupon_no_capacity`, `coupon_untyped` (the
offer or reward has no money value).

### Booking window

`services_lead_minutes` (default 60) and `services_max_advance_days` (default 60, floored at 1)
are enforced server-side for the portal in `calendar()`, `availability()` and `buildQuote()`
(`too_soon` / `too_far_ahead`). Days count from the venue's own "today"
(`PortalBootstrap::timezone()`, the `venue.timezone` the bootstrap sends), not the application's.
The scheduler's own `reserveSlot()` does not enforce either rule, so
`buildQuote()` checks them itself before any quote or PaymentIntent can be produced. The public
widget is unchanged.

### Appointment times — `App\Services\Portal\AppointmentClock`

`service_bookings.start_at`/`end_at` store the **venue's wall clock**, and the scheduler (shared with the
public widget, admin and chat) builds and labels a slot the same way: `{"start":"2026-10-01T10:00:00+00:00",
"time_label":"10:00"}` means 10:00 on the venue's clock, whatever the `+00:00` says — the offset is not the
zone, it is an artefact of how the shared code formats a timestamp with none. The portal alone turns that
into a true instant, and only at its own API boundary: `AppointmentClock::toInstant()`/`iso()` read the
stored digits and attach the venue's real offset on the way out; `fromClient()` reads what the browser sent
back and re-derives the exact `+00:00` form the scheduler would have produced, on the way in — nothing
shared ever sees or stores an offset that means anything.

**Where the zone comes from.** `PortalBootstrap::timezone()` is the one place the venue's zone is decided
(`AppointmentClock::zoneFor()` asks it, once per organisation per request; the bootstrap sends it as
`venue.timezone`). It has two sources, in this order: the zone the venue set in Settings → General →
Timezone (`hotel_settings.hotel_timezone`, seeded `UTC`; the stays engine reads the same setting), then
`organizations.timezone` (defaults to `UTC`; no admin screen writes it). Both are free text, so each is read
through `PortalBootstrap::namedZone()`: a named zone with a location counts (`Europe/Riga`, and a legacy name
such as `US/Eastern`, kept as written); any name of UTC (`UTC`, `Etc/UTC`, `Zulu`, `GMT`, … in any case)
counts as `UTC`; an abbreviation (`EET`, `CEST`, `PST`, `Z`), an offset (`+03:00`) and anything PHP does not
know do not count, because PHP reads the first two as a fixed offset without daylight saving and a browser
reads them differently or not at all. The first source that names a zone other than UTC wins; otherwise a
source that says `UTC` gives `UTC` (a venue may really be on UTC); only when neither names a zone does the
application's own zone (`UTC`) stand in. An owner's change in Settings → General is followed on the next
request: the settings map is cached but flushed when a setting is saved (on a per-instance cache store,
another instance follows when its own entry expires, within thirty minutes — see "After a deploy").

**What a venue sees change when it sets its zone** (it was `UTC` in Settings, or the field was left at its
seeded value, and is now a real zone): "today" and the booking window (`too_soon`, `too_far_ahead`, the stay
quote's earliest date) count on the venue's clock; slots that are already past on the venue's clock are no
longer offered; an appointment moves to "past" at its real end; both cancellation deadlines (an
appointment's: start minus `services_cancel_hours`; a stay's: check-in time minus `booking_cancel_hours`) are
computed on the venue's clock, so for a Riga venue a deadline that was computed as 15:00 UTC is now 15:00
Riga, three hours earlier as an instant in summer; the calendar file a member downloads carries the real
instant; the day `php artisan bookings:award-stay-points` judges a stay's departure on is the venue's own. What does not
change is what the member reads: an appointment's digits are shown as they are stored, because the client
formats the true instant in the venue's zone. A portal tab that is already open when the zone changes shows
shifted times until its startup call (`GET member/portal`) is fetched again — a reload does it. At a venue
whose zone resolves to `UTC` (both sources `UTC` or unusable), `AppointmentClock` is the identity and the
portal counts "today", the booking window and the cancellation deadlines in UTC.

Portal decisions that use the true instant: `availability()`'s slot filtering (too-soon/too-late, and
dropping a slot the venue's clock skips on a daylight-saving change); `buildQuote()`'s `too_soon`/`too_far_ahead`
checks; `quotePayload()`'s and the confirm response's `start_at`/`end_at`; `MemberBookingQuery::serviceDto()`'s
`starts_at`/`ends_at` and the upcoming/past split; `CancellationPolicy::forService()`'s deadline. `storedStart()`
in the controller turns the client's value back into the stored (venue-clock) form before anything else runs.
A stay's own dates (`arrival_date`/`departure_date`, plain calendar days) and `CancellationPolicy::forStay()`'s
check-in-time zone are unaffected — stays never had this problem.

**Known limits outside the portal**, all pre-existing and unchanged by this: the admin SPA and the public
widget's own booking summary still show an appointment time in the *browser's* zone, read from the same
`+00:00` string; the shared extra-lead-time check (`ServiceQuoteBuilder::extraLines()`) still reads the
stored digits as UTC (lenient east of UTC, strict west of it); the ChatGPT/MCP booking list
(`app/Mcp/Support/CustomerBookingAccess.php`) still emits `start`/`end` as `+00:00` on wall-clock digits.
None of these is the portal's to fix without the owner's ruling on the shared scheduler.

### Payment

The payment mode comes from the quote (`payment.mode`, computed by
`App\Services\Portal\PortalBootstrap::paymentMode()`): `at_venue` when Stripe is off
(`payments_off`), when `booking_mock_mode` is on (`mock_mode`), or when the service's currency
differs from `stripe_currency` (`currency_mismatch`); `online` otherwise. The frontend requests at
most one PaymentIntent per Pay-step visit (`steps.ts`'s `PayVisit`, keyed on a per-visit nonce).
`PortalPaymentIntentGuard::verify()` binds an intent to exactly one slot and one booking by
checking its metadata (`org_id`, `member_id`, `service_id`, `start_at`) and amount before confirm
trusts it, and `assertUnused()` refuses one that already pays for another `ServiceBooking` in this
organisation. The hold is released (`guard->release()`, via the controller's `fail()`) on every
failed confirm exit that has a `payment_intent_id`, but `carried()` — a booking in this
organisation already has this `stripe_payment_intent_id` — means it is never touched, however the
failure was reached. Redirect-based payment methods are off (`allow_redirects: 'never'` on
`StripeService::createPaymentIntent()`): the portal has no return URL to redirect back to, so a
redirect method would strand the member. The `Idempotency-Key` header (8–80 chars) is hashed with
the canonically-sorted request body; a replay of the same key and body returns the stored booking
DTO, a replay with a different body answers `idempotency_conflict`; the lookup runs again inside
the lock, so a same-key request that waited there replays the first booking rather than answering
`slot_taken`. Capture is left to the existing `php artisan bookings:capture-pending-pis` job, same as widget
bookings — which skips a service booking still `pending` and never captures a cancelled one (below).

### One payment, one service booking

**The rule.** Within one organisation a payment intent id appears on at most one row of `service_bookings`.
The database holds it as a partial unique index, `service_bookings_org_pi_unique`, on
`service_bookings (organization_id, stripe_payment_intent_id)` where `stripe_payment_intent_id IS NOT NULL AND
stripe_payment_intent_id <> ''` — a booking with no payment (NULL or the empty string) is exempt, and the same
id in another organisation is another organisation's own. It binds every writer of the column: the member
portal's service confirm and the public services confirm (`POST /api/v1/services/confirm`). The other writers
of `service_bookings` (the chat widget's booking, the admin screens, the capture job, cancellation and refund)
write no payment id or only read it. Stays are not covered: a stay's payment id lives in `booking_mirror`.

**The migration.** `2026_10_01_100000_service_bookings_unique_payment` creates the index and nothing else. It
is guarded and never fails a deploy on data it did not expect: with no `service_bookings` table or no payment
column it returns; with the index already there it returns; if an organisation already has the same payment id
on two or more bookings, it creates nothing, edits nothing and writes one warning to the application log,
`service_bookings_unique_payment: service_bookings holds repeated payment references; the unique index was not
created`, naming up to 20 organisations (`organizations`) and the number of repeated (organisation, payment)
pairs it found, at most 20 (`count`); if the `CREATE` itself fails (say a repeat is written between the scan and
the statement) it is rolled back to its own savepoint and a warning `service_bookings_unique_payment: creating
the unique index failed; the unique index was not created` carries the database error. In every one of those
cases the migration is recorded as run and the deploy goes on. Empty-string payment ids never stop it, and it
never edits one. `down()` drops the index when it exists. See "After a deploy" for how to tell whether the
index exists and what to do when it does not.

**What a caller gets.**

- The public services confirm answers a payment that a booking of the organisation already carries with
  HTTP 409 and `{"error": "This payment has already been used for a booking."}`. It looks first, inside the
  booking transaction after the slot is reserved and right before the insert, and the index answers the same
  for two requests at the same moment (it refuses the second insert; the controller answers a unique violation
  in these words only when the request carries a payment id and either the violated columns include
  `stripe_payment_intent_id` or a booking of the organisation now carries that id). The rule holds for a mock
  payment id (`pi_mock_…`) as much as for a real one. Nothing is cancelled, refunded or captured for the
  refused request, no mail is sent, and the failed submission is logged with the reason `payment already used`.
  Any OTHER unique violation (a booking reference, say) keeps the endpoint's general answer.
- The member portal's service confirm answers the same case 409 `payment_mismatch` ("The payment no longer
  matches the price. Please pay again."), releasing nothing: the payment belongs to the booking that carries
  it. Any other unique violation there stays a 500 `confirm_failed` with the hold released.
- An honest retry with the same `Idempotency-Key` is answered by the replay as before (the replay runs before
  the payment check), with the booking that was made and `replayed: true`.
- When something else fails first (a taken slot, an extra's lead time, a payment that is not completed, Stripe
  not answering), the request gets that answer: the check sits right before the insert.

### Payments an operator must handle by hand

A cancellation the MEMBER makes returns the money itself (see `## Cancellation (phase 3)`) — nothing
below applies to a member-cancelled booking. These bullets cover bookings STAFF cancel after the
payment was already captured, for both kinds:

- **Refunding a captured booking staff cancelled after capture.** Nothing refunds automatically. When
  a service booking is `cancelled` or `no_show`, or a stay's `booking_state`/`internal_status` is
  `cancelled`, but its PaymentIntent already `succeeded`, the capture job (`php artisan bookings:capture-pending-pis`)
  leaves the row as it is and writes one `AuditLog` row — `service_booking.capture.needs_refund`
  (subject `service_booking`, the booking id) or `booking.capture.needs_refund` (subject
  `booking_mirror`, the mirror id). Decide whether a refund is due under the venue's cancellation
  policy and refund it in the Stripe dashboard (Payments → the intent id from the audit row →
  Refund). A staff-cancelled booking whose card is still only held is handled for you: the job cancels
  the hold and writes `service_booking.capture.cancelled_booking` / `booking.capture.cancelled_booking`.
  A stay's group of rooms (one PaymentIntent for several rows) is decided once per intent, not once
  per row.
- **A card hold left by a browser that closed between authorisation and confirm.** No booking row
  carries the intent, so the capture job cannot see it. `php artisan bookings:release-orphan-portal-holds` runs
  every thirty minutes and releases one from 45 minutes after the card was actually authorised
  (default; `--minutes` floored at 20) — age is measured from the authorisation itself (the latest
  charge's own time), not from when the intent was created, and an intent still `requires_capture`
  whose charge cannot be read back from Stripe is never released (it fails closed rather than guess).
  A release writes `portal.hold.orphan_released`. `php artisan diag:orphan-stripe-pis --org=<organisation id> [--hours=24] [--json]`
  lists every payment no booking carries, for a manual look.
- **A refund made in the Stripe dashboard for a service booking's payment.** The `charge.refunded`
  webhook records it on the booking from the charge's own cumulative `amount_refunded` (never from a
  possibly-unordered `refunds` list, and never moving the stored amount backwards on a re-delivered or
  out-of-order event) — including a service booking with no member, which used to be logged and
  otherwise ignored.
- **What `pending` means for capture.** With `services_require_staff_confirmation` on, a portal booking
  is written `pending`; the capture job skips it, and captures it on the first run after staff
  confirm it (every ten minutes, while the booking is between five minutes and six days old). If
  staff never confirm it — or confirm it after six days — the hold lapses uncharged; staff should
  confirm or cancel pending paid bookings promptly.

### After confirm

`App\Services\Booking\PortalBookingNotifier::notify()` runs four side effects after the booking is
committed, each in its own try/catch that only logs a warning on failure (`portal.confirm_mail_failed`,
`portal.confirm_admin_mail_failed`, `portal.confirm_realtime_failed`, `portal.confirm_audit_failed`):
the member's `ServiceBookingConfirmationMail` (queued), the venue's `AdminBookingNotificationMail`
(via `AdminNotificationService`), a `service_booking.created` realtime event, and an `AuditLog` row
(`service_booking.portal_confirmed`). A failing side effect never fails an already-committed
booking.

### Points on completion

`App\Services\Loyalty\BookingPointsService::awardForServiceBooking()` computes
`LoyaltyService::pointsForSpend()` on the booking's discounted `total_amount`, guarded by the
`points_on_bookings` setting (default on) and the loyalty capability. It is called explicitly —
never by a model observer — from both `App\Http\Controllers\Api\V1\Admin\ServiceBookingController`
endpoints that can complete a booking: `PATCH /api/v1/admin/service-bookings/{id}/status` and
`POST /api/v1/admin/service-bookings/bulk` (action `mark_complete`, or `mark_status` with
`value: 'completed'`), because `bulk()` writes
through the query builder and fires no model events. Idempotent on the booking's own
`points_awarded_at` timestamp and the ledger's `booking_points_service_{id}` key; a zero-point
completion still stamps `points_awarded_at` so it is never retried. Refunded or zero-amount
bookings award nothing.

### Admin fields and `php artisan loyalty:type-benefits`

Tiers → assign benefit gains `value_type` / `value_amount` / `applies_to` (`TierBenefit`); the
Offers form gains `code`, `tier_ids`, `per_member_limit` and `applies_to` (`SpecialOffer`, types
`discount` and `fixed_amount`); the Rewards form gains `discount_type` / `discount_value` /
`applies_to` (`Reward`). `php artisan loyalty:type-benefits [--org=<organisation id>] [--all] [--apply]`
(`App\Console\Commands\TypeBenefits`) parses existing prose values of the exact forms `NN% off …`
and `<currency>NN off …` into these typed fields; dry run by default (prints the plan as a table,
for one organisation with `--org=<organisation id>` or for all without it), only `--apply` writes, and `--apply`
refuses to run without `--org=<organisation id>` unless `--all` is given (a write across every organisation must
be asked for by name).

### Tests

- `tests/Feature/Booking/Phase2MigrationTest.php` — the migration, guarded and idempotent.
- `ServiceQuoteBuilderTest.php`, `ServiceCatalogueTest.php` — list totals and the shared catalogue.
- `DiscountServiceBookingTest.php` — scope filtering, the explicit-coupon rule, an outbid coupon
  left unconsumed, the discount cap.
- `MemberPricingTest.php` — the quote/columns/consume wrapper.
- `tests/Feature/Member/Portal/PortalCouponTest.php` — offer/reward code happy paths and every
  refusal, the throttle.
- `PortalServiceCatalogueTest.php` — the portal's `index()`/`calendar()`/`availability()`.
- `PortalServiceBookingTest.php` — quote/payment-intent/confirm end to end: idempotent replay, a
  replay with a different body, a PaymentIntent mismatch, a slot race, a cross-tenant service id,
  pending-vs-confirmed status.
- `BookingPointsServiceTest.php` — the formula, idempotency, loyalty-off venues, refund reversal.
- `tests/Feature/Admin/{TypedBenefitsTest,OfferCodesTest,TypeBenefitsCommandTest,ServiceBookingPointsTest}.php`
  — the admin forms and the points endpoints.
- `tests/Feature/Loyalty/OfferSecurityTest.php` — the §6.7 security fixes.
- `tests/Feature/Booking/CapturePendingPaymentIntentsTest.php` — the capture job skips a pending
  service booking, cancels the hold of a cancelled one, flags a captured cancelled one once.
- `tests/Unit/Support/AdvisoryLockTest.php`, `tests/Unit/Portal/PortalIntentLockOrderTest.php` — the
  intent lock (structural: sqlite never runs it); `tests/Unit/Booking/PortalPaymentIntentGuardTest.php`
  — zero-decimal amounts.
- Frontend: `frontend/src/portal/pages/book/{book,review,pay,steps,payOutcome,stripePaymentMountedRef,stepStrip,bookNotice}.test.{ts,tsx}`.

Two harness limits to know: tests run on in-memory sqlite, so `AdvisoryLock`'s
`pg_advisory_xact_lock` never actually runs — a plain transaction stands in for it. Frontend tests
render to a string (`renderToStaticMarkup`), so `useEffect` and event handlers never run; the
decisions those effects would make (which sentence to show, whether to clear the coupon or the
slot, which step to bounce back to, where focus goes after a step change) live in pure functions —
`bookReducer()` (every state transition of the flow; `Book.tsx` uses it through `useReducer`, so no
handler spreads a stale `state`), `afterQuoteError()`, `afterConfirmError()`, `focusTargetFor()`,
`payOutcome()`, `canLeavePay()`, `newPayVisit()` in `frontend/src/portal/pages/book/steps.ts` and
`payOutcome.ts` — and are unit-tested directly.

### Testing a payment locally

Set Stripe TEST keys on the local venue: Settings → Integrations & API → Stripe
(`stripe_publishable_key`, `stripe_secret_key`, `stripe_currency`). Turn `booking_payment_enabled`
on and `booking_mock_mode` off, and make sure `stripe_currency` equals the services' own currency
(`services_currency` or the service's own) — a mismatch quotes `at_venue` even with Stripe on. Use
card `4242 4242 4242 4242`, any future expiry and any CVC. Never write a key value into this
document.

Local rig note: this worktree's `frontend/node_modules` is a real directory (not a junction, since
2026-09-27) that holds the two Stripe packages (`@stripe/stripe-js`, `@stripe/react-stripe-js`); a
deploy artifact's build must link to it, or run its own `npm install`, rather than assume the main
checkout's `node_modules` has them.

## Stays (phase 3)

A member books a room at `/portal/book/stay` in four steps: dates and party, room, review, pay
(`frontend/src/portal/pages/stay/`, `StayBook.tsx`, `staySteps.ts`). Backend entry point
`App\Http\Controllers\Api\V1\Member\Portal\PortalStayBookingController`.

| Endpoint | What it does |
|---|---|
| `GET member/portal/stays` | active rooms, extras, policies, currency, the member's automatic benefit, the payment mode |
| `GET member/portal/stays/availability?check_in&check_out&adults&children` | free rooms with the list total and the member's total; `party_too_large: true` when nothing single-room fits but the engine could offer a combination |
| `POST member/portal/stays/quote` | the engine's quote at the member's price; writes a hold that names the member |
| `POST member/portal/stays/payment-intent {hold_token}` | a PaymentIntent for the hold's total; extends the hold to fifteen minutes |
| `POST member/portal/stays/confirm {hold_token, payment_intent_id?, special_requests?}` | books through `BookingEngineService::confirm()` |

**What is sold.** Single rooms only. The engine can offer two or three rooms together to a large
party; the portal does not sell those (`confirmCombo()` has no room lock and no re-checks) and
`availability` reports `party_too_large` instead. The room/Smoobu half and the membership half of
"can this venue's stays be booked" are two separate checks, in two different places:
`BookingCapability::staysBookableOnline($orgId)` answers only whether the venue has an active room
and the Smoobu integration switched on — nothing about membership. `capabilities.stays` in the
bootstrap payload (`GET member/portal`) is `$hasMember && staysBookableOnline($orgId)`
(`PortalBootstrap::capabilities()`). Inside the stays endpoints themselves the same split is explicit:
`PortalStayBookingController::notBookable()` (used by `index()` and `availability()`) and
`notBookableFor()` (used by `quote()`, `paymentIntent()`, `confirm()`) both check
`staysBookableOnline()` first, then separately call `MemberProvisioner::ensureForUser()` for the
membership half — see the error table below for which code each answers. Whatever the industry,
every industry now has a membership preset (see "Admin fields" below).

**The hold.** Every quote writes a new row in `booking_holds` (ten minutes; fifteen once a payment
intent is requested). The hold payload carries `member_id`, `list_total`, `discount`,
`discount_source`, `discount_source_id`, `discount_label`, `coupon`, `channel_name = "Member portal"`,
and `gross_total` is the member's total — what the payment charges, the mirror stores and Smoobu is
told. A hold reserves nothing: availability counts bookings. Only the member who owns a hold can pay
for it or confirm it; anyone else gets 404 `hold_not_found`. Three separate things keep a member-priced
hold away from the public widget: `BookingEngineService::confirm()` refuses a hold whose payload names
a member when no portal hooks are passed, which protects the public `booking/confirm`; the public
`booking/payment-intent` has its own check on `$hold->payload_json['member_id']` and answers as an
unknown hold, with no Stripe call; and the `payment_intent.succeeded` webhook's own orphan recovery
never calls `confirm()` at all — it writes a `booking_mirror` row itself, found by the intent's
metadata key `hold_token`, which a portal intent's metadata never carries (only `portal_hold_token`),
so the recovery simply never sees a portal payment. Never add `hold_token` to a portal intent's
metadata.

**Booked once.** A hold is consumed by the confirm that books it and remembers the stay it became
(`payload.mirror_id`). A second confirm of the same hold answers that stay with `replayed: true`.
There is no `Idempotency-Key` header on this endpoint — the hold is its own idempotency key.

**The engine.** `BookingEngineService::confirm()` is still the one writer of a stay; the portal never
writes a mirror itself. For a hold that names a member it stores the member, the discount and the
special requests on the mirror, names the channel `"Member portal"`, and sends Smoobu the discounted
price with the discount taken off the accommodation line. The portal passes it a `PortalStayHooks`
object: `beforeReservation()` runs inside the room lock (`room:{org}:{unit}`, taken by the engine)
and after the hold row itself is locked (`lockForUpdate`), before Smoobu is asked — it takes `pi:`
(always the last lock, never held while taking a row or slot lock), re-checks the payment under it
(`assertStillPayable()`) and consumes the coupon; `afterMirror()` runs after the mirror is written and
gives the coupon the stay's own reference, `BM:{mirror id}` (`PortalStayHooks::couponReference()`) —
not `booking_reference`, which the PMS sync and `php artisan bookings:retry-pms-sync` can rewrite. `MemberCancellation` and the capture cron follow the same
rule (their own row lock first, `pi:` last) — see `CLAUDE.md`. A refusal before the PMS is asked costs
nothing; a Smoobu rejection rolls the coupon back. On replay
(an already-consumed hold), a second authorised PaymentIntent this request supplied is released;
the capability gate (`notBookableFor()`) is applied AFTER the replay branch, so a venue that switched
stays off still answers a booked hold with its booking.

**Payment.** The PaymentIntent's metadata is `kind = portal_stay_booking`, `org_id`, `member_id`,
`portal_hold_token`, `total` — not `hold_token`, which belongs to the public widget's intents. Confirm
checks the organisation, the member, the hold and the amount (`PortalPaymentIntentGuard::verifyStay()`),
then re-checks the intent is still payable under the `pi:` lock right before the coupon is consumed
and the PMS is asked (`assertStillPayable()`) — a different request's failed confirm may have
cancelled it in between. The card is held at confirm (`payment_status = authorized`) and captured by
`php artisan bookings:capture-pending-pis` within ten minutes. A stay paid at the venue stores
`payment_status = open`, `payment_method = pay_at_venue`.

**The Smoobu sync** keeps what the portal wrote: the channel name, the member's guest link, a
payment status of `refunded`, `partially_refunded`, `disputed`, `cancelled` or `authorized`, a
member's online payment that Smoobu reports as unpaid, and a cancellation made here.

**Points** for a stay are awarded by `php artisan bookings:award-stay-points` (daily, 04:15) the day after
departure, once, on the venue's own "today". Earned when `payment_status` is `paid`, or `open` with
`payment_method = pay_at_venue` (the venue collects at the desk); every other status
(`authorized`, `pending`, `capture_expired`, `invoice_waiting`, `channel_managed`) earns nothing and
is left unstamped, so a stay that is captured late is picked up and awarded on a later run — the
command only looks at stays whose departure date is within the last 60 days, so an unstamped row is
not rescanned forever. Off entirely when the venue's `points_on_bookings` setting is off, or loyalty
itself is off.

**Frontend.** Routes `/portal/book` (chooser), `/portal/book/stay`, `/portal/book/appointment`
(`frontend/src/portal/PortalApp.tsx`, `BookEntry.tsx`). After the card is authorised, the pay step
never offers a second payment or a new card form unless the server's own refusal is one it is known
to have released (`afterStayConfirmError()` in `staySteps.ts`: `room_unavailable`, `invalid_stay`,
`hold_expired`, `price_changed`, `pms_unavailable`, `not_bookable`, any `coupon_*` code, or
`payment_mismatch`); every other code — `confirm_failed` included — keeps the member on Pay with a
"contact the venue, check Bookings" message, because the booking may already exist. `payment_check_failed`
is its own case within that: the server released nothing and did not touch the payment either way, so
the member sees its own sentence and a plain retry of the same confirm (`stayPayNoticeKind()`), never the
"contact the venue" wording — retrying is always safe for this one code. A pay-at-venue member (never
authorised anything) sees an unpaid-specific wording for both `contact` and `retry`, since neither
sentence may claim a card exists.

## Cancellation (phase 3)

`POST member/portal/bookings/{kind}/{id}/cancel` — the member's own booking (ownership through
`MemberBookingQuery::find()`, the same rule the booking list uses), while `can_cancel` is true.
Backend: `App\Services\Booking\MemberCancellation` (`cancelService()`, `cancelStay()`), the policy in
`App\Services\Booking\CancellationPolicy`, the controller
`App\Http\Controllers\Api\V1\Member\Portal\PortalBookingController::cancel()`.

| | Appointment | Stay |
|---|---|---|
| Status | `pending`, `confirmed` | `new`, `confirmed`, `pending_pms_sync` |
| Also | payment not refunded, partially refunded, disputed or channel-managed | booked directly (`channel_name` `Website` or `Member portal`), not part of a room group (`booking_group_id` null), payment not refunded, partially refunded, disputed or channel-managed |
| Until | start − `services_cancel_hours` (default 24) | arrival at the check-in time (default 15:00), venue time zone, − `booking_cancel_hours` (default 48) |

The "Also" row is one shared list (`CancellationPolicy::MONEY_TOUCHED`) used by both `forService()`
and `forStay()` — `channel_managed` is listed for appointments too even though nothing in the
codebase sets a service booking's `payment_status` to `channel_managed` today.

Both hours are set in Settings → Booking, shown for every industry (the tab reads "Booking Engine"
for a venue with rooms, "Booking" otherwise). The policy TEXT next to them is what members read; the
hours are what is enforced.

**Order — a service booking.** One database transaction, the row locked (`lockForUpdate`) for its
whole length, plus the `pi:` advisory lock around any real PaymentIntent: the policy is checked, the
money is given back (`ServiceBookingRefund::giveBack()`), then the booking row is written cancelled
together with the refund columns, the coupon released and the points reversed — all inside that one
transaction. If the money cannot be returned the whole transaction rolls back: the booking stays
exactly as it was and the member is told to try again (502 `refund_failed`). `giveBack()` retrieves the
PaymentIntent with its latest charge expanded, so it can see a refund already made from the dashboard
before ever asking Stripe for another (capped at the charge's own captured amount, when Stripe reports
one, so a stray over-refund is never recorded); a key that may not read charges, or a request Stripe
refuses to expand, retries once without the expand and simply skips that pre-check — Stripe's own
"already refunded" answer to the refund call itself still catches it. A charge Stripe (or a staff member,
from the dashboard) already refunded in full ends as a normal `refunded` cancellation, not an error. A
booking whose money is already recorded as returned in full (`payment_status = refunded`,
`refunded_amount` ≥ the total — our own earlier refund or the `charge.refunded` webhook) but which was
never cancelled is finished the same way, with no Stripe call, as long as its status and deadline still
allow it; partially refunded or disputed stays `not_cancellable`. `cancelService()` refuses to run for
any organisation but the one it was called for (a programming guard, not a member-facing error).

**Order — a stay.** `cancelStay()` does NOT run start to finish inside one transaction, because an
already-captured payment's refund must survive even if a later write in the same request fails.
It runs in phases, guarded by a non-blocking app lock (`cancel_in_progress` 409 on a concurrent
retry): (1) a short transaction locks the mirror row, checks the policy, and — for a real
PaymentIntent — re-reads it under the `pi:` lock; a card that is only held is cancelled and the
cancellation is written and committed right there; a captured payment defers to phase 2; (2) for a
captured payment, `BookingRefundService::applyRefund()` runs completely OUTSIDE any transaction —
the same call and the same `refund:` lock the staff refund path and the `charge.refunded` webhook
use — so a failure after Stripe has already been called still leaves a real, committed refund
record behind; (3) a second short transaction writes the cancellation columns (never the money
columns phase 2 already wrote), releases the coupon and reverses whatever points are still
unreversed. A retry after a failure between phases 2 and 3 recognises the stay's money is already
back in full and finishes the cancellation with no second Stripe call — a member simply cancelling
again repairs it. That is decided on `cancelled_at` (only a member's cancellation sets it), not on
`internal_status`/`booking_state`, which the PMS sync rewrites to `cancelled` within seconds of the
refund's own PMS cancellation; a stay with `cancelled_at` set is `already_cancelled`. The one exception:
a stay whose statuses already say cancelled, refunded in full, with no `booking.member_cancel_started`
audit row (the marker phase 2 commits right before it asks for the refund) was cancelled and refunded
by staff — `already_cancelled`, nothing written. A refund recorded on a stay that still stands (dashboard,
webhook) converges without a marker, as an appointment's does. The booking DTO's `can_cancel` /
`cancel_deadline` come from the same decision (`MemberCancellation::policyFor()`). Phase 2 reads the
row again first: money already back in full goes straight to phase 3; anything else that is no longer
`paid` with nothing refunded (a staff partial refund, a dispute, landed in the gap) is `not_cancellable`,
with no Stripe call. Stripe's `charge_already_refunded` answer re-reads the row too and, when the refund
is already recorded, goes straight to phase 3. Phase 3 re-checks `cancelled_at` under its row lock
(`already_cancelled` if another instance finished it meanwhile — no second audit row, coupon release or
mail). The PMS cancellation for the released/none paths runs AFTER the commit, best
effort, audited on failure as `booking.pms.cancel_failed`. One audit row per successful cancellation:
`booking.member_cancelled` (stays; written inside `MemberCancellation`) or
`service_booking.member_cancelled` (appointments; written by the notifier below, since
`cancelService()` writes no audit row of its own).

| The payment | What happens | `payment_status` after |
|---|---|---|
| none online | nothing | unchanged |
| a held card | the intent is cancelled | `cancelled` |
| taken | refunded in full | `refunded` |

**What both sides hear** (`App\Services\Booking\PortalCancellationNotifier`, run after the
cancellation is committed — a failure here never undoes it). The member gets `BookingCancelledMail`
— unless a stay's own refund mail already told them the same thing (`memberMailed`) — at the booking's
contact email, or at the member's own account email when the booking has none. The venue gets
`AdminBookingCancelledMail`, a realtime event `booking.cancelled`, and the audit row named above. When
the PMS refused the stay's cancellation or could not be reached (`CancellationOutcome::$pmsCancelled`
false), the venue's mail says the reservation could NOT be cancelled in the booking system and must be
cancelled there by hand, instead of "The time is free to book again".

`points_reversed` is counted in one place (`MemberCancellation::reverseAndCount()`), the same on every
path: the points of the booking's awards that stand reversed once the cancellation is written —
including what `BookingRefundService::applyRefund()` reversed while returning a stay's money.

**A coupon comes back** only when the row still says this booking used it (`member_offers.used_reference`,
or the redemption's note). A claim marked used at the counter, or by a later booking, is left alone. A
stay's coupon is found by `BM:{mirror id}`, and — for a stay booked before that reference existed — by
its booking reference; an appointment's by its booking reference.

**`php artisan bookings:retry-pms-sync` never undoes a member's cancellation**: before asking Smoobu it checks
`cancelled_at` (only a member's cancellation sets it) and skips such a row; its write (success or
failure) is refused only when `cancelled_at` was set meanwhile, and a reservation Smoobu created during
that call is cancelled again (`booking.pms.cancel_failed` audit row if that fails too). Every other row —
a public booking, even one whose status says cancelled — is handled exactly as before this phase.

**The response.** `{"booking": <the booking DTO, now>, "refund": {outcome, amount, currency,
coupon_released, points_reversed}}`. `outcome` is `none`, `released` or `refunded`. A 500
`cancel_failed` (an unexpected exception, possibly after money already moved) may carry a `booking`
key too — the booking re-read so the portal shows what actually happened, not a stale view.

**Staff-side cancellation is unchanged**: it sets the status and nothing else. `php artisan bookings:capture-pending-pis`
releases the open hold of any cancelled booking, appointment or stay, and flags a payment already
taken (`…capture.needs_refund`) for a person to refund — see "Payments an operator must handle by
hand" above.

### Error codes — stays booking

`hold_expired`, `price_changed` and every `coupon_*` code are answered by `readyHold()`, called from
both `stays/payment-intent` and `stays/confirm` — but they mean different things at each call site,
because `payment-intent` never carries an existing PaymentIntent to release. The "Payment released?"
column says which.

| Code | HTTP | Meaning | What the portal shows | Payment released? |
|---|---|---|---|---|
| `not_bookable` | 404 | `GET stays` and `GET stays/availability`: no active room, Smoobu off, **or** the caller has no `LoyaltyMember` row (`notBookable()` answers the same code for both). `quote`/`payment-intent`/`confirm`: only the room/Smoobu half (`notBookableFor()`) — a missing membership there is `no_membership` instead | not-bookable notice | n/a |
| `no_membership` | 422 | `quote`/`payment-intent`/`confirm` only: the caller has no `LoyaltyMember` row yet, room/Smoobu are fine (`notBookableFor()`) | generic sentence | n/a |
| `invalid_stay` | 422 | dates, nights or party size outside the venue's rules, or the room does not sleep this many | back to Dates or Room | n/a — before any payment |
| `not_found` | 404 | the room id does not resolve | back to Room | n/a |
| `room_unavailable` | 409 | the room was just booked (this channel or another) | back to Room | released |
| `extra_lead_time` | 422 | an extra's own lead time cannot be met | back to Review | n/a |
| `coupon_not_found` / `coupon_used` / `coupon_expired` / `coupon_wrong_tier` / `coupon_no_capacity` / `coupon_untyped` | 422 | the coupon does not resolve (`readyHold()`) | Review clears the coupon | at `payment-intent`: n/a, nothing has been paid yet. At `confirm`: released, if the request supplied a `payment_intent_id` |
| `hold_not_found` | 404 | the hold does not exist or is not this member's | start again | not released (nothing is known to be this member's) |
| `hold_expired` | 409 | the hold's ten/fifteen-minute window passed (`readyHold()`) | check the price again | at `payment-intent`: n/a, nothing has been paid yet. At `confirm`: released, if the request supplied a `payment_intent_id` |
| `price_changed` | 409 | the repriced total no longer matches the hold's stored total (`readyHold()`) | check the price again | at `payment-intent`: n/a, nothing has been paid yet. At `confirm`: released, if the request supplied a `payment_intent_id` |
| `pay_at_venue` | 409 | the quote's payment mode is not `online` (`payment-intent` only) | Pay step skips Stripe | n/a |
| `nothing_to_pay` | 409 | the discounted total is 0 | same as `pay_at_venue` | n/a |
| `payment_unavailable` | 503 | Stripe threw while creating the intent | retry | n/a |
| `payment_required` | 422 | online mode but no `payment_intent_id` sent | generic sentence | n/a |
| `payment_mismatch` | 409 | `confirm` only: the intent's org/member/hold/amount do not match at `verifyStay()`, it already pays for another booking, or it stopped being payable when re-read under the `pi:` lock right before the coupon is consumed (`assertStillPayable()`) | back to Review, pay again | released (unless a booking already carries it) |
| `payment_check_failed` | 503 | `confirm` only: the Stripe retrieve itself failed (threw, or returned nothing) at `verifyStay()` or at the re-check under the `pi:` lock (`PaymentUnverifiable`); logged as `portal.stay_confirm_refused`, reason `payment_check_failed` | stay on Pay, confirm once more with the same intent | **not** released — the hold, the coupon and the intent are left as they are |
| `pms_unavailable` | 503 | Smoobu unreachable or misconfigured | retry sentence | released |
| `confirm_failed` (guest link) | 500 | linking the member to a guest failed before the engine was ever called (`portal.stay_confirm_guest_link_failed`) | stay on Pay, contact the venue | released |
| `confirm_failed` (engine threw) | 500 | the engine raised an exception `confirmError()` cannot classify more precisely, and no booking exists for this hold (`portal.stay_confirm_failed`) | stay on Pay, contact the venue | released |
| `confirm_failed` (lost) | 500 | the engine call returned normally but no booking can be found for the hold afterwards (`portal.stay_confirm_lost`, logged and written as an `AuditLog` row naming the hold id and the intent id) — nothing proves there is no booking, so nothing here is entitled to touch the payment | stay on Pay, contact the venue before trying again | **not** released — the sweeper releases the authorisation later only if no booking ever ends up carrying it |
| `invalid_stay` (extra) | 422 | `quote` only: an extra id the venue does not offer (the engine would price it as nothing) | back to Review | n/a — before any hold or payment |

### Error codes — cancelling

| Code | HTTP | Meaning |
|---|---|---|
| `not_found` | 404 | not the member's booking, or it does not exist |
| `already_cancelled` | 409 | the booking is already cancelled |
| `outside_policy` | 422 | the cancellation deadline has passed |
| `not_cancellable` | 422 | wrong status, a room group, or the payment is already refunded/partially refunded/disputed/channel-managed |
| `refund_unavailable` | 409 | online payments are switched off at the venue but the booking was paid online |
| `refund_failed` | 502 | Stripe could not be reached or refused — nothing was changed |
| `cancel_in_progress` | 409 | a concurrent cancel of the same stay is already running |
| `cancel_failed` | 500 | an unexpected exception; money may already have moved — the response's `booking` (if present) shows the true state |

## The public confirm's payment rescue

The public stay confirm (`POST /api/v1/booking/confirm`, `BookingPublicController::confirm()`) authorises a
guest's card first and books second. When it fails after that, `rescuePaymentIntentOnConfirmFailure()`
releases the money, so the guest's bank does not show a pending amount for days with no booking behind it.
It runs at four stages, recorded as `confirm_context.stage`: `validation` (the body failed validation),
`service_http` (the engine answered an HTTP error, e.g. a 503 from the PMS), `service_runtime` (a refusal
such as a taken room, or a payment check that failed) and `unhandled` (any other exception).

**The rule.** The rescue gives back only a payment that no booking carries and whose metadata carries this
request's own hold token (`hold_token`, which the stay widget's `paymentIntent()` writes for the hold).
Everything else is refused, and the caller gets the same answer whether the payment was given back or
refused. Given back means: an authorised payment (`requires_capture`, `requires_action`,
`requires_payment_method`, `requires_confirmation`, `processing`) is cancelled; a captured one
(`succeeded`) is refunded in full; a `canceled` one is left as it is; a `pi_mock_` id and a venue without
Stripe are ignored. The id is the one in the request body, or, when the body has none, the one cached on the
hold (`payload_json.stripe_payment_intent_id`).

**Refusal reasons**, as `reason` in the audit row:

| Reason | Meaning |
|---|---|
| `carried_by_booking` | a stay (`booking_mirror`) or an appointment (`service_bookings`) of the venue (of any organisation, when none is bound) already carries this payment: it is that booking's money. Read in the database before Stripe is asked anything, and again under the locks |
| `unreadable` | the id came from the request body and Stripe cannot retrieve it, so nothing shows it is this request's payment. The row also carries `retrieve_error`. (The hold's own cached id, which was stamped for this hold, is still cancelled unread) |
| `portal_payment` | the metadata `kind` is a member-portal kind (`portal_…`) or the metadata has a `portal_hold_token`: a portal payment, which the portal and its sweeper look after. `kind` is recorded |
| `other_kind` | the metadata has any other `kind`, for example the public services widget's `service_booking`. `kind` is recorded |
| `other_organisation` | the metadata `org_id` is not this venue's (or any `org_id`, when no organisation is bound) |
| `not_widget_payment` | the metadata has no `hold_token`: a payment the stay widget did not create (a payment link, an invoice, the venue's shop, an older payment) |
| `other_hold` | the metadata `hold_token` is not this request's hold token, or the request names no hold |

The checks run in that order: `carried_by_booking`, then `unreadable`, then the metadata marks from
`portal_payment` down.

**What the operator sees.**

- A refusal writes an audit row `booking.confirm.pi_rescue_refused` (subject type `stripe_payment`, no
  subject id, description "Confirm rescue: pi_rescue_refused on PI …") and a warning line `Booking confirm
  PI rescue: pi_rescue_refused` with the same payload. The keys of the row's `new_values` are
  `payment_intent_id`, `original_error`, `original_class`, `confirm_context` (with the `stage`), `reason`,
  and, where they belong, `kind` or `retrieve_error`. No card data and no metadata value other than `kind`
  is recorded.
- A payment that was given back writes `booking.confirm.pi_cancelled` or `booking.confirm.pi_refunded`. A
  Stripe call that failed writes `booking.confirm.pi_rescue_failed` (an unknown intent status writes the
  same action with `reason = unknown_status`); a refund a restricted Stripe key refused writes
  `booking.confirm.pi_rescue_restricted_key`, which names the missing scope and the dashboard address. The
  last two are logged as errors, and the payment must be looked at by hand.
- When the checks themselves cannot run (the database is unreachable), the payment is left alone and one
  error line `Booking confirm PI rescue: pi_rescue_checks_failed` names it: `payment_intent_id`,
  `organization_id`, `confirm_context`, `payment_left_alone` and `error`. There is no audit row, because the
  database that would hold it is what failed. `payment_left_alone` is `false` only when a cancel or refund
  had already been sent and something failed afterwards (a commit failure); the outcome row is then written
  as well.
- `php artisan diag:recent-confirm-failures --org=<organisation id>` lists every `booking.confirm.*` row of the last hours, refusals
  included, next to the confirm's own `booking.confirm.failed` row.

**Releasing by hand a payment the rescue left alone.** The intent id and the stage are in the audit row (or
the log line). First check that no booking carries it (`service_bookings.stripe_payment_intent_id`,
`booking_mirror.stripe_payment_intent_id`); `php artisan diag:orphan-stripe-pis --org=<organisation id>` lists the payments no booking
carries. Then open it in the Stripe dashboard: an uncaptured (`requires_capture`) authorisation can be
cancelled there, or left, when it lapses at Stripe on its own after about seven days.
`php artisan stripe:cancel-pi <payment intent id> --org-id=<organisation id> [--reason="<text>"] [--refund-if-captured]` cancels an authorised payment
from the command line (and refunds a captured one only with `--refund-if-captured`); it does not check
whether a booking carries the payment. A captured payment is never refunded automatically after a refusal.

**Order of work and locks.** (1) Is the payment carried by a booking? — the database, no lock. (2) Retrieve
it from Stripe. (3) Check its metadata marks. Every refusal returns here, with no transaction and no lock.
(4) Only when it is about to cancel or refund: a database transaction, then the request's hold row
(`lockForUpdate`, when an organisation is bound and the hold exists for it), then `AdvisoryLock::within('pi:'
. $intentId)`, then "carried" is read again (`carried_by_booking` if a booking appeared meanwhile), then the
Stripe call. The hold row is read and never changed, so the guest can retry with the same hold. The rescue
takes no room lock and locks no booking row; it locks the hold row before `pi:`, the same order as every
other place (see `CLAUDE.md`), and takes `pi:` only for an intent that already carries this request's hold
token (or the hold's own cached id). The audit row is written after the transaction has ended, so a Stripe
call that happened is recorded even when the commit fails.

**What is different for an honest public booking.** An honest guest's own payment (metadata `hold_token`
equal to the request's, this venue's `org_id`, no `kind`) is rescued exactly as before: the same Stripe
calls, audit rows and log lines. Five things differ:

1. An intent id from the request body that Stripe cannot read is not cancelled blind (`unreadable`).
2. A payment a booking carries is never given back, also when something failed after the booking was
   committed: the booking stands with its payment authorised, and the capture job captures it like any
   booking's.
3. When the checks cannot run, the payment is left alone (`pi_rescue_checks_failed`).
4. A payment taken for an earlier hold and sent with a newer hold is refused (`other_hold`); the earlier
   authorisation stays until it lapses or is cancelled by hand.
5. An intent id sent without a hold token is refused (`other_hold`, or `not_widget_payment` when the intent
   has no hold token either); a body without a hold token fails validation, so the stage is `validation`.

## After a deploy

- The deploy runs the pending migrations (Laravel Cloud runs `php artisan migrate --force`, see `CLAUDE.md`).
  This phase has two, both additive, guarded and reversible:
  - `2026_09_30_100000_member_portal_phase_3` adds `booking_mirror.member_id` + the
    discount/points/cancellation columns, an index on `booking_mirror(organization_id, member_id)`, and
    `service_bookings`' refund columns — columns and that one index, nothing else.
  - `2026_10_01_100000_service_bookings_unique_payment` creates the index `service_bookings_org_pi_unique`
    (see "One payment, one service booking"), or, when it finds a payment id repeated within one
    organisation, creates nothing and writes a warning to the log. Either way it is recorded as run.
- **Check that the one-payment index exists.** Each step below is a command to type exactly as written; a
  placeholder in angle brackets is something to replace, brackets included.
  1. `php artisan migrate:status` lists `2026_10_01_100000_service_bookings_unique_payment` as `Ran`. This
     does NOT prove the index exists: a migration that skipped the index is recorded as `Ran` too.
  2. `php artisan db:table service_bookings` prints the table's indexes. The line
     `service_bookings_org_pi_unique  organization_id, stripe_payment_intent_id` (with `unique` among its
     attributes) must be there. If it is, nothing more is needed.
  3. Search the application log (the hosting panel's log view; on a local checkout
     `storage/logs/laravel.log`) for `service_bookings_unique_payment`. Either warning named in "One payment,
     one service booking" means the index was not created. A warning is logged only when `LOG_LEVEL` is
     `debug`, `info`, `notice` or `warning` (at `error` or above it is dropped), so an empty search proves
     nothing on its own: step 2 decides.
  4. **If the index is missing because of repeated payment ids**, list them with this read-only query in
     the database's own SQL console (it changes nothing):

     ```sql
     SELECT b.organization_id, b.stripe_payment_intent_id, b.id AS booking_id, b.booking_reference,
            b.status, b.payment_status
     FROM service_bookings b
     JOIN (
         SELECT organization_id, stripe_payment_intent_id
         FROM service_bookings
         WHERE stripe_payment_intent_id IS NOT NULL AND stripe_payment_intent_id <> ''
         GROUP BY organization_id, stripe_payment_intent_id
         HAVING COUNT(*) > 1
     ) d ON d.organization_id = b.organization_id AND d.stripe_payment_intent_id = b.stripe_payment_intent_id
     ORDER BY b.organization_id, b.stripe_payment_intent_id, b.id;
     ```

     A person has to decide, for each payment id listed, which one booking keeps it: the capture job and a
     refund find a booking by that id, and a payment can be captured or refunded once. Take a database backup,
     then correct the payment reference of the other bookings of that payment by hand (they cannot keep the
     same id). Then create the index by running the migration's `up()` again. It is safe to run again: it
     returns at once if the index exists, scans again, and creates the index only if no repeat is left:

     `php artisan tinker --execute="(require database_path('migrations/2026_10_01_100000_service_bookings_unique_payment.php'))->up();"`

     It prints nothing when it succeeds. Run `php artisan db:table service_bookings` again (step 2) to see the
     index, and search the log again (step 3) for a new warning.
  While the index is missing, the applications' own checks still refuse a reused payment (the portal's
  `assertUnused()` under the `pi:` lock and the public services confirm's check before its insert); only the
  same-moment race of two public confirms is then not closed.
- Scheduled commands that must be running (`routes/console.php`):

  | Command | Schedule | What it does |
  |---|---|---|
  | `php artisan bookings:capture-pending-pis` | every 10 min | captures authorised PaymentIntents; releases or flags cancelled bookings' holds/captures |
  | `php artisan bookings:award-stay-points` | daily, 04:15 in the scheduler's zone (the application zone, `UTC`) | awards loyalty points for stays that have departed; each stay is judged on its own venue's "today" |
  | `php artisan bookings:release-orphan-portal-holds` | every 30 min | releases a card held for a portal booking that was never written |
  | `php artisan bookings:sync-pms` | every 5 min | pulls Smoobu bookings (unchanged by this phase, but stays depend on it) |
  | `php artisan bookings:retry-pms-sync` | every 5 min | pushes local-only bookings Smoobu missed |
  | `php artisan bookings:prune-holds` | daily, 03:45 | deletes expired `booking_holds` rows |

- Settings to check in the hosting panel:
  - **Which cache store production uses** (the `CACHE_DRIVER`/`CACHE_STORE` environment setting;
    Laravel's own default is `file`). `MemberCancellation::cancelStay()`'s `cancel_in_progress` lock
    and `BookingRefundService::applyRefund()`'s `refund:` lock are cache locks — on a store that is
    local to one instance (`file`, `array`) they do **not** span multiple app instances behind a load
    balancer. Consequence of that: two instances can both start a cancel or a refund attempt for the
    same booking at once, which can duplicate an audit row or a mail, but the money itself cannot be
    refunded twice — the `pi:` advisory lock and the row lock inside the database, not the cache
    lock, are what stop that. A shared store (`redis`, `database`, `memcached`) removes even the
    duplicate-mail/audit risk.
  - Stripe webhooks must deliver `charge.refunded` (in addition to whatever the account already
    sends) — it is how a dashboard refund, an async settlement reversal, or a refund made from
    another instance reaches `service_bookings.refunded_amount`.
  - Settings → Booking is reachable for every industry now; check the two cancellation-hours fields
    (`services_cancel_hours`, `booking_cancel_hours`; default 24 / 48) are what the venue actually
    wants — the portal enforces the number, the policy text next to it is only what the member reads.
  - **Settings → General → Timezone, for each venue.** The portal runs on this zone (see "Appointment
    times"). It is a free-text field seeded `UTC`: it must be a zone name such as `Europe/Riga`. An
    abbreviation (`EET`) or an offset (`+03:00`) is ignored, and the portal then falls back to
    `organizations.timezone`, which defaults to `UTC` and which no admin screen writes. A venue that leaves
    the field at `UTC` keeps `UTC` behaviour: "today", the booking window and the cancellation deadlines
    are counted in UTC.
- From this deploy on, every industry's starter preset has `hasLoyalty = true` (medical included) — a
  brand-new signup always gets a membership programme. An **existing** venue created before its industry
  had one, or whose tiers were otherwise never set up, still has none. Two ways to give it the starter
  programme of its industry:
  1. By command, in two steps, each typed exactly as written apart from the placeholder:
     - `php artisan loyalty:provision-programme --all` writes nothing. It prints one line for every venue
       that has no programme (`would give org <id> (<name>) the '<industry>' programme`, the id first) and
       "N venue(s) would be given a programme. Run with --apply to write." A venue that has any tier row,
       even an inactive one, is left out (a venue whose tiers are all inactive is reported as "has a paused
       programme — skipped").
     - `php artisan loyalty:provision-programme --org=<organisation id> --apply` writes the programme for
       the one venue whose id you copied from the first step. (`php artisan loyalty:provision-programme
       --all --apply` does every listed venue at once.) It enrols nobody and emails nobody.
  2. In the admin: the Members page opens on a setup wizard (pick a starter preset, choose whether to add
     sample members, review and apply) for any venue whose Members setup has not been completed or skipped
     — the marker `members_onboarding_completed_at` in its CRM settings, which applying a preset, the
     command above and skipping the wizard all write. A venue with no programme and no marker sees the wizard
     the next time someone opens its Members page; one that skipped it does not, and needs the command.
- Two hand checks worth doing once, on the first real card booking after the deploy:
  - **Book a stay with a real card.** Right after confirm: the PaymentIntent is `requires_capture`; once
    `php artisan bookings:capture-pending-pis` next runs, it is `succeeded` and the mirror is `paid`. The coupon's
    `used_reference` (if one was used) is still `BM:{mirror id}` after the first Smoobu sync runs — it must
    not have been overwritten or cleared. The price Smoobu shows for the reservation equals what the
    card was actually charged.
  - **Cancel that captured stay from the portal.** Exactly one refund appears on the card (check the
    Stripe dashboard, not just the app), exactly one cancellation mail reaches the member, the Smoobu
    reservation is cancelled, and the mirror ends `payment_status = refunded` with `internal_status`/
    `booking_state` = `cancelled`.

## When money looks wrong

| Symptom | Where to look | What is safe to do |
|---|---|---|
| A booking shows cancelled but the guest says they were charged | `AuditLog` for `booking.capture.needs_refund` / `service_booking.capture.needs_refund` (subject = the booking); `booking.member_cancelled` / `service_booking.member_cancelled` for a member's own cancellation, which already returned the money — check `refund.outcome` in that row first | If a `needs_refund` audit row exists and no refund audit follows it, refund from the Stripe dashboard using the intent id in the audit row |
| A member says they paid but the booking never appeared | `php artisan diag:orphan-stripe-pis --org=<organisation id>` (read-only) lists Stripe PaymentIntents no booking carries | If found and old enough, `php artisan bookings:release-orphan-portal-holds --org=<organisation id> --dry-run` (then without `--dry-run`) releases it; or cancel by hand in the Stripe dashboard using the metadata (`org_id`, `member_id`, `kind`) |
| A capture cron run looks like it skipped bookings | Run `php artisan bookings:capture-pending-pis --dry-run [--org=<organisation id>]` and read the printed per-row lines and the final tally (`captured`/`already_captured`/`expired`/`skipped`/`failed`/`released`/`needs_refund`) | Nothing is written by `--dry-run`; re-run without it once the report looks right |
| Points look wrong on a stay | `php artisan bookings:award-stay-points --dry-run [--org=<organisation id>]` lists what would be awarded; a stay only earns once `payment_status` is `paid` (or `open` + `pay_at_venue`) | Nothing to do if the stay's payment has not settled yet — it is picked up on a later run, inside 60 days of departure |
| A cancel returned `refund_failed` or `cancel_failed` | The booking was left as it was (a genuine `refund_failed`) or may have partially applied (`cancel_failed`, a 500) — re-fetch the booking (`GET member/portal/bookings/{kind}/{id}`) and check `payment_status`/`can_cancel` before assuming nothing happened | Ask the member to retry the cancel; a stay's retry converges (money already back is recognised, no second Stripe call) |
| Two refund/cancel mails or audit rows for the same booking | Check which cache store production uses (see "After a deploy") — a per-instance store lets two instances both pass a non-blocking lock at once | Confirm in Stripe that only one refund exists; if so this is the known duplicate-notification risk, not a double refund |
| An authorisation still sits on a member's card and `php artisan bookings:release-orphan-portal-holds --dry-run` does not list it | The sweeper fails closed: it never releases an intent whose authorisation time it cannot read back from Stripe (see "Known limits") | Look at the payment intent directly in the Stripe dashboard; an uncaptured authorisation lapses at Stripe on its own after about seven days, and the venue can cancel it there sooner |
| A service confirm answered `payment_mismatch` and the member's card shows the charge still held | A `ServiceBookingSubmission` row with `outcome = failed`, `error_message = payment_not_payable` (written by `writeBooking()`'s own re-check) — this re-check never releases the intent itself | Nothing further needed if a booking now carries the intent (check `service_bookings.stripe_payment_intent_id`); otherwise it is an orphan and the sweeper or `php artisan diag:orphan-stripe-pis` handles it as above |
| A guest of the public services widget was told "This payment has already been used for a booking." | A `ServiceBookingSubmission` row with `outcome = failed`, `error_message = payment already used`, and the request's `customer_email`; the booking that carries the payment: `service_bookings.stripe_payment_intent_id` | Nothing to undo: the refused request created no booking and touched no payment. If the guest has no booking, find the one that carries the payment (a retry, or the same payment used twice) and tell them it stands |
| A guest says their card shows a pending amount after a failed public booking | Audit rows `booking.confirm.pi_rescue_refused`, `booking.confirm.pi_rescue_failed` or `booking.confirm.pi_rescue_restricted_key` for that payment intent (`php artisan diag:recent-confirm-failures --org=<organisation id>` lists every `booking.confirm.*` row); with none of them, the log line `Booking confirm PI rescue: pi_rescue_checks_failed`. The row's `reason` and `confirm_context.stage` say why the rescue left it alone (see "The public confirm's payment rescue") | If the reason is `carried_by_booking`, do nothing: a booking has that payment and the capture job captures it. For any other reason, first check that no booking carries the intent (`service_bookings.stripe_payment_intent_id`, `booking_mirror.stripe_payment_intent_id`), then open it in the Stripe dashboard by the id in the row: cancel an authorised (`requires_capture`) one, or let it lapse at Stripe on its own after about seven days; refund a captured (`succeeded`) one only if it is the guest's payment for this failed booking |

## Known limits

- **The public confirm's own error text tells a payment id that exists from one that does not.** The
  verification inside `BookingPublicController::confirm()` answers "Payment does not match this booking."
  or "Payment has not been completed. Status: …" for a payment Stripe knows, and "Unable to verify payment:
  No such payment_intent: …" for one it does not. That text is the public confirm's own and is unchanged;
  the rescue (see "The public confirm's payment rescue") adds no signal of its own.
- **A confirm of the same hold can be overtaken just before it locks the hold.** A public confirm that has
  passed its payment check but has not yet reached `BookingEngineService::confirm()`'s lock of the hold row
  (it reads the hold unlocked, links the guest and takes the room lock first) is not waited for by the
  rescue. If a failing second request of the same guest, naming the same payment and the same hold, runs
  its rescue in that gap, it cancels the payment; the first confirm then locks the hold and writes the stay
  without a live payment. The capture job finds the payment cancelled on its next run and records it
  (`booking.capture.expired`, payment status `cancelled`). Closing it needs the engine to re-check the
  payment under its own lock, and the engine is unchanged.
- **The public services confirm accepts any authorised payment of the account.**
  `ServicePublicController::confirm()` checks only that the payment named in the request is `succeeded` or
  `requires_capture`; it does not check its amount, its service or whose it is (its metadata). The one-payment
  rule covers `service_bookings` only, so a payment that a STAY already carries (`booking_mirror`) is still
  accepted there.
- **A retry of a public services booking without the `Idempotency-Key` is refused, not replayed.** With "any
  staff member" chosen and another master free, the retry passes the slot check, meets the one-payment rule
  and is answered 409 "This payment has already been used for a booking."; the first booking stands, and
  the retry is not given the existing booking back (only a request with the same `Idempotency-Key` is).
- **The public services confirm's general answer for other database errors carries the error's text.** A unique
  violation the one-payment rule does not explain is answered 409 with the exception's own message; any other
  failure is answered 500 "Failed to create booking: …" with its message. Only the payment rule has a plain
  sentence.
- **Nothing alerts on a rescue refusal.** A refusal is an audit row and a warning line, with no realtime
  event and no mail; it is found by looking (see "When money looks wrong").
- **A stays or services `payment-intent` call mints a brand-new PaymentIntent every time**, without
  releasing whichever one it minted last for the same hold/slot — a member who calls it twice (a retry,
  a re-render) can have two authorised holds on their card until the sweeper releases the older one.
  There is also no cap on how many times a `payment-intent` call extends the hold's `expires_at` (always
  reset to now + 15 minutes, however many times it is called).
- **No shorter Stripe timeout for a call made under a lock.** Every Stripe call inside the `pi:` lock (or
  the room/slot lock) uses the same client timeout as everywhere else; a slow Stripe response holds the
  lock for that long. Reported, not changed.
- **The Smoobu sync's pins**, exactly as `BookingEngineService::upsertBookingFromData()` has them: a
  mirror's `payment_status` is kept as it is (Smoobu's own read is discarded) when it is currently
  `refunded`, `partially_refunded`, `disputed`, `cancelled`, `canceled`, `authorized` or `capture_expired`
  — for every booking, not only a member's — or when the booking is a member's and its status is `paid`
  but Smoobu now reports something else (a member's captured payment is never reopened by Smoobu's own
  flag). When a status is pinned, `price_paid` is pinned with it. `channel_name` is kept as `Member portal`
  or `Website`; a member's `guest_id` link is kept (an email lookup that comes back empty never unlinks
  them), and their special-requests `notice` is kept whenever Smoobu's own incoming value is blank.
  This list is deliberately not wider than it needs to be.
- **`internal_status = 'checked-in'`** is written by the sync from **midnight** of the arrival day (not
  the venue's actual check-in time), and `checked-in` is not in `CancellationPolicy::forStay()`'s open-status
  list — so for a venue with `booking_cancel_hours = 0` (cancellable right up to the actual check-in time),
  the window between midnight and check-in time is not actually usable: the sync closes it early. Reported,
  not changed.
- **Two day boundaries do not follow the venue's zone.** A stay moves from upcoming to past at 00:00 UTC
  on its departure date: `MemberBookingQuery` reads the departure date as midnight in the application's zone
  and compares it with the current time, so it happens neither at check-out nor on the venue's clock. And
  `php artisan bookings:award-stay-points` runs at 04:15 in the scheduler's zone (the application zone, `UTC`); it
  judges each stay's departure on its own venue's "today", so a stay is awarded on the first run after its
  venue's day of departure has ended.
- **Only a portal-booked stay earns points.** `BookingPointsService::awardForStay()` requires
  `booking_mirror.member_id`; a stay made through the public widget and later matched to a member by email
  never earns, even once cancellation/refund is out of the picture.
- **`portal.bookings.nights_guests` has no plural forms** in Russian or English (`"2 ночей · 2 гостей"`,
  `"1 nights · 1 guests"` for a one-night stay) — a proper fix needs plural-aware keys in five locales, not
  built.
- **Combination stays** in the portal: `confirmCombo()` needs a room lock and the re-checks the
  single-room confirm has. Deferred; the portal tells a party too large for one room to contact the
  venue.
- **Extras pricing on stays.** `BookingEngineService::extrasLines()` charges price × quantity for
  every extra the admin can save (`per_night`, `per_person`, `per_person_night` are not multiplied).
  The portal shows the engine's own line totals. Changing it changes what the public widget charges.
- **Redirect-based payment methods** stay off in the portal (`allow_redirects: 'never'`); a return
  handler would have to restore the flow's state after the redirect.
- **"Pay at the venue although we take cards"** when Stripe is unavailable needs a venue setting;
  today `payment-intent` answers 503 and asks the member to retry.
- A **Stripe outage at a confirm's payment check** (`verify()`/`verifyStay()`, or the re-check
  `assertStillPayable()` under the `pi:` lock) answers 503 `payment_check_failed`, not
  `payment_mismatch`: nothing is released and the member confirms once more with the same intent.
- The **sweeper fails closed**: an intent still `requires_capture` whose latest charge cannot be read
  back from Stripe's own answer (not expanded, or Stripe did not return one) is never released, however
  old it looks from its `created` time — see "When money looks wrong" for what to do when a hold seems
  stuck.
- The **service confirm's payment re-check** (`writeBooking()`, right before the booking row is
  written): when the intent this request is holding is re-read under the `pi:` lock and is no longer
  payable — cancelled by a concurrent failed confirm, or the orphan sweeper reached it (a retrieve that
  fails outright is `payment_check_failed` instead, above) — the confirm answers 409 `payment_mismatch` and logs a failure row with reason
  `payment_not_payable`, but does **not** release the intent (this code cannot prove it is actually
  dead, only that it cannot currently confirm it is still payable); an intent no booking ever carries is
  left for the sweeper.
- The **capture job's** per-run counters and printed lines are cut by `--limit` (default 200): a
  sibling row of a multi-room stay that `--limit` excludes from this run is still locked and
  captured/released with the rest of its group for money correctness, but does not appear in this
  run's own tally.
- The `svc:` (any master) and `svcm:` (named master) slot locks do not serialise each other (an
  "anyone available" confirm and a named-master confirm for the same master).
- The engine's literal `EUR` in holds, the Smoobu receipt and the confirm response; the portal reports
  `booking_currency` and takes online payment only when it equals Stripe's currency.
- **Zero-decimal currencies in the refund webhook, for stays only** (`$latest->amount / 100`, a bare
  division with no currency check, in the `booking_mirror` branch of `charge.refunded`). The service
  booking branch (`recordServiceBookingRefund()`) already converts by currency and is zero-decimal
  aware.
- **Cancellation fees and partial refunds** are not built — a member cancellation is always a full
  refund or nothing.
- A venue with **no membership programme at all** (no `LoyaltyTier` row) has no portal booking for
  either kind — `capabilities.services`/`capabilities.stays` are false and a caller has no
  `LoyaltyMember` row to provision against. Every industry, including medical, now gets a starter
  programme on signup; an existing venue created before its industry had one, or whose tiers were never set
  up, is given one in the two ways "After a deploy" describes (the command in two steps, or the Members
  wizard in the admin). The command reports by default and only writes with `--apply`, and it never touches
  a venue that already has any tier row, even an inactive (paused) one.
- An old mobile app build that still calls `POST member/reservations` gets 404 — that endpoint is
  retired; the app books stays through the widget WebView instead.
