# Booking journey review — 13 November 2026

Scope: the main platform's public stay booking page, member stay path, campaign administration, and their payment/confirmation/PMS boundaries. The owner authorised improving the flow, enabling the promo feature and deploying the verified update. The October launch audit was checked against current code before making changes: refund lifecycle/unknown outcomes, signed appointment quotes, arrival-day cancellation, currency-aware administration and safe public errors already have implementations and regression tests on main.

## Guest journey changes

| Step | Result |
| --- | --- |
| Dates | Calendar opens on the selected month, uses native keyboard-focusable date buttons, arrow navigation, a focus trap and Escape. A sold-out night stays blocked for arrival but can be a valid departure, including when editing an existing checkout. Availability-only updates refresh the calendar and retain focus. |
| Availability | Server errors remain visible and retryable. A failed availability request is not presented as a sold-out property. Quote dates and minimum/maximum nights are validated server-side on the venue's day. |
| Room choice | Keyboard selection retains focus. Multi-room quotes allocate guests once across rooms, with an adult in each, and pass those allocations to PMS reservations and booking rows. The whole booking still has one payment. |
| Extras | Cards show the full charge for the party and nights, plus the pricing basis. The sidebar uses the server's room total and final quote. Promo discounts remain accommodation-only. |
| Details | Labels are associated with fields, contact lengths match server validation, invalid email is caught before payment, and the invalid field receives focus. Special requests are retained for pay-at-venue bookings and visible in administration as well as Smoobu. |
| Quote expiry | The guest sees the expiry time and can review the stay for a new quote. The widget blocks card authorisation on a locally expired quote. Payment-intent responses carry the extended server expiry; the fixed campaign deadline remains enforced. |
| Card form | Main/sidebar controls both work and share disabled states. Repeated clicks are guarded. There is at most one automatic card-form reload, with a manual retry after failure. Rendering during Stripe's iframe lifecycle is avoided. |
| Payment retry | Payment creation is serialized by the hold row lock, with bounded Stripe calls. Reusable intents are reused even after `force_new`; funded ones resume confirmation, processing ones wait, and unreadable ones fail closed. A canceled intent requires a fresh quote because Stripe's original creation key must not be reused for a new payment. |
| Bank return | URL parameters never prove booking success. Same-tab recovery uses a temporary, organisation-scoped session snapshot and asks the server about the existing hold/payment before confirmation. Return secrets are removed from the address. Missing/expired recovery data produces a clear venue-contact message, never a fabricated booking reference. |
| Lost response | An authorised payment stays on confirmation recovery, with the same hold and intent. An uncertain bank reply offers a server status check. It never offers another card payment first. A consumed hold can resume the booking the writer already committed. |
| Webhook recovery | New public checkout holds save contact/request data before authorisation and carry `widget_checkout_version = 2`. Their succeeded-payment recovery goes through the existing booking writer, like promo holds. Historical unmarked holds keep their compatibility path; member holds remain excluded. |
| Confirmation | Success requires the server's successful booking response. It shows the real booking reference, server dates/accommodation/total when present, a copy-reference action and accurate email/payment wording. Reduced-motion preferences are respected. |

No client-supplied total is accepted. Member payment ownership checks, refund lifecycle, cancellation eligibility, locks, one-payment indexes and full-price stay extras remain covered by regression tests.

## Campaign administration

The Stay promotions page adds a launch summary, direct guest-booking link, code/name search, server-state filtering, quick pause/archive actions, sticky editor actions and clearer booking-close guidance. Saving errors stay visible in the editor; a stale draft can reload the server's saved revision. Accidental clicks on the backdrop do not discard an edited form. Inactive selected accommodation can be removed, and a campaign can be paused or archived after a room is deactivated; publishing still requires active own-organisation rooms.

## Forrest activation

The public page at `https://forrestglamp.lv` embeds `https://loyalty.hotel-tech.ai/book/j2Zr6S7OxWbuAp0YhdcgJvUnoBYAsCmr`. Its configuration was checked against the main portal and identifies the ForRest rooms. The identifier is public booking routing data, not an API credential.

Migration `2026_11_13_180000_enable_forrest_stay_promotions` resolves only this exact organisation/brand identifier, refuses an ambiguous match, and enables `booking_promotions_enabled` for that organisation. Other organisations are left alone. It prepares missing `VIPFORREST` (second night free, minimum two), `EARLYFOR20` (20%) and `BLACKFOR15` (15%) campaigns as drafts, with no guessed booking window or stay exclusions. Existing campaigns are never overwritten. Activation is audited and its setting cache is flushed. Rollback does not delete operator-owned campaigns.

Campaign dates remain a required owner input: booking-open/close times in the venue zone, excluded occupied-night ranges with years, eligible accommodation, and any additional minimum nights. An enabled promo input is separate from a published eligible campaign. The launch summary makes that distinction visible. Publishing refuses a campaign without booking dates.

## Verification

PHP 8.5 tests cover venue-day boundaries, server night limits, pre-payment contact storage, reused/funded/processing/canceled/unreadable payments, consumed-hold recovery, special requests, multi-room guest allocations, tenant-targeted activation and inactive-room campaign management. New database cases run on both SQLite and a fully migrated PostgreSQL database. Existing Booking, Unit/Booking, Member/Portal, Stripe, Widget and AdminAccess suites were also run.

`frontend/e2e/booking-journey.mjs` renders the actual Blade widget and runs thirteen isolated local browser scenarios: paid promotion with extras, unpaid details validation, lost-confirmation recovery, untrusted redirect rejection, owned redirect recovery, bounded iframe retry, unknown bank response, zero-total stay, availability retry, quote expiry, multi-room checkout, keyboard calendar and sold-out departure. Each rejects JavaScript errors, duplicate control IDs and horizontal overflow. The existing admin and promotion-widget browser checks cover campaign CRUD/date controls and mobile layout. All API/provider responses in these automated browser tests are local fixtures; no real card, PMS reservation or customer message is sent.

Deployment follows the separate source-patch worktree recipe. Verify the live admin chunk by the new campaign-launch text, the public Blade by the new recovery/calendar code, and Forrest's public configuration by `promotions_enabled: true`. A read-only live search/quote can validate rates; real card, capture/refund and reservation/cancellation checks require a controlled venue transaction and must be reported separately from mocked tests.
