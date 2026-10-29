# Booking, member portal and Appointments audit — 2026-10-29

Published appendix to the [consolidated launch audit](../2026-10-29-public-launch-audit.md). Original logs, renderer/browser harnesses and screenshots remain in `E:/Hexa-Tech-audit-20261029/booking/`; references below to adjacent files refer to that original directory. PHP reproduction source copies are under [probes/](probes/README.md).

Read-only review; no product edits, deployment, live payment, real booking, email or notification was performed. Source references below are relative to `C:/wamp64/www/Hexa-Tech`.

## Assessment

The existing domain suite is extensive and all runnable assigned tests passed, but payment/refund handling still has launch-significant gaps. I recommend resolving findings B1–B2 before enabling public card payments/refunds. B3–B6 should be fixed before exposing the affected configurations. This is not a declaration that production integrations have been validated.

## B1 — High / P1: refund creation is treated as completed money movement regardless of Stripe status

**Evidence:** `app/Services/Appointments/Money/AppointmentMoney.php:165–176` takes any returned Refund object, saves its ID, increments `refunded_amount`, then settles the payment as partially/fully refunded. There is no status inspection. `app/Services/Booking/ServiceBookingRefund.php:70–91` has the same assumption in the member cancellation/deposit helper. `app/Services/BookingRefundService.php:202–212` accepts any Refund object then computes/writes a completed refund at lines 283 onward. `app/Http/Controllers/Api/V1/BookingPublicController.php:1918–1943` handles `charge.refunded`, but there are no `refund.failed` / `refund.updated` handlers in the app.

**Reproduced:** private HTTP test replaces Stripe with a returned `{status:'failed', amount:6000}` for a EUR 60 appointment. API returns 200 with `booking.payment.raw='refunded'`, `refunded_online=60`, and persisted `refunded_amount=60`. An identical `pending/insufficient_funds` object has the same result. A fourth helper probe demonstrates member cancellation similarly returns `money='refunded'` for a pending refund. This is a newly reproduced defect, not an asserted live Stripe failure.

**Impact:** a client may not receive the promised money, while staff see a completed refund, cannot issue the normal remaining refund, and points/cancellation side effects proceed. A later failed refund is not reconciled. Pending must reserve the amount to prevent duplicate refunds but must not be represented as settled. Stripe explicitly supports pending, requires_action, succeeded, failed and canceled refund states; insufficient balance can leave card refunds pending.

**Recommendation:** persist a refund lifecycle keyed by provider refund ID; distinguish requested/pending/succeeded/failed/canceled and unknown outcomes; apply/reverse side effects idempotently from verified webhook status. Reconcile later failures and expose actionable status to staff. A failed response must not reduce refundable balance as a completed refund. Test pending→success, pending→failed, failure after apparent initial success, duplicate/out-of-order webhooks, full/partial refunds, cancellations and points.

**Confidence:** high; executable API/helper probes and primary provider contract.

Provider references: https://docs.stripe.com/api/refunds/object ; https://docs.stripe.com/refunds (current retrieval 2026-10-29).

## B2 — High / P1: ambiguous appointment refund response invites a second refund

**Evidence:** `AppointmentMoney.php:163–168` derives its idempotency key from booking + previously recorded total + current requested amount, and catches every transport exception as “The card refund did not go through”. `frontend/src/appointments/panel/RefundForm.tsx:49–56` leaves the amount editable after the error. The dedicated stay path already has `app/Services/Booking/RefundOutcomeUnknown.php:8–18`, but the Appointments path does not use it.

**Reproduced:** first EUR 25 call is simulated as accepted by the provider with its response lost; the API returns `refund_failed`. A subsequent EUR 30 request uses a different idempotency key, succeeds and the app records only EUR 30. The provider can now have refunded EUR 55. Same-amount retry is covered and works; changed-amount retry is the gap. Stripe prevents returning more than the original charge, but that does not prevent returning more than staff intended.

**Recommendation:** create a durable refund operation before the external call and reuse its identity while the outcome is unknown; reconcile before starting another amount, and explicitly say the result is unknown. Align timeout handling with the existing stay refund service. Test dropped replies before/after acceptance, changed amount and changed method, another operator, delayed webhook and retries.

**Confidence:** high for observed API/key behavior; double money movement is a conditional provider-outcome scenario simulated by the private test, not a live transaction.

## B3 — Medium / P2: public stay checkout sidebar contradicts the amount actually charged

**Evidence:** `resources/views/booking-widget.blade.php:1046–1048` reads `q.total`; the quote endpoint returns `gross_total` (`BookingEngineService.php:169–170`, directly returned by `BookingPublicController.php:204–207`). It therefore keeps its fallback calculation even after receiving an authoritative quote. Fallback adds each extra catalogue price once, ignoring price type, guest count and nights. It also ignores `selectedCombo`. The payment heading correctly uses `q.gross_total` at widget line 1202.

**Reproduced:** the private Node probe executes the exact source `renderSummary()` with the real response shape. Two nights, two adults + one child, EUR 200 room, EUR 5 per-person-per-night breakfast: checkout sidebar says EUR 205 while payment total is EUR 230. Two-room combination with EUR 400 rooms shows EUR 5 in the sidebar, versus EUR 430 payment total. This is UI misrepresentation; server pricing/charging passed existing pricing tests. The runbook already admits the extra-pricing discrepancy; ignoring the quote contract and combo are additional clarification of its actual reach.

**Recommendation:** render totals and line items from one typed server quote; use correct per-stay estimates before quoting, visibly label estimates, and include all combination rooms. Test all extra price types, quantities, changing dates/guests, quote expiry and combination bookings across desktop/mobile.

**Confidence:** high; exact renderer execution plus passing HTTP quote contract tests.

## B4 — Medium / P2: configured arrival-day stay cancellation is closed before its deadline

**Evidence:** `BookingEngineService.php:1548–1555` derives `checked-in` from the application calendar date, without actual check-in time. `app/Services/Booking/CancellationPolicy.php:77–84` rejects checked-in before evaluating the configured deadline.

**Reproduced:** at 09:00 Riga on arrival day, `booking_cancel_hours=0`, check-in 15:00, a real sync normalizer call writes `checked-in`; the cancellation policy then returns `not_cancellable`. The same booking marked confirmed is cancellable until 15:00. The sync can therefore deny hours that configuration promises. Previously documented but unresolved limitation, now privately reproduced.

**Recommendation:** use actual operational check-in state or a venue-time-aware deadline rule, keeping genuine checked-in stays protected. Test arrival day, date/time zones, daylight-saving boundaries and a sync immediately before cancellation.

**Confidence:** high; executable normalizer/policy repro.

## B5 — Medium / P2 for non-EUR venues: booking administration mislabels money as EUR

**Evidence:** `frontend/src/lib/money.ts:6` defaults to EUR; `frontend/src/pages/BookingDetail.tsx:212,216,221,329,533` and `Bookings.tsx:857–858` call it with no currency, including the refund modal. `BookingAdminController.php:246,251` hard-codes euro KPI strings. Room setup line 438 and Paid field line 482 in BookingDetail hard-code EUR labels. The stay/payment layer now explicitly supports venue currency.

**Impact/scenario:** configure a USD/GBP/JPY stay venue: amounts are charged in venue currency but staff lists, details and refund hints present the same number as euros. This can cause collection/refund mistakes even though the backend amount itself remains numeric. Source confirmed; no authenticated non-EUR browser fixture was run by this agent.

**Recommendation:** return immutable booking currency and currency-aware aggregate metadata, pass currency to all money formatters and labels; avoid summing unlike currencies. Test a non-EUR venue and historic bookings after a permitted currency change.

**Confidence:** high from explicit formatter defaults/call sites; runtime UI reproduction not performed.

## B6 — Medium / P2: public service “any staff” can fail after a valid card authorization

**Evidence:** `ServicePublicController.php:237–244` calls `reserveSlot` for payment pricing, but `:403–411` resolves a staff member again at confirm. No picked-master hold is pinned in payment metadata (full payment metadata at `:281–289` has org/service/start/kind). Scheduler returns effective master price (`ServiceSchedulingService.php:214`). If the originally priced staff member becomes busy, another available staff member with a different configured price is selected and payment amount validation refuses it (`ServicePublicController.php:472`).

**Impact:** a normal concurrent booking + different per-staff price can make a guest who chose “any staff” authorize one amount and then be told to pay again. The old authorization is intentionally not canceled because this route cannot prove ownership; runbook says it may remain until provider expiry. Existing known limitation, traced in source; no new end-to-end reproduction in this audit.

**Recommendation:** pin the selected staff member/price in a short-lived server quote or hold, and provide a safe reprice/reconfirmation flow when no longer available. Test two staff with different prices, one slot being taken between intent/confirm, and authorization cleanup owned by this operation.

**Confidence:** high source/runbook confirmation; concurrency outcome not simulated here.

## B7 — Medium / P2: public booking endpoints return internal exception messages

**Evidence:** `ServicePublicController.php:535–547` returns a unique/database exception verbatim for an unexpected violation and prefixes arbitrary Throwable messages with “Failed to create booking”. `:275,292,385` likewise exposes payment exception messages. `BookingPublicController.php:506,513,528` gives different existing/missing-payment messages and raw provider errors. Runbook already acknowledges these exceptions.

**Impact:** SQL/schema/provider diagnostic detail can be returned to unauthenticated callers. Payment IDs are high-entropy, so this is not a claim that users can enumerate arbitrary IDs in practice. The general DB-error response is the stronger concern.

**Recommendation:** return stable, safe public error codes with a request reference; log full diagnostics privately. Keep intended conflict/business-rule messages. Test query exceptions, provider failures, unexpected Throwable, invalid and other-tenant payment IDs for redaction without weakening payment ownership guards.

**Confidence:** high source confirmation; no production error was provoked.

## Configuration and product-scope observations

- Only Smoobu has a working PMS implementation. Other PMS/OTA entries are explicitly `comingSoon` in Settings.tsx:2187–2207 and `syncable=false` in PmsResolver.php:24–31. Sync endpoints return explicit unsupported messages. The legacy “connected — sync coming soon” banner is confusing but not evidence of a newly enabled functional integration. Improve wording to “credentials saved; integration unavailable”.
- `BookingCapability::staysBookableOnline` checks active room existence and the Smoobu enabled switch, not credentials/remote health. This is not enough to certify a venue launch. New/changed venues need an actual availability/quote/confirm/cancel smoke test with the intended PMS setup. No further asserted defect because engine failure/fallback modes depend on settings.
- Cancellation fees and partial member cancellation refunds are intentionally unavailable; a self-cancellation is full refund or none. Venues requiring fee policies need that scope decided before launch.
- Appointments deposit activation requires Setup's explicit activation stamp (`Deposits::SINCE`), not merely a historical full-admin checkbox. This is intentional compatibility behavior and should be made clear in onboarding/support.

## What was verified

Read CLAUDE.md, latest handoff, member portal and Appointments runbook sections; traced public booking quotes/confirmation, capacity/slot scheduler, PaymentIntent ownership/tenant guards, Smoobu normalization, stay extra pricing, money/refund/cancellation services, booking UI money contracts, setup capability and provider support checks.

Executed all six assigned existing test directories in separate scoped foreground commands with PHP 8.4.20, Xdebug off, explicit OpenSSL config, SQLite in-memory fixtures and mocked/fake providers/email. No bare `artisan test`.

| Scope | Passed | Skipped | Assertions |
| --- | ---: | ---: | ---: |
| tests/Feature/Member/Portal | 303 | 0 | 2688 |
| tests/Feature/Booking | 566 | 1 | 2631 |
| tests/Feature/Appointments | 408 | 0 | 2104 |
| tests/Unit/Portal | 32 | 0 | 66 |
| tests/Unit/Booking | 81 | 0 | 213 |
| tests/Unit/Appointments | 39 | 0 | 362 |
| Existing suite total | **1429** | **1** | **8064** |
| Private defect probes | **5** | **0** | **27** |

The one skip is WidgetStayUnderLockTest.php:306, which needs PostgreSQL advisory/row locking. The structural lock-order tests passed, but SQLite does not prove real concurrent PostgreSQL behavior. The private probes assert *observed defective behavior* to establish evidence, not the desired fixed behavior. The first arrival probe initially lacked a fixture timezone column; that private fixture was corrected, and the final probe suite passes. No application fix was made.

Artifacts in this directory: `results.json`, six `tests-*.log`, `repros-final.log`, `repros/AuditRefundStatusTest.php`, `repros/AuditStayArrivalTest.php`, `widget-summary-repro.cjs`, `widget-summary-rendered.html`.

## Not established by this audit

Live Stripe capture/refund/dispute/redirect behavior; actual production webhook subscriptions/signatures and event-delivery retries; Smoobu credentials/channel configuration/rate inventory sync; production PostgreSQL concurrent transactions; worker/cron health and failed-job remediation; actual SMTP deliverability, unsubscribe behavior and bounce handling; mobile Safari/Android browser camera/payment hardware behavior; app-store/mobile-client compatibility. Those require separate controlled environment/operational evidence, and their absence here is a verification gap, not proof of a fault.
