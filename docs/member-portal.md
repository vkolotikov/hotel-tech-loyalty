# Member portal (web) — how it is built and checked

The member portal is the customer-facing half of the SPA: `/portal/*`, one lazy chunk
(`frontend/src/portal/`), served on the admin hosts for users with `user_type = member`.
Spec: `docs/superpowers/specs/2026-09-23-member-portal-v2-design.md`.

## Backend

- `GET /api/v1/member/portal` (`Member\Portal\PortalController`) is the shell's one startup call:
  venue identity + accent tokens (`App\Services\Portal\PortalTheme`, contrast-checked by
  `App\Support\Accent`), capabilities (`App\Services\Booking\BookingCapability`), policies,
  the member summary, counts.
- `GET /api/v1/member/portal/bookings` and `…/bookings/{service|stay}/{id}`
  (`App\Services\Portal\MemberBookingQuery`): the member's bookings across `service_bookings`
  and `booking_mirror`, owned by `member_id`, a linked guest, or the member's email inside their
  organisation, the email rule only once `users.email_verified_at` is set (claiming an account
  stamps it; a self-registered member has no email-matched history until verified).
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
Join a venue at `http://localhost:5173/portal/join?org=<organizations.widget_token>`.

Under the Vite dev server the display faces do not load: `/landing/fonts/*.woff2` is served by Laravel
(`public/landing/fonts`), not by Vite, so titles fall back to the next face in the stack. To judge type in a
dev screenshot, serve those URLs from `public/landing/fonts` (a Playwright route does it) or look at a built SPA
on the Laravel host.

## Checks

- Backend: `artisan test tests/Feature/Member/` (portal tests live in `tests/Feature/Member/Portal/`),
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
| `slot_taken` | 409 | the scheduler's slot was just taken (`ServiceQuoteBuilder` throws `SlotTakenException`, shared with the widget) | back to When, `startAt` cleared |
| `coupon_not_found` / `coupon_used` / `coupon_expired` / `coupon_wrong_tier` / `coupon_no_capacity` / `coupon_untyped` | 422 | the selected or typed coupon does not resolve (`CouponException::$errorCode`) | Review's `afterQuoteError()` clears `state.coupon` and shows the matching sentence |
| `no_membership` | 422 | the caller has no provisioned `LoyaltyMember` yet (`quote`, `payment-intent`, `confirm`) | generic sentence; confirm sends back to Review |
| `payment_required` | 422 | payment mode is `online` but no `payment_intent_id` was sent | generic sentence; nothing to release |
| `pay_at_venue` | 409 | the quote's payment mode is not `online` (`payment-intent` only) | the Pay step skips Stripe |
| `nothing_to_pay` | 409 | the discounted total is 0 | same as `pay_at_venue` |
| `payment_unavailable` | 503 | Stripe threw while creating the intent | member is asked to retry |
| `payment_mismatch` | 409 | the PaymentIntent's org/member/service/slot/amount/status do not match, it already pays for another booking, or the mode no longer needs it | the hold is released unless a booking already carries the intent; back to Review |
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
`slot_taken`. Capture is left to the existing `bookings:capture-pending-pis` job, same as widget
bookings — which skips a service booking still `pending` and never captures a cancelled one (below).

### Payments an operator must handle by hand

- **Refunding a captured service booking after cancellation.** Nothing refunds automatically. When a
  service booking is `cancelled` or `no_show` but its PaymentIntent already `succeeded`, the capture
  job leaves the row as it is and writes one `AuditLog` row, `service_booking.capture.needs_refund`
  (subject `service_booking`, the booking id). Decide whether a refund is due under the venue's
  cancellation policy and refund it in the Stripe dashboard (Payments → the intent id from the audit
  row → Refund). A cancelled booking whose card is still only held is handled for you: the job cancels
  the hold and writes `service_booking.capture.cancelled_booking`.
- **A hold left by a browser closed between authorisation and confirm.** The card was authorised but
  no booking was written, so nothing in the database carries the intent and no job looks for it: the
  hold lapses when Stripe's authorisation expires (about seven days). There is no sweeper yet (phase
  3). If a member asks, cancel the intent in the Stripe dashboard (its metadata names `org_id`,
  `member_id`, `service_id` and `start_at`).
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

### Admin fields and `loyalty:type-benefits`

Tiers → assign benefit gains `value_type` / `value_amount` / `applies_to` (`TierBenefit`); the
Offers form gains `code`, `tier_ids`, `per_member_limit` and `applies_to` (`SpecialOffer`, types
`discount` and `fixed_amount`); the Rewards form gains `discount_type` / `discount_value` /
`applies_to` (`Reward`). `loyalty:type-benefits {--org=} {--all} {--apply}`
(`App\Console\Commands\TypeBenefits`) parses existing prose values of the exact forms `NN% off …`
and `<currency>NN off …` into these typed fields; dry run by default (prints the plan as a table,
for one organisation with `--org=<id>` or for all without it), only `--apply` writes, and `--apply`
refuses to run without `--org=<id>` unless `--all` is given (a write across every organisation must
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

### Deferred, known

- A unique index on `(organization_id, stripe_payment_intent_id)` is deferred pending a production
  data check; `PortalPaymentIntentGuard::assertUnused()` is today's guard, not a database
  constraint.
- Redirect-based payment methods stay off (`allow_redirects: 'never'`) for this phase.
- Portal booking for venues without a loyalty programme (members there book through the public
  widget) — phase 3. Until then portal booking requires a membership row: `capabilities.services`
  is false, `GET member/portal/services` answers 404 `not_bookable` and `quote` answers 422
  `no_membership` for a user without one.
- A "pay at venue even though we take cards" fallback for when Stripe is unavailable is deferred;
  today `payment-intent` answers 503 and asks the member to retry.
- The public widget's own confirm still uses its inline advisory-lock statement, not
  `AdvisoryLock::transaction()`; migrating it is a phase 3 clean-up.
- The `svc:` (any master) and `svcm:` (named master) lock keys do not serialise each other, so two
  confirms carrying the same PaymentIntent under different keys used to both pass `assertUnused()`.
  `writeBooking()` now takes a second lock on the intent itself (`AdvisoryLock::within('pi:' . $piId)`)
  before `assertUnused()`; the deferred unique index would make the same rule a database constraint.
  `tests/Unit/Portal/PortalIntentLockOrderTest.php` pins the order structurally (sqlite never runs the lock).
