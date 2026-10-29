# Room booking cancellation copy — 29 October 2026

Owner requested removal of cancellation-policy promises from room booking, approval and confirmation:
each organisation publishes its policy on its website.

Removed the generated free-cancellation sentence and stored cancellation-policy prose from the stay review,
the policy/deadline display from stay booking details, and both current and legacy cancellation-policy text
from `BookingConfirmationMail`'s template. That template serves both the booking engine and staff-confirmed
reservations. A stay cancellation refused after the deadline now uses the existing translated venue-contact
sentence in the cancellation panel.

Arrival/departure times, prices, contact details, booking/cancellation buttons, API fields, eligibility,
refund outcomes and stored settings are unchanged. Appointment cancellation displays remain unchanged.
The public room widget itself contained no cancellation-policy copy; its contracts are unchanged.

## Verification

- Isolated release artifact: **94 PHP tests / 398 assertions**, including confirmation-mail rendering,
  widget/member booking confirmation and member cancellation.
- **5,766 frontend tests / 399 files**, TypeScript and fresh build pass.
- Repository lint regression gate passes; **1,393 existing diagnostics** remain. Direct changed-file lint
  flags the existing `setCouponNotice` effect in `StayReviewStep`; confirmed identical on prior main.
- Built Chrome fixture flow at **1440px and 390px**: dates → room → review → confirm → booking details;
  no cancellation-policy copy, preserved cancellation prompt/Keep it controls, no page errors.
- Synthetic email rendered and visually inspected; no customer booking, payment or email was created.
- Nine explicitly allowed source paths match the tested source. No migration or dependency change.

Source: `ef5fd831f07edd06e279bf43a6eb87fc38d74687`, branch `feature/room-booking-copy-20261029`.
Production artifact: `5ad1908b11f99b9806b09799382e10a1302de2b2`, parent
`9945e24bf0691735cb312e6f2ebe6826d2467f98`; source-patch recipe followed.
The next source-patch baseline is **ef5fd831f07edd06e279bf43a6eb87fc38d74687**.

Private logs, fixture script, email preview and screenshots: `E:/Hexa-Tech-room-copy-20261029/`.
Live content verified **19:37 Europe/Riga**: entry `index-C1_GFlwU.js`, portal `PortalApp-B2gWMIZ6.js`;
removed stay policy/deadline markers, service-only deadline guard, venue-contact error and retained booking
actions all pass. Health 200, member API without authentication 401, landing kit unchanged, retired CSS 404.
Evidence is in `2026-10-29-room-booking-copy-evidence/`. The temporary preview and deployment checkout were
removed after verification; the original source Vite server and unrelated files/worktrees remain untouched.
