# Member portal v2 — booking, member pricing, redesign

**Status:** design, awaiting the owner's review. **Date:** 2026-09-23.
**Branch:** `feature/member-portal-v2` (worktree `../Hexa-Tech-portal`, cut from production main `3727e6808`).
**Owner decisions (2026-09-23, "proceed"):** discount sources = tier benefits + claimed offers + reward codes through
the existing engine, plus a code on offers; pay online through Stripe when the venue has it enabled, else at the venue;
hotel members book through the real engine; points are awarded when a booking completes; light-first customer theme,
five languages, industry wording; three shippable phases (shell, services, stays + cancellation).

---

## 1. Goal

A member signs into their venue's portal, sees what their level earns them, books a service (any industry with a rota)
or a room (hotels) with their member price already applied, can add a coupon they hold, and manages the booking
afterwards. The venue configures its discounts once per tier. Staff see member bookings where they already work.

**Success criteria**

- A member on a phone completes a discounted service booking from the portal home in under two minutes.
- The booking appears on `/service-bookings` and `/calendar` (services) or `/bookings` (stays) with a "Member portal"
  source and a link to the member.
- The price the member pays equals the price the discount engine quoted; the coupon used is consumed exactly once and
  released if the booking is cancelled inside the policy window.
- Every portal string renders in en, ru, de, fr and es with the venue's industry wording.
- A medical venue (no loyalty programme by the locked product rule) gets the booking portal without any rewards UI.
- Each phase deploys on its own through the standard main-cut source-patch recipe and leaves production green.

**Non-goals (this programme)**

- A separate member domain or a separate build. The portal stays under `/portal/*` in the admin SPA.
- A promo-code subsystem with its own table and campaign tooling. A code on an offer is the coupon.
- Changes to the Expo mobile app or to any endpoint it calls today. Everything new is additive under a new prefix.
- Deposits for services, cancellation fees, brand-level loyalty programmes, one-email-many-venues, new PMS
  integrations, the rota timezone bug (§14 lists the follow-ups).

---

## 2. What exists (verified on main `3727e6808`)

| Area | Fact | Where |
|---|---|---|
| Portal | Nine lazy pages under `/portal/*` behind `MemberRoute`; hard-coded English with hotel wording; dark admin tokens; shares the admin login, title and manifest | `frontend/src/pages/portal/*`, `frontend/src/App.tsx:192-203, 277-286` |
| Theme | Org-level palette via CSS variables written by `applyThemeToDom()`; members fetch the public `/v1/theme`; a localStorage snapshot paints before React mounts | `frontend/src/hooks/useTheme.ts` |
| i18n | i18next, one `common` namespace per language (en, ru, de, fr, es); language from `admin_lang`, then `users.language`, then the browser | `frontend/src/i18n/index.ts` |
| Discount engine | `DiscountService::quote(member, amount, propertyId)`: typed tier benefits (`percent_discount`, `fixed_amount`) and every unused claimed offer are candidates; best single rule wins; capped at the bill; itemised `applied`/`considered` | `app/Services/DiscountService.php` |
| Engine callers | Only `Admin\DiscountController` (quote, useOffer, benefits) and `Member\BenefitController`. No booking flow calls it | `app/Http/Controllers/Api/V1/Admin/DiscountController.php` |
| Tiers UI | The assign form posts only `{tier_id, benefit_id, value}`, so every benefit saved through the UI is `value_type = text` and the engine ignores it | `frontend/src/pages/Tiers.tsx:436-447`, `BenefitAdminController::assignTierBenefit` |
| Offers | `special_offers` has type/value/tier_ids/dates/usage_limit/per_member_limit; claim creates a `member_offers` row (unique member+offer); claim does not check `tier_ids`; `useOffer` looks the claim up without a tenant scope | `app/Http/Controllers/Api/V1/Member/OfferController.php`, `DiscountController::useOffer` |
| Rewards | Points-priced catalogue; redeem creates a `REW-XXXXXXXX` code (pending → fulfilled/cancelled by staff); no machine-readable discount value | `app/Http/Controllers/Api/V1/Member/RewardController.php`, `app/Models/Reward.php` |
| Services engine | Rota-based slots (`ServiceSchedulingService`), public quote / payment-intent / confirm with advisory lock, idempotent replay, Stripe authorise-then-capture, confirmation emails; `service_bookings` already has `member_id` and `guest_id` | `app/Http/Controllers/Api/V1/ServicePublicController.php`, `app/Services/ServiceSchedulingService.php` |
| Member service booking | `POST member/service-bookings` books a slot but never sets `member_id`/`guest_id`, is always pending and unpaid, sends no email, applies no discount; no client calls it | `app/Http/Controllers/Api/V1/Member/MemberServiceBookingController.php` |
| Stay engine | Hold (10 min) → PaymentIntent (manual capture) → confirm under a room lock → Smoobu → mirror → emails → refunds; `booking_mirror` has `guest_id` only; website bookings carry `channel_name = 'Website'` | `app/Services/BookingEngineService.php`, `app/Http/Controllers/Api/V1/BookingPublicController.php` |
| Member stay request | `POST member/reservations` creates a priced-less CRM "Pending" row nobody lists; no client calls it | `app/Http/Controllers/Api/V1/Member/MemberReservationController.php` |
| "My bookings" | Reads the legacy `bookings` table, which only the demo seeder writes | `app/Http/Controllers/Api/V1/Member/BookingController.php` |
| Points | `calculateEarnedPoints()` (tier `earn_rate` is a multiplier, 1.0–3.0) has no callers; `points_per_currency` (base rate, presets 1–20) is written and never read; refunds reverse booking points nothing creates | `app/Services/LoyaltyService.php:385-411` |
| Capability | `PageContent::appointmentsBookable()` = active service + active master + active schedule; hotel pages are always bookable | `app/Landing/PageContent.php:258-301` |
| Fonts | Self-hosted woff2 under `public/landing/fonts/`: bodoni, cormorant, dm, fraunces, instrument, inter, italiana, manrope, newsreader, playfair, space | served on every host |
| Tests | Member endpoints have a real-token fixture (`MemberEndpointTestCase`); a bookable rota fixture exists (`SetsUpLandingSchema::seedBookableSchedule()`) | `tests/Feature/Member/`, `tests/Concerns/SetsUpLandingSchema.php` |

---

## 3. Architecture

### 3.1 Frontend

New folder `frontend/src/portal/`, replacing `frontend/src/pages/portal/` (deleted at the end of phase 1):

```
frontend/src/portal/
  PortalApp.tsx            route table for /portal/*, wraps MemberRoute + PortalShell + PortalProvider
  PortalShell.tsx          header (venue logo/name, member chip), bottom bar (phones), top tabs (≥ sm)
  PortalProvider.tsx       loads GET /v1/member/portal once; exposes venue, capabilities, member, policies, t()
  theme/portal.css         --p-* tokens (light), prefers-color-scheme dark block, [data-portal-theme] override
  theme/applyPortalTheme.ts writes the venue accent tokens + display face on the portal root
  ui/                      Button, Card, Sheet (bottom sheet on phones, dialog ≥ sm), Tabs, Field, Toggle,
                           Skeleton, Money, DateTime, Stepper, EmptyState, Notice, Chip
  lib/portalApi.ts         typed client for /v1/member/portal/* (thin wrappers over lib/api.ts)
  lib/money.ts             Intl.NumberFormat per venue currency + member locale
  lib/vocab.ts             industry nouns → portal.vocab.<industry>.<noun> keys
  pages/                   Home, Rewards (Benefits · Catalogue · Offers · My codes), Bookings, BookingDetail,
                           Book (phase 2: services; phase 3: stays), Profile, Join, Claim
  i18n/portal.<lang>.json  five files, namespace `portal`, registered by PortalProvider with addResourceBundle
```

Rules:

- Portal pages use only `p-*` Tailwind classes (mapped to `--p-*` variables, §4) and the portal `ui/*` primitives.
  No `dark-*`, `t-*`, `text-white` or admin components inside `frontend/src/portal/`. A vitest sweep enforces it.
- Every string goes through `t('portal.…')` with an English fallback; `localeCompleteness.test.ts` gains the
  `frontend/src/portal/**` scan target and the five `portal.<lang>.json` files, so a key missing in any language fails
  the suite (same net the landing pages use).
- The portal never calls an admin endpoint. The language switcher writes `PUT /v1/member/profile {language}`.
- `document.title` = venue name; the manifest link is swapped to `/manifest.webmanifest?app=portal` (server returns
  the sub-brand's "… Member" name, `start_url: /portal`, no admin shortcuts, light theme colour).
- New dependencies: `@stripe/stripe-js`, `@stripe/react-stripe-js` (phase 2). Nothing else. No motion library:
  transitions are CSS, respect `prefers-reduced-motion`, and the only orchestrated moment is the card reveal on Home.

### 3.2 Backend

New controllers under `App\Http\Controllers\Api\V1\Member\Portal\`, routed at `Route::prefix('member/portal')`
inside the existing member group (`saas.auth`, `auth:sanctum`, `tenant`, `brand`, `throttle:240,1`):

| Controller | Phase | Endpoints |
|---|---|---|
| `PortalController` | 1 | `GET member/portal` (bootstrap payload, §5.2) |
| `PortalBookingController` | 1, 3 | `GET member/portal/bookings?scope=upcoming\|past`, `GET member/portal/bookings/{kind}/{id}`, `POST member/portal/bookings/{kind}/{id}/cancel` (phase 3); `kind` ∈ `service`, `stay` |
| `PortalServiceBookingController` | 2 | `GET member/portal/services`, `GET …/services/availability`, `GET …/services/calendar`, `POST …/services/quote`, `POST …/services/payment-intent`, `POST …/services/confirm` |
| `PortalStayBookingController` | 3 | `GET member/portal/stays`, `GET …/stays/availability`, `POST …/stays/quote`, `POST …/stays/payment-intent`, `POST …/stays/confirm` |
| `PortalCouponController` | 2 | `POST member/portal/coupons/resolve` (§6.3) |
| `Public\PortalManifestController` | 1 | `GET /manifest.webmanifest?app=portal` (extends the existing manifest route) |

New services:

| Service | Purpose |
|---|---|
| `App\Services\Portal\PortalBootstrap` | builds the bootstrap payload: venue identity, capabilities, accent tokens (via `App\Support\Accent`), policies, member summary, counts |
| `App\Services\Booking\BookingCapability` | `appointmentsBookable(orgId, brandId?)` and `staysBookable(orgId)`; `PageContent::appointmentsBookable()` delegates to it (one source of truth) |
| `App\Services\Booking\MemberPricing` | wraps `DiscountService` for bookings: scope (`services`/`stays`), the explicit-coupon rule (§6.2), the consume/release of a coupon, and the persisted discount columns |
| `App\Services\Portal\MemberBookingQuery` | the member's bookings across `service_bookings` and `booking_mirror` as one DTO list (§5.3) |
| `App\Services\Booking\ServiceBookingCancellation` | policy check, status change, refund or PaymentIntent cancel, emails, coupon release (phase 3) |
| `App\Services\Loyalty\BookingPointsService` | awards points when a booking completes (§6.6) |
| `GuestMemberLinkService::ensureGuestForMember()` | the inverse of the existing `ensureMemberForGuest()`; every member booking carries `guest_id` |

`DiscountService` grows a `quoteForBooking(member, amount, BookingScope $scope, ?CouponSelection $coupon)` next to the
unchanged `quote()`, so the counter flow keeps its behaviour.

### 3.3 Data flow, service booking (phase 2)

```
Book page ─GET services──────────▶ catalogue + member price preview per service
         ─GET availability───────▶ slots (scheduler, org settings)
         ─POST quote─────────────▶ reserveSlot check · list totals · MemberPricing → {list, discount, total, applied, coupon}
         ─POST payment-intent────▶ (online only) PI for the discounted total, metadata {kind, org, member, service, start}
   Stripe PaymentElement confirm ▶ PI requires_capture
         ─POST confirm───────────▶ lock → reserveSlot → recompute pricing → PI amount == total → ServiceBooking
                                    (member_id, guest_id, source member_portal, discount columns) → consume coupon
                                    → emails → realtime event → 201 {booking}
```

The server recomputes every amount at every step and never trusts a client total. A quote is not a reservation; the
slot is taken only inside the confirm lock, exactly as the public widget does.

---

## 4. Design system and theming

**Direction.** A customer product in the venue's colour, not an admin tool: paper surfaces, one dark "spotlight" band
(the member card), two typefaces, a single accent, generous radius (16–20 px on cards, 12 px on inputs), soft shadow
and a 2 px hover lift. Signature element: the member card on Home, which is also the thing shown at the counter.

**Tokens** (`frontend/src/portal/theme/portal.css`, scoped to `[data-portal]`):

| Token | Light | Dark (`prefers-color-scheme: dark`, and `[data-portal-theme="dark"]`) |
|---|---|---|
| `--p-bg` | `#F7F6F3` | `#0F1113` |
| `--p-surface` / `--p-surface-2` | `#FFFFFF` / `#F0EEE9` | `#181B1F` / `#22262B` |
| `--p-text` / `--p-text-2` | `#17191C` / `#5F646B` | `#F2F2F0` / `#A2A7AE` |
| `--p-border` | `#E4E1DA` | `#2E333A` |
| `--p-accent` / `--p-accent-ink` / `--p-accent-deep` | from the venue (§4, accent) | dark variants from the same source |
| `--p-success` / `--p-warning` / `--p-danger` | `#1A6B43` / `#8A5C00` / `#B3261E` | `#4CC38A` / `#E5B95C` / `#F28B82` |
| `--p-scrim` (sheet backdrop, used at 50 %) | `#17191C` | `#000000` |
| `--p-radius-card` / `--p-radius-control` | 18 px / 12 px | same |
| `--p-font-display` / `--p-font-body` | industry face / Inter | same |

Body text contrast is ≥ 4.5:1 in both modes (the values above are chosen for that; the plan's screenshot step
verifies with a contrast check — that pass found the first draft's light `--p-warning`, `#9A6700`, at 4.29:1 on the
paper and lowered it to `#8A5C00`, 5.07:1; phase 2's browser pass measured the light `--p-success`, `#1F7A4D`, at
4.31:1 as text on its own 10 % tint over the paper — the banner/notice/chip pairing — and lowered it to `#1A6B43`,
5.22:1; `frontend/src/portal/theme/contrast.test.ts` now pins every tone pair at ≥ 4.5:1 in both modes). Tailwind gains a `p` colour namespace (`p-bg`, `p-surface`, `p-text`, `p-accent`,
…) bound to these variables with `<alpha-value>` support, plus `rounded-p-card` / `rounded-p-control`.

**Accent.** The bootstrap payload carries `venue.accent = {hex, ink, deep, dark_hex, dark_ink, dark_deep}` computed
server-side by `App\Support\Accent::for()` (the contrast-checked routine the landing kits use), from the venue's
`primary_color` appearance setting. `deep` is the accent darkened until it reads as text on the surface; the "soft"
tint is not a payload key but the accent at 10 % over the surface (`bg-p-accent/10`, with `text-p-accent-deep` on it),
so the client still derives no colour ramp. The client writes the six values. A venue
without a colour gets the industry default: hotel `#B8924A`, beauty `#B04A6E`, medical `#1F7A73`,
restaurant/hospitality `#B5552F`, fitness `#2E7D5B`, every other industry `#2F5D8A` (each run through the same
routine, so the ink and soft variants are never hand-picked).

**Type.** Display face by industry, loaded with `@font-face` from `public/landing/fonts/` (already self-hosted, served
on every host): hotel → Playfair Display, beauty → Cormorant Garamond, medical → Fraunces, restaurant/hospitality →
Newsreader, fitness → Space Grotesk, every other industry → Manrope. Body and UI stay Inter (already loaded by the
SPA). The display face is used for the page title, the card balance and section headings only.

**Layout.** One column, `max-w-3xl`, 16 px gutters on phones; sticky blurred header; a fixed bottom bar on phones with
safe-area padding and 44 px targets; top tabs from `sm`. The bar shows Home · Book · Rewards · Bookings · Profile;
"Book" appears only when `capabilities.services || capabilities.stays`, "Rewards" only when `capabilities.loyalty`.
Sheets open from the bottom on phones and as centred dialogs from `sm`, trap focus, close on Esc, and restore focus.

**Motion.** 160–220 ms ease-out transitions on hover/press and sheet open; the Home card fades and rises once on
first paint; nothing else moves. `prefers-reduced-motion` disables all of it. Visible focus rings on every control.

**Quality bar (from the house style, checked with screenshots at 390 and 1440 in light and dark).** No near-black +
single neon + Inter-only look; two typefaces; surface rhythm (paper + the dark card band); the card visible on phones;
persistent bar and reachable primary action; honest copy (no invented metrics); contrast ≥ 4.5:1; restrained motion;
one signature element; optimised images with alt text.

---

## 5. Phase 1 — shell, foundations, existing features

### 5.1 Pages

| Page | Route | Content |
|---|---|---|
| Home | `/portal` | member card (balance, tier chip, progress bar, QR, member number, wallet buttons); next booking card (from §5.3) or a "Book" prompt when bookable; quick actions; recent activity; venue contact footer. Without loyalty: the card shows the member's name, number and QR only |
| Rewards | `/portal/rewards` (tabs `benefits`, `catalogue`, `offers`, `codes`) | tier benefits with typed values shown as "10% off treatments"; catalogue with redeem sheet; offers with claim; **My codes**: pending redemptions with their `REW-` codes and claimed offers (fixes the code-only-in-a-toast defect; uses `GET member/my/redemptions`) |
| Bookings | `/portal/bookings` | upcoming and past across both booking kinds; detail sheet with reference, time, place, price, discount line, status, policy text, venue contact |
| Profile | `/portal/profile` | name, phone, date of birth, language (writes `users.language` through the member profile endpoint), notification and marketing toggles, password change (`PUT member/password`), referral link share (`GET member/referral`), delete account, sign out |
| Join | `/portal/join?org=…` | rethemed; `GET public/join/{token}` now also returns `theme` (accent tokens, logo, industry) so the page paints the venue before any session exists |
| Claim | `/portal/claim` | rethemed; same copy fixes |

The existing `PortalRewards` bug (reads `r.consumed`, API sends `claimed_by_me`) disappears with the rewrite.

The "Book" destination is built in phase 2; in phase 1 the bar has four items (three without loyalty), and the Home
"Book" prompt is absent even for bookable venues, so nothing points at a page that does not exist yet.

### 5.2 Bootstrap payload — `GET member/portal`

```json
{
  "venue": { "name": "…", "logo_url": null, "industry": "beauty", "currency": "EUR", "timezone": "Europe/Riga",
             "contact": { "email": "…", "phone": "…" },
             "accent": { "hex": "#8E2A5B", "ink": "#FFFFFF", "deep": "#6B1F44", "dark_hex": "#E38AB0", "dark_ink": "#1A0B12", "dark_deep": "#F0B8D0" },
             "display_face": "cormorant" },
  "capabilities": { "loyalty": true, "services": true, "stays": false, "chat": true,
                    "payments": { "services": true, "stays": false, "publishable_key": "pk_live_…" } },
  "policies": { "services_cancel_hours": 24, "booking_cancel_hours": 48, "services_cancellation_policy": "…" },
  "member": { "…getMemberSummary()…", "benefits": [ { "name": "…", "value_type": "percent_discount", "value_amount": 10, "applies_to": "services", "display": "10% off treatments" } ] },
  "counts": { "unread_notifications": 2, "upcoming_bookings": 1 }
}
```

- `capabilities.loyalty` = the organisation has an active tier **and** its industry is not `medical`.
- `capabilities.services` = `BookingCapability::appointmentsBookable()`; `capabilities.stays` = industry `hotel` and
  at least one active `booking_rooms` row.
- `capabilities.payments.<kind>` = `StripeService::isEnabled()` and not `booking_mock_mode` and the kind's currency
  setting (`services_currency` / `booking_currency`) equals `stripe_currency` (case-insensitive). A mismatch logs a
  warning once per request and falls back to pay-at-venue rather than charging in the wrong currency.
- The industry comes from `crm_settings.industry_preset` (the value `CrmAiService::resolveIndustry()` reads), through a
  small shared resolver so the portal and the AI agree.
- The endpoint is the portal's only startup call besides `auth/me`. `GET member/profile` stays as it is for the app.

### 5.3 "My bookings" — `MemberBookingQuery`

A booking belongs to the member when, within the member's organisation, `member_id = member.id`, **or** `guest_id` is one
of the member's linked guests (`guests.member_id`), **or** — only once the member has proven their email
(`users.email_verified_at` set) — the booking's customer/guest email equals the member's email (case-insensitive).
The email rule gives members their history from the widget and the app's WebView, which never linked a member.
The verification gate is a ruling from the phase 1 build (Task 4 review): self-registration takes any unused email
with no code step, so an unverified email would let a stranger read a booker's history. The claim flow, whose code is
sent to the address, stamps `email_verified_at`; self-registered members get the email rule once a verification step
exists (phase 2 can add one). Sources: `service_bookings` (all statuses except cancelled older than 90 days) and
`booking_mirror` (read with the Smoobu integration scope as the admin sees it, so a venue that switched Smoobu off
hides the same rows everywhere). Each row is normalised to:

```
{ kind: 'service'|'stay', id, reference, title, subtitle, starts_at, ends_at, status, payment_status,
  total, currency, discount: {amount, label} | null, can_cancel: bool, cancel_deadline: iso | null }
```

Ordered by start ascending for `upcoming`, descending for `past`, 20 per page. The legacy `GET member/bookings`
(mobile app) is left untouched.

### 5.4 Admin and email touches

- Members hub → a "Member portal" card with the join link (`/portal/join?org=<default brand widget_token>`), a QR of
  it and a copy button. Today no screen shows the link.
- `WelcomeMemberMail` and `BookingMembershipMail` link to `/portal/claim` (the flow they describe) instead of telling
  the reader to use "Forgot password".
- `PublicJoinController@show` returns `theme` (accent tokens, logo, industry, venue name).

### 5.5 Tests

- Backend: `PortalBootstrapTest` (capabilities per industry/rota/rooms/payments, medical has no loyalty, currency
  mismatch → at venue, tenant isolation), `PortalBookingsTest` (the three ownership rules, cross-tenant email
  never matches, Smoobu scope), `PublicJoinThemeTest`, and the portal cases in `Pwa\WebManifestTest`.
- Frontend: `tsc -b`, vitest; new render-to-string tests for the shell (bar items follow capabilities), the money
  and date formatters, the token sweep (no admin classes inside `frontend/src/portal/`), and the locale
  completeness sweep over the five `portal.<lang>.json` files.
- Eyes first: screenshots at 390 and 1440, light and dark, for Home, Rewards, Bookings, Profile, Join, checked against
  the §4 quality bar before tests are run.

---

## 6. Phase 2 — service booking with member pricing, coupons, payment

> **Built 2026-09 — decisions recorded while planning and building.** Rulings plan2-1..8 are
> recorded in the plan's header (`docs/superpowers/plans/2026-09-25-member-portal-v2-phase-2.md`);
> read them alongside this section — the owner may overturn any of them. Execution surfaced these
> decisions that changed or sharpened what §6 says below:
> - The booking window (§6.2/§6.4) refuses with two specific codes, `too_soon` and `too_far_ahead`,
>   not one generic error.
> - A slot that was just taken raises a dedicated `SlotTakenException`, not a generic runtime error,
>   so the portal controller can tell it apart from an unrelated failure.
> - The payment guard (`PortalPaymentIntentGuard`) binds an intent to one slot and one booking by
>   its metadata, refuses one that already pays for another booking, releases the hold on every
>   failed confirm, and never cancels an intent a real booking already carries — and only ever
>   cancels the calling member's own intent, never a stranger's.
> - Portal PaymentIntents are created with `allow_redirects: 'never'`; redirect-based payment
>   methods are off this phase.
> - Add-on (extra) prices are sent to the portal as numbers; the public widget's own payload is
>   left as the legacy string form it has always sent.
> - The offer per-member limit (§6.3) is enforced by the one-claim-per-member design — `member_offers`
>   unique on `(member_id, offer_id)` — not by counting claims against `per_member_limit`.
> - Points on completion (§6.6) are awarded by explicit calls from both admin endpoints that can
>   complete a booking (`updateStatus` and `bulk`), not by a model observer, because `bulk` writes
>   through the query builder and fires no events.
> - A unique index on `(organization_id, stripe_payment_intent_id)` was deferred at this phase pending a
>   production data check; `assertUnused()` was then the only guard. Phase 3 added the index (see the
>   note at the start of §7).

### 6.1 Flow (member side)

1. **Choose** — `GET member/portal/services` returns categories, services (with `list_price` and `member_price`, the
   automatic tier discount applied to the service price alone, for the "Your price" line), masters, extras and the
   org rules (`lead_minutes`, `slot_step`, `max_advance_days`, `allow_master_choice`). Same catalogue as the public
   widget, minus widget styling.
2. **When** — `GET …/services/calendar` (dates with any working window) and `GET …/services/availability` (slots).
   Slots show the scheduler's `time_label` exactly as the public widget does (§14 on the timezone follow-up).
3. **Review** — `POST …/services/quote` with `{service_id, master_id?, start_at, party_size?, extras[], coupon?}`
   returns the itemised price (§6.2), the payment mode and the policy text. The member can pick a coupon here: chips
   for their unused claimed offers and pending discount rewards, or a code field. Re-quoting is free.
4. **Pay** — online: `POST …/services/payment-intent` creates the PaymentIntent for the **discounted** total and the
   page mounts Stripe's PaymentElement; at venue: skipped.
5. **Confirm** — `POST …/services/confirm` with the same selection, the coupon, `payment_intent_id` (online) and an
   `Idempotency-Key` header. Response: the booking DTO of §5.3. The Bookings page opens on it with a confirmation
   banner and a "Add to calendar" (.ics download) link.

### 6.2 Pricing rules — `MemberPricing` over `DiscountService::quoteForBooking()`

- **Automatic:** active typed tier benefits whose `applies_to` is `all` or the booking's scope (`services` here,
  `stays` in phase 3). Same maths as today: percent of the list total, fixed amount capped at the total.
- **Explicit only:** offers and reward codes are candidates only when the member selected or entered them. The
  counter flow's "every unused claim is a candidate" rule is not used for bookings, because applying a claim the
  member did not choose would consume it silently.
- **Best single rule wins; nothing stacks; never more than the bill** (unchanged). When the automatic benefit beats
  the selected coupon, the quote says so (`coupon.status = 'outbid'`, with the winning label) and the coupon is
  **not** consumed at confirm.
- The list total is service price (master override respected) plus extras; the discount applies to that total.
  `list_amount`, `discount_amount`, `discount_source` (`tier_benefit` \| `offer` \| `reward`), `discount_source_id`
  and `discount_label` are stored on the booking; `total_amount` is what the member pays.
- Currency: the service's currency (fallback `services_currency`), returned in every response; the PaymentIntent is
  created only when it equals `stripe_currency` (§5.2).

### 6.3 Coupons — `POST member/portal/coupons/resolve {code}` and the quote's `coupon` selection

- **Offer codes.** `special_offers.code` (nullable, uppercase, 4–24 chars, unique per organisation). Resolving a code
  finds the active offer in the member's organisation, checks the date window (end date inclusive, matching the
  engine), `tier_ids` (a Bronze member cannot use a Gold-only code — this check is also added to the existing
  `POST member/offers/{id}/claim`, which skips it today), capacity and the per-member limit, then creates or reuses
  the member's unused claim. The response is the claim summary the quote accepts as `coupon: {member_offer_id}`.
- **Reward codes.** A `REW-…` code resolves to the member's own pending redemption; anyone else's code, a fulfilled
  or cancelled one, or a reward with no typed discount answers 422 with a specific message. Rewards gain
  `discount_type` (`percent_discount` \| `fixed_amount` \| null) and `discount_value`; only typed rewards are coupons.
  The response is `coupon: {redemption_id}`.
- **Selection in quote/confirm:** exactly one of `member_offer_id` or `redemption_id`, both belonging to the member.
- **Consumption at confirm (inside the booking transaction):** offer claim → `used_at = now()`, `status = 'used'`,
  `used_reference = <booking reference>`; redemption → `status = 'fulfilled'`, `fulfilled_at = now()`,
  `notes = 'Applied to <reference>'`. A coupon that was `outbid` is left untouched.
- **Release on cancellation (phase 3):** the reverse writes, only when the booking is cancelled inside the policy
  window, so a coupon is never lost to a no-show that the venue chose to forgive by hand.
- Codes are compared uppercase and trimmed; five failed resolutions per minute per member answer 429
  (`throttle:5,1,portal-coupon`).

### 6.4 Confirm — `PortalServiceBookingController@confirm`

Inside `pg_advisory_xact_lock` on the master (or service) key, in one transaction: `reserveSlot()` again; recompute the
quote; if a `payment_intent_id` is given, retrieve it and require `metadata.org_id` = this org, `metadata.member_id`
= this member, `amount` = the discounted total in minor units and status `succeeded` or `requires_capture`, else 409
`payment_mismatch` (and the PI is cancelled the way the widget's rescue path does); create the `ServiceBooking` with
`member_id`, `guest_id` (`ensureGuestForMember()`), `customer_*` from the user, `source = 'member_portal'`,
`status = 'confirmed'` (or `'pending'` when the new setting `services_require_staff_confirmation` is on),
`payment_status` `authorized`/`paid` (online) or `unpaid` (at venue), the discount columns; write the extras rows;
consume the coupon; record the submission for idempotent replay (`service_booking_submissions`, as the widget does).
After commit: `ServiceBookingConfirmationMail` to the member (which starts reading the `services_cancellation_policy`
key the admin actually saves; today it reads `service_cancellation_policy` and the policy never appears),
`AdminBookingNotificationMail` to the venue, the realtime event, and the audit row. Capture is left to the existing
`bookings:capture-pending-pis` job, as for widget bookings.

`POST member/service-bookings` (the half-built endpoint no client calls) is removed together with its controller in
this phase; the route comment records why.

### 6.5 Admin configuration the feature depends on

- **Tiers → assign benefit** gains value type (percent / fixed amount / points multiplier / text), amount and
  "applies to" (everything / services / stays). Re-assigning keeps the typed value unless the admin changes it (today
  it silently resets to text).
- **Offers form** gains code, tier targeting (`tier_ids`), per-member limit and "applies to"; type choices become
  `discount` (percent) and `fixed_amount`.
- **Rewards form** gains discount type, value and "applies to".
- **Presets** seed typed tier benefits for the money-shaped perks they already print (e.g. "15% off treatments" →
  percent 15, services), so a new venue gets enforceable discounts.
- `loyalty:type-benefits {--apply}` parses existing prose values of the exact forms `NN% off …` and `<currency>NN off …`
  into typed values; dry-run by default, prints the plan, and only `--apply` writes. Anything else stays text.
- **Service bookings list/detail and the unified calendar** show a "Member portal" source badge, the member link and
  the discount line.

### 6.6 Points for completed bookings — `BookingPointsService`

- Trigger: a service booking whose status becomes `completed` (admin status change, existing endpoint); for stays,
  a daily job `bookings:award-stay-points` awards for mirrors whose departure date has passed and whose status is
  not cancelled/no-show (phase 3).
- Points = `floor(paid_amount × points_per_currency × tier earn_rate × best event multiplier × tier points
  multiplier)`, where `paid_amount` is the discounted total. `calculateEarnedPoints()` gains the `points_per_currency`
  base (default 1 when the setting is absent) — the setting exists and is written by presets but read by nothing.
- Guarded by the setting `points_on_bookings` (default on), by `capabilities.loyalty`, and by an idempotency key
  `booking_points_<kind>_<id>` (the ledger's existing replay guard). `points_awarded_at` is stamped on the booking.
  `reference_type` = `service_booking` / `booking_mirror`, so `BookingRefundService`'s existing reversal of
  `booking_mirror` points finally has rows to reverse; service refunds (phase 3) reverse the same way.

### 6.7 Security fixes shipped with this phase (they sit on the paths the portal calls)

- `DiscountController::useOffer` looks the claim up through the member's organisation (a staff user of org A can
  mark org B's claim used today).
- `POST member/offers/{id}/claim` enforces `tier_ids`.
- `SpecialOffer::scopeActive` treats `end_date` as inclusive of the last day, matching the engine.
- The admin discount routes get `staff.can:can_redeem_points`.

### 6.8 Schema (additive, idempotent, reversible)

| Table | Change |
|---|---|
| `special_offers` | `code` string(24) nullable, unique `(organization_id, code)`; `applies_to` string(12) default `all` |
| `member_offers` | `used_reference` string(32) nullable |
| `rewards` | `discount_type` string(20) nullable; `discount_value` decimal(10,2) nullable; `applies_to` string(12) default `all` |
| `tier_benefits` | `applies_to` string(12) default `all` |
| `service_bookings` | `list_amount` decimal(10,2) nullable; `discount_amount` decimal(10,2) default 0; `discount_source` string(20) nullable; `discount_source_id` bigint nullable; `discount_label` string(120) nullable; `points_awarded_at` timestamp nullable |
| `hotel_settings` (rows, no DDL) | `services_require_staff_confirmation` (false), `points_on_bookings` (true), `services_cancel_hours` (24), `booking_cancel_hours` (48), `portal_enabled` (true) — seeded by the settings registry so the admin endpoint can create them |

### 6.9 Tests

- `DiscountServiceBookingTest`: scope filtering, explicit-coupon rule, outbid coupon not consumed, caps.
- `PortalCouponTest`: offer code happy path, wrong tier, expired, capacity, per-member limit, another member's REW
  code, untyped reward, throttle.
- `PortalServiceBookingTest` (on `MemberEndpointTestCase` + `seedBookableSchedule()`): catalogue prices, slots
  respect lead time and max advance days, quote itemisation, confirm writes member/guest/source/discount, coupon
  consumed once (replay with the same idempotency key does not double-consume), slot race answers 409, cross-tenant
  service id answers 404, PI amount mismatch answers 409, pending vs confirmed setting, emails queued.
- `BookingPointsServiceTest`: formula, idempotency, loyalty-off venues award nothing, refund reversal.
- Admin: typed benefit assign/re-assign, offer code uniqueness per org, `loyalty:type-benefits` dry-run vs apply.
- Frontend: the price breakdown component, the slot picker (empty day, lead-time cut), the coupon field states.
- Eyes first: the four booking steps at 390 and 1440, light and dark; a real Stripe test-mode payment end to end on
  a local venue with mock mode off.

---

## 7. Phase 3 — stays and self-service cancellation

> **Built 2026-10, with these departures** (plan `docs/superpowers/plans/2026-09-29-member-portal-v2-phase-3.md`,
> rulings plan3-1 … plan3-21 — the ruling numbers recorded while planning and executing this phase, in the plan's
> own header and in its progress ledger; decision #5 "no patient loyalty programme" reversed by the owner): single
> rooms only, combinations deferred (portal-9, this spec's own §11 ruling that a combo stay's discount is split pro
> rata across its rooms, not built — moot while combinations are not sold); the stays payment intent stayed in the
> portal controller, keyed on a hold that names its member (`portal_hold_token`), and `paymentIntentForHold()` was
> not extracted; a hold is its own idempotency key; a released hold stores `payment_status = cancelled`, a refund
> `refunded`; stays are gated on capability and the Smoobu switch, not on the hotel industry; `MemberBookingQuery`
> lives in `App\Services\Portal`. Also built, after this note was first written: an appointment's stored
> `start_at`/`end_at` are the venue's wall clock, not UTC, however the scheduler's shared `+00:00` suffix reads —
> `App\Services\Portal\AppointmentClock` is the one place the portal turns one into a true instant (on the way
> out) or takes one back from the client (on the way in), so every value the scheduler, a PaymentIntent or a
> stored row sees is still byte for byte what the public widget would have used. Cancellation
> converges (finishes with no further Stripe call) when a booking's money is already back in full but the
> booking itself was never marked cancelled — the shape a failure between the refund and the last write leaves
> behind, healed by the member simply cancelling again — but a booking staff already cancelled AND refunded
> does not converge: it answers `already_cancelled`, since that cancellation is not the member's to stamp. For a stay,
> telling those two apart needs its own marker (`booking.member_cancel_started`, an audit row committed right
> before the refund is asked for) because the PMS sync relabels a refunded stay's status to `cancelled` within
> seconds of the refund's own PMS cancellation either way.
>
> **The public stay confirm's failure rescue was narrowed, with the owner's permission of 2026-09-29 (an
> exception to the ruling that the public booking widget does not change).** When the public `booking/confirm`
> fails after a card was authorised, its rescue used to cancel or refund whatever payment id it was handed —
> including a payment a booking already carried, since the endpoint needs nothing but the venue's widget token.
> It now gives back only a payment that carries this request's own hold token in its metadata (`hold_token`,
> which the stay widget writes) and that no booking carries; anything else is refused and audited
> (`booking.confirm.pi_rescue_refused`, with a reason). An honest guest's own payment is rescued as before; the
> public confirm's requests, responses and error text are unchanged.
>
> **The portal's time zone is the one the venue set in Settings, not a column nobody writes.**
> `PortalBootstrap::timezone()` reads Settings → General → Timezone (`hotel_settings.hotel_timezone`) first and
> `organizations.timezone` second, taking a value only when it names a zone (a location name such as
> `Europe/Riga`, or a name of UTC); abbreviations such as `EET` and offsets such as `+03:00` are ignored. The
> first source that names a zone other than UTC wins; a venue left at `UTC` stays on UTC.
>
> **One payment pays for one service booking, as a database rule.** Within one organisation a payment intent id
> appears on at most one row of `service_bookings`: a partial unique index, `service_bookings_org_pi_unique`, on
> `(organization_id, stripe_payment_intent_id)` where the id is neither NULL nor the empty string, created by the
> migration `2026_10_01_100000_service_bookings_unique_payment`. The migration never fails a deploy on data it did
> not expect: if an organisation already has a repeated payment id it creates nothing, edits nothing and logs a
> warning (`service_bookings_unique_payment: …`), because which booking keeps a payment reference is a person's
> decision. The portal's service confirm checks first (`PortalPaymentIntentGuard::assertUnused()` under the `pi:`
> lock) and answers a payment the index refuses with 409 `payment_mismatch`, releasing nothing. The public
> services confirm, which the rule now also binds, checks before its insert and answers a payment a booking
> already carries with HTTP 409 and "This payment has already been used for a booking." — also for two requests
> at the same moment (the index refuses the second insert) and for a mock payment id; nothing is cancelled,
> refunded or captured for the refused request, and every other error keeps the answer it had. A retry with the
> same `Idempotency-Key` is still answered by the replay, which runs before the check.

### 7.1 Stay booking (hotels)

- `GET member/portal/stays`: rooms (`booking_rooms`: name, gallery, max guests, base price, amenities), extras,
  policies, currency, payment mode — the public `booking/config` shape without widget styling.
- `GET …/stays/availability?check_in&check_out&adults&children`: `AvailabilityService::check()`, including the
  2–3-room combinations the widget offers.
- `POST …/stays/quote {unit_id | unit_ids[], check_in, check_out, adults, children, extras[], coupon?}`:
  `BookingEngineService::quote()` / `quoteCombo()` then `MemberPricing` with scope `stays`; the hold payload gains
  `member_id`, `list_total`, `discount`, `discount_source`, `discount_label` and `gross_total` becomes the discounted
  total, so the existing payment-intent code charges the right amount without change.
- `POST …/stays/payment-intent {hold_token}`: the existing `BookingPublicController@paymentIntent` body is extracted
  into `BookingEngineService::paymentIntentForHold()` and shared; the member route binds the organisation from the
  session instead of a widget token, and the hold must carry this member's id.
- `POST …/stays/confirm {hold_token, special_requests?, payment_intent_id?}`: guest built from the member (first/last
  name split on the first space, email, phone); `BookingEngineService::confirm()` unchanged except that it copies the
  member and discount fields from the hold onto the mirror (`member_id`, `list_total`, `discount_amount`,
  `discount_source`, `discount_source_id`, `discount_label`) and stamps `channel_name = 'Member portal'` where the
  widget stamps `'Website'`. Smoobu receives the discounted price, so the PMS matches the charge. The coupon is
  consumed inside the same transaction; on any confirm failure the existing rescue path releases the payment and the
  coupon is untouched.
- Combination bookings share one coupon: it is consumed once, and the discount is split across mirrors pro rata to
  their room totals (whole cents, remainder on the first room).
- `POST member/reservations` and `MemberReservationController` are retired (no client calls them; the app books
  through the widget WebView).

### 7.2 Cancellation — `POST member/portal/bookings/{kind}/{id}/cancel`

- Allowed when the booking is the member's (§5.3 rules), its status is `pending`/`confirmed` (services) or
  `new`/`confirmed` (stays), and the start is more than `services_cancel_hours` / `booking_cancel_hours` away.
  Otherwise 422 `outside_policy` and the portal shows the venue's phone and email instead of a button.
- Services: status `cancelled`, `cancelled_at`, `cancellation_reason = 'member_portal'`; online payments are refunded
  through a new `ServiceBookingRefund` step (full refund of a captured PI, or cancellation of an uncaptured one;
  `payment_status = refunded`); `ServiceBookingCancelledMail` to the member and the venue notification; awarded
  points, if any, reversed with the ledger's `reverse` type.
- Stays: `BookingRefundService::applyRefund()` for the full paid amount (it already handles Stripe, points reversal,
  Smoobu cancellation and `BookingRefundMail`), then `internal_status = 'cancelled'`.
- The coupon is released (§6.3) in the same transaction.
- Staff-side cancellation already exists and is unchanged; the member sees the resulting status on the next load.

### 7.3 Schema

| Table | Change |
|---|---|
| `booking_mirror` | `member_id` FK nullable → `loyalty_members` (index `(organization_id, member_id)`); `list_total`, `discount_amount`, `discount_source`, `discount_source_id`, `discount_label`, `points_awarded_at` as on `service_bookings` |
| `booking_holds` (JSON payload, no DDL) | `member_id`, `list_total`, `discount`, `discount_source`, `discount_source_id`, `discount_label` |

### 7.4 Tests

- `PortalStayBookingTest`: availability proxies the engine; quote writes the member and discount into the hold;
  payment intent charges the discounted total; confirm stamps member/channel/discount on the mirror, consumes the
  coupon once, splits a combo discount, replays idempotently; a hold made by another member answers 404.
- `PortalCancellationTest`: inside/outside the window for both kinds, refund and PI-cancel paths (Stripe faked),
  coupon released, points reversed, emails queued, staff-cancelled booking cannot be cancelled twice.
- `bookings:award-stay-points`: idempotent daily run.
- Eyes first: room list, dates, review, pay, confirmation and the cancel sheet at 390 and 1440, light and dark.

---

## 8. Error handling

| Situation | Behaviour |
|---|---|
| Slot taken between quote and confirm | 409 `slot_taken`; the page returns to step 2 with the day refreshed |
| Hold expired | 409 `hold_expired`; the page re-quotes automatically once, then asks the member to pick dates again |
| PI amount ≠ recomputed total (price changed, coupon changed) | 409 `payment_mismatch`; PI cancelled; the member re-quotes and pays again |
| Stripe unavailable at payment-intent | 503 `payment_unavailable`; the portal offers "Pay at the venue" when the venue allows it, else asks to retry |
| Coupon invalid / expired / wrong tier / used / not the member's | 422 with a code the portal maps to a sentence in the member's language |
| Coupon outbid by the tier benefit | 200; `coupon.status = 'outbid'`; the coupon stays available |
| Confirm replayed (same `Idempotency-Key`) | the original 201 body with `replayed: true`; nothing consumed twice |
| Member has no loyalty row (orphaned account) | the bootstrap self-heals it as `MemberController@profile` does; if no tier exists, `member` is null and the portal hides loyalty |
| Venue switched the portal off (`portal_enabled = false`) | every `member/portal/*` route answers 403 `portal_disabled`; the SPA shows a "contact the venue" page |
| Staff token on a member route | 403 (today several member endpoints answer 500 for staff); a small middleware `member.only` on the `member/portal` prefix |

Every error body is `{error: <code>, message: <English sentence>}`; the portal translates by code.

---

## 9. Security and tenancy

- All portal routes are inside the tenant-bound member group; every lookup goes through the organisation scope and
  additionally asserts `member_id` where a row is member-owned (claims, redemptions, holds, bookings).
- The server recomputes prices at quote, payment-intent and confirm; PaymentIntent metadata carries `org_id` and
  `member_id` and both are checked on confirm.
- Coupon resolution is throttled per member; the counter flow's `useOffer` is tenant-scoped.
- No admin endpoint is reachable from the portal; the portal never sends `brand_id`.
- Emails to members send as the venue (the shipped `SendsAsVenue` identity) and contain no long-lived tokens.
- The `.ics` download is generated client-side from the booking DTO; no signed URL is needed.

---

## 10. Rollout

One implementation plan per phase (`docs/superpowers/plans/`), written only after this spec is approved; each plan is
executed and deployed before the next one is written, so a later phase can absorb what the earlier deploy taught.

Three deploys, each from a worktree cut from `origin/main` with the phase's change list applied (the recipe in
`docs/landing-page-builder.md` §6), with the artifact batteries run scoped by directory (`tests/Feature/Member/`,
`tests/Feature/Loyalty/`, `tests/Feature/Booking/`, `tests/Feature/Landing/`, `tests/Unit/`), a fresh SPA build, and
content probes after the Cloud window:

| Phase | Probe |
|---|---|
| 1 | `/portal` shell chunk contains the `data-portal` root and the five `portal.*` bundles; `GET /api/v1/member/portal` answers 401 unauthenticated; join page paints the venue accent |
| 2 | the services chunk contains the price-breakdown component; `POST /api/v1/member/portal/services/quote` answers 401 unauthenticated; a test-mode booking on the owner's demo venue |
| 3 | stays chunk present; `POST /api/v1/member/portal/stays/quote` 401; a test-mode stay and its cancellation on the demo venue |

Migrations are additive and reversible; the `member/portal` prefix means an old SPA chunk cached by a member's
browser keeps working against the new backend. The mobile app's endpoints are untouched in every phase.

---

## 11. Rulings (decisions made in this spec; the owner may overturn any)

- **portal-1** Explicit coupons only for bookings; automatic tier benefits still apply. Reason: consuming a claim the
  member did not choose is a silent loss.
- **portal-2** `member/portal/*` is a new prefix; the mobile app's endpoints keep their shapes. Reason: the app's
  source is not in this repo and cannot be updated in step.
- **portal-3** Member service bookings confirm immediately (setting to require staff confirmation). Reason: the slot
  is really reserved under the lock, the widget already confirms, and the member is a known customer.
- **portal-4** Slot times are shown as the widget shows them (rota literal). Reason: the rota timezone bug is shared
  with the widget and must be fixed for both at once (§14).
- **portal-5** Accent tokens are computed server-side by `App\Support\Accent`. Reason: one contrast-checked source of
  truth; the SPA's own ramp has no contrast check.
- **portal-6** Light-first with dark by OS preference; no manual toggle in phase 1. Reason: fewer states to verify;
  a toggle can land later without a schema change.
- **portal-7** Reward codes become coupons only when the reward carries a typed discount. Reason: "Free coffee" has no
  money value and stays a counter-only code.
- **portal-8** `POST member/reservations` and `POST member/service-bookings` are removed rather than fixed. Reason: no
  client calls either; keeping two write paths per booking kind invites drift.
- **portal-9** Combo-stay discounts are split pro rata across mirrors. Reason: each mirror is what Smoobu and the
  refund path see; a discount on one room only would misprice a refund.

---

## 12. Out of scope, recorded for later

- The services rota timezone (rota times are interpreted in UTC and shown literally; the widget's confirmation
  screen converts to the browser zone). Needs a shared fix across widget, portal and admin calendar.
- `BookingEngineService::calcExtras()` only multiplies `per_guest` extras; admin can save `per_night` and
  `per_person*` types (pre-existing pricing defect on stays).
- Deposits for services (`services_require_deposit` is sent to the widget and applied nowhere).
- Cancellation fees and partial refunds.
- Brand-scoped loyalty programmes and per-brand portal theming.
- One email address joining several venues (`users_email_member_unique`).
- The stale Expo web export under `public/app/` and `public/staff/` (calls a removed endpoint, hard-wired host).
- Promo-code campaigns beyond a code on an offer (bulk codes, single-use codes per recipient).
- Chat with the venue inside the portal (`member/chat/*` exists; a later phase can add the page without backend work).
