# Stay promotions

The main portal owns campaign eligibility and prices. Smoobu supplies availability and nightly rates, and receives the discounted reservation price. Stripe charges the accepted quote. No matching Stripe coupon or Smoobu discount code is required.

## Staff setup

Open **Bookings → Stay promotions** (`/booking-promotions`). Managers can create, edit, duplicate, pause and archive campaigns. The page and its API require the booking product. Every promotion and room selection belongs to the current organisation; a selected brand narrows the scope.

Promo codes are disabled by default per organisation. Forrest's owner-requested activation is the targeted exception in `2026_11_13_180000_enable_forrest_stay_promotions`; see `docs/booking-journey.md`. Prepare drafts first, then enable **Promo codes at checkout**. Enabling also makes new member stay discounts apply to accommodation only. Existing quotes and venues with the switch off retain their prior member pricing rules.

Each campaign controls:

- A unique, case-insensitive code and campaign name.
- Percentage, fixed amount in the venue currency, or second night free.
- Minimum nights, with at least two required for second night free.
- Booking opens and closes, entered in the venue time zone shown on the page. Opens is inclusive; closes is exclusive. To include an entire final booking day, use midnight at the start of the following day.
- Optional first and last eligible stay nights, independently of when the booking is made. Empty bounds allow any available future stay.
- Excluded night ranges, both ends inclusive. Any excluded occupied night disqualifies the whole stay. Departure is not an occupied night.
- All accommodation or selected active rooms.
- Draft, published, paused or archived status. Published campaigns need a booking window. The page shows scheduled, active and expired states from that window.

Duplicate creates a draft requiring a new code. Editing uses a revision check: refresh a stale editor before saving. Changes and the checkout switch are audited. Usage figures are lifetime confirmed uses and accepted accommodation revenue after discount, not cancellation-adjusted sales reports.

For Forrest, create these campaigns after the exact booking window and exclusions are confirmed:

| Code | Type | Value | Minimum nights |
| --- | --- | --- | --- |
| VIPFORREST | Second night free | Actual second occupied night's verified rate | 2 |
| EARLYFOR20 | Percentage | 20% | 1, or the agreed campaign minimum |
| BLACKFOR15 | Percentage | 15% | 1, or the agreed campaign minimum |

The initial schema migration seeds no campaigns. The later Forrest activation prepares its three codes as drafts only; no booking window or stay exclusions are invented. December 31 exclusions are explicit calendar dates; add each required year.

## Pricing and checkout

Additional services always remain at full price in this feature. A fixed discount is capped at eligible accommodation value. Second night free deducts the actual second night's Smoobu rate once per eligible room, including a longer stay; it does not use an average or repeat every two nights. If that rate cannot be verified, checkout refuses the code and offers a retry.

Guests explicitly enter a code. Invalid, inactive or ineligible codes produce an error before payment, rather than silently charging full price. Members receive the better eligible campaign or member discount; discounts do not stack and a member coupon must still be selected explicitly. The client sends dates, rooms, extras and the code, never an amount.

The quote stores the campaign revision, rule snapshot, currency and exact per-room allocations. An accepted campaign price survives campaign edits or the end of its booking window until the hold expires. Payment retries can extend a hold only within a fixed 25-minute campaign deadline measured from the quote. A fresh quote rechecks all rules. Turning the switch off blocks new campaign quotes, while accepted quotes retain their price until expiry.

Stripe receives accommodation minus discount plus full-price extras. A zero-total campaign stay skips Stripe. Multi-room reservations carry the payment on the lead room, distribute stay discounts only to eligible rooms and keep extras at their full value on the lead room. Confirmation and payment webhook recovery use the existing booking writer. Replayed confirmations record only one campaign use for the whole hold.

The booking retains the original stay/discount/extras breakdown. Smoobu receives a net accommodation base price plus full-price add-ons, and the campaign code and amount in the reservation note. Later PMS refreshes preserve the recorded discount breakdown.

## Smoobu credentials

Existing API-key authentication continues when no signing secret is configured. For accounts using [Smoobu HMAC authentication](https://docs.smoobu.com/), enter **Booking Smoobu API Secret** alongside the API key in integration settings. The secret is encrypted and excluded from the settings cache and API responses. Brand-specific credentials also support a signing secret; a brand key never borrows an organisation's secret.

The signer covers the actual serialized request body, sorted encoded query, method, path, key, timestamp and a fresh nonce for each attempt. Signed calls require Smoobu's official HTTPS host. Use **Test connection** with the venue's credentials before activation. A live Smoobu or Stripe transaction was not made during development.

## Implementation and verification

Rules: `app/Services/Booking/StayPromotions.php`. Admin: `BookingPromotionController`, `/api/v1/admin/booking-promotions`, and `frontend/src/pages/BookingPromotions.tsx`. Public and member stay quotes share the same service and booking writer. Storage is in the two `2026_11_13_12*` migrations.

Focused checks (PHP 8.5):

```sh
php artisan test tests/Feature/Booking/StayPromotionsTest.php tests/Feature/Booking/BookingPromotionAdminTest.php tests/Unit/Booking/StayPromotionsTest.php
php artisan test tests/Feature/Smoobu tests/Unit/Support/SmoobuAuthenticationTest.php tests/Feature/Settings/HotelSettingEncryptedKeysTest.php
```

Also run the booking, member stay and admin access regressions, static analysis, frontend typecheck, lint baseline and Vitest. The new feature tests run on SQLite and a fully migrated PostgreSQL database. Browser fixtures in `frontend/e2e/booking-promotions.mjs` and `booking-promotion-widget.mjs` exercise the real admin SPA and rendered booking Blade view at desktop and mobile widths, with local API fixtures only.

After deployment, verify the new lazy-loaded admin bundle by content, open the page as a manager and keep the switch off until the venue's campaign dates, rates and connection are checked. Never put production credentials in test fixtures or documentation.
