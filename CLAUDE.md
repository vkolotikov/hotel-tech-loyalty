# HexaTech (standalone `Hexa-Tech` repo) — instructions for Claude Code

Multi-tenant Laravel 13 + React (Vite, TypeScript) SaaS with four sub-brands. Production deploys from
`hotel-tech-loyalty:main` on Laravel Cloud. Landing-page builder docs: `docs/landing-page-builder.md`
(read it before touching anything under `app/Landing`, `resources/views/landing`, `public/landing`,
`frontend/src/pages/landing`).

## Environment (hard rules, each one has bitten before)

- PHP: always `/c/wamp64/bin/php/php8.4.20/php.exe`. The `php` on PATH is 8.3 and silently breaks JSON
  request bodies in tests.
- NEVER run a bare `php artisan test` — it segfaults. Scope every run:
  `artisan test tests/Feature/Landing/`, `tests/Unit/Landing/`, `tests/Unit/Support/` (and the other suites
  by directory). Run in the foreground and read the `Tests:` summary line yourself.
- `php artisan view:clear` after every Blade change before testing.
- Frontend: `cd frontend && npx tsc -b && npx vitest run` (the whole suite passes since 2026-10-22; a failure is new).
  Run `npm install` after pulling; the build model commits `frontend/dist` + `public/spa`
  (`npm run build` → `scripts/postbuild.mjs`).
- Windows shell: Git Bash for POSIX scripts, PowerShell 5.1 otherwise. Prefer the Edit tool over
  `python -c`/`sed` for file changes (CRLF and cp1252 hazards). Bash heredocs mangle long markdown —
  use the Write tool for documents.
- Disk on `C:` fills up fast from other tools on this machine; report `ENOSPC` instead of deleting things.
- Never junction `vendor` into a git worktree (PHPUnit then tests the wrong tree); remove junctions with
  `cmd /c rmdir` before `git worktree remove`.

## Git and deploy

- Work on a feature branch. Never push a feature branch to `main`; never commit or push the feature branch's
  built `frontend/dist`/`public/spa`.
- Merging to `main` IS a production deploy (migrations run with `--force`, the SPA is rebuilt by Cloud).
  Use the source-patch recipe in `docs/landing-page-builder.md` §6: separate worktree from `origin/main`,
  apply the change list including deletions, tests on the artifact, fresh build, push, verify by content.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` (or the current
  model's name).
- `feature/landing-phase-3c` carries unshipped non-landing work (37 source files of email deliverability
  and staff-capability changes; see `docs/landing-page-builder.md` §8). Do not let it ride a landing
  deploy: build deploy file lists from landing paths, never from `git log origin/main..HEAD`.

## Admin API rules

- Every staff endpoint is decided by `App\Support\AdminAccess\AccessMap` (middleware `admin.access`). A new route
  under `/v1/admin` needs a map key with its read rule, change rule and product, mirroring the menu's gate for its
  page; `tests/Feature/AdminAccess/AccessMapTest.php` and `AdminAccessWiringTest.php` fail otherwise.
- Organisations on the Appointments plan reach only products `appointments` and `account` (runbook:
  `docs/appointments-workspace.md`).

## Landing-page code rules

- One source of truth: the server serves the section catalogue; the editor derives from it. No mirrored
  lists in TypeScript. New leaf = catalogue entry + label in all five locales.
- Blade: `{{ }}` only. No inline styles or scripts (CSP). Kit stylesheets ship verbatim; only our appended
  block after the author's CSS may change, and the per-template test proves it.
- Images have one writer (the media endpoints). Local dev never writes to the production bucket:
  `MEDIA_DISK=public`, `DO_SPACES_*` commented out.
- Booking is gated on capability (`PageContent::bookingMode()`), not on industry.
- Verify page work with your eyes first (real browser screenshot at 1440 against the author's original),
  tests second.

## Member-portal code rules

- `frontend/src/portal/` uses only `p-*` tokens and member endpoints; every string is `t('portal.…')` in all five
  locales; new API lives under `member/portal/*` and the mobile app's member endpoints keep their shapes. Read
  `docs/member-portal.md` before touching it.
- Prices are computed server-side at quote, payment-intent and confirm; the client never sends a total. Coupons
  are explicit (never applied without the member choosing them); automatic tier benefits are scoped by
  `applies_to`.
- A payment intent pays for exactly one booking of one slot; a hold is released on every failed confirm but
  never when a booking already carries the intent.
- Booking-flow decisions (which sentence, which step to bounce back to, whether to clear the coupon or the
  slot) live in pure functions — `frontend/src/portal/pages/book/steps.ts`, `payOutcome.ts` — because the
  frontend tests render to a string and cannot run effects or handlers.
- Error sentences come from `bookErrorKey()` / `bookErrorFallback()` in `frontend/src/portal/lib/portalApi.ts`;
  never keep a second, local copy of them.

### Member portal — stays and cancellation (phase 3)

- **The public booking widget must not change** (owner's ruling, 2026-09-29): `/api/v1/booking/*` and
  `/api/v1/services/*` keep their requests, responses, stored columns, prices, Smoobu payload and emails
  for a booking without a member. The tests named "widget" in `tests/Feature/Booking/BookingEngineConfirmTest.php`
  pin this; a change that needs one of them edited is a change to the widget, not to be made without asking.
- A stay has one writer, `BookingEngineService::confirm()`. The portal reaches it through `PortalStayHooks`
  (`StayConfirmHooks`); it never writes a mirror itself. Three separate things keep the public widget away
  from a member-priced hold — do not conflate them, and do not "fix" one by copying another: `confirm()`
  refuses a hold whose payload names a member when no hooks are passed, which protects the public
  `/booking/confirm`; the public `/booking/payment-intent` has its own check on
  `$hold->payload_json['member_id']` and answers as an unknown hold; the `payment_intent.succeeded` webhook's
  orphan recovery never calls `confirm()` at all — it writes a `booking_mirror` row itself and finds the hold
  by metadata key `hold_token`, which a portal intent's metadata never carries (only `portal_hold_token`), so
  it simply never sees a portal payment. Never add `hold_token` to a portal intent's metadata.
- One lock helper, `App\Support\AdvisoryLock`, for every string-keyed advisory lock (`AdvisoryLockOnlyTest`
  pins it structurally). Order: room/slot advisory lock → `pi:`. A BOOKING row (`booking_mirror`,
  `service_bookings`, `booking_holds`) is never locked (`lockForUpdate`) while `pi:` is held — it is always
  locked first: stay confirm takes `room:{org}:{unit}`, then the hold row, then `pi:`; service confirm takes
  the slot lock (`svc:{service}` / `svcm:{master}`), then `pi:`; `MemberCancellation` takes the booking row,
  then `pi:`; the capture cron's main sweep takes the booking row(s) of the intent (id order), then `pi:` —
  its stale-authorisation path takes no lock at all, relying on conditional writes instead;
  `PortalPaymentIntentGuard` (`release()`, `check()`, `releaseOrphan()`) takes only `pi:` and only reads
  booking rows, never locks one. This is not a rule that `pi:` is the last lock taken of any kind: rows of
  OTHER tables may be locked after it, inside the same transaction — a coupon row (`CouponResolver`,
  consumed in the confirm's hook) and, in `cancelService()`/`cancelStay()`, the points/member rows
  (`LoyaltyService::reverseTransaction()`) are both locked after `pi:`. The rule for a coder: never take a
  booking-row lock while `pi:` is already held.
- Money rules: one PaymentIntent pays for exactly one booking; a cancellation returns the money first and
  cancels the booking second — a payment that cannot be returned leaves the booking standing (502
  `refund_failed`), never a booking cancelled with the money still out. PORTAL code must never cancel a
  PaymentIntent a booking already carries, or one whose metadata names another member or organisation: a
  failed portal confirm, `PortalPaymentIntentGuard` and the orphan sweeper all check `carried()`/ownership
  before touching an intent. (The capture job and `MemberCancellation` cancel a carried intent by design,
  for a booking that is being cancelled; the public stay rescue follows the rule in the next bullet.)
- The public stay confirm's failure rescue (`BookingPublicController::rescuePaymentIntentOnConfirmFailure()`)
  acts only on a payment whose metadata carries this request's own `hold_token` and that no booking carries;
  everything else it refuses and audits (`booking.confirm.pi_rescue_refused`). Never widen it. Every payment
  this application creates must carry a mark that says whose it is — `hold_token` for the public stay
  widget, `kind` for the others (`portal_…`, `service_booking`) — so that no failure path can mistake one
  payment for another. The rest of the public booking flow stays as it is. Details:
  `docs/member-portal.md` "The public confirm's payment rescue".
- One payment pays for one service booking, and the database says so last: the partial unique index
  `service_bookings_org_pi_unique` is the last line of defence, the application checks first
  (`PortalPaymentIntentGuard::assertUnused()` in the portal, the pre-check before the insert in the public
  services confirm). Answer a unique violation by the rule that was broken (the violated columns, or a
  re-read for the payment), never by "any unique violation".
- Every artisan command written in documentation starts with `php artisan` and uses a placeholder that
  cannot be mistaken for a value (`--org=<organisation id>`, never `--org=N`); an operator types it as written.
- The portal decides nothing about money on the client: `can_cancel`, `cancel_deadline`, `paid_online`, every
  total and every cancellation outcome are the server's, read from the booking DTO
  (`App\Services\Portal\MemberBookingQuery`) or the cancel response, never computed in the frontend.
- Portal frontend rules apply to the stay and cancellation UI too: only `p-*` classes and the portal `ui/*`
  primitives, every string translated in all five `portal.<lang>.json` files.
- Never convert a stored appointment time (it is the venue's wall clock, not UTC, however its `+00:00`
  suffix reads). Portal code that turns one into an instant or takes one from the client goes through
  `App\Services\Portal\AppointmentClock`, never a bare `Carbon`/`DateTime` parse. The shared scheduler,
  the public widget and the admin SPA stay exactly as they are — untouched by this rule.
- The venue's time zone comes from `PortalBootstrap::timezone()` only; never read `organizations.timezone`
  or `hotel_timezone` directly in portal code.
- Release 4: the public services confirm accepts only this booking's own payment (`assertPaysThisBooking()`: kind,
  organisation, service, start, amount, the venue's Stripe currency) — owner-approved widget change R4-2, as is extras
  pricing by type in `BookingEngineService::extraUnits()` (R4-3); nothing else in the widget changed. Release 5 (R5-6, owner 2026-10-23): a failed
  widget booking records the hold in its submission row and leaves staff an enquiry; failures found under the lock are
  written after the rollback (`logComboFailures()`), and a used hold or a member's hold leaves no enquiry. A widget stay
  becomes a member's only at award time, through `BookingPointsService::certainMemberForStay()` (one member, linked
  guest, same email, active, verified address). Never write one PaymentIntent on several `booking_mirror` rows: the
  partial unique index `booking_mirror_org_pi_unique` refuses it on PostgreSQL. Release 5: a combination's lead room
  carries the intent and the other rooms are reached through `booking_group_id` — every path that finds rows by an
  intent goes through `App\Services\Booking\GroupPayment` (`rows()`, `payer()`, `allocateRefund()`), never a bare
  `where('stripe_payment_intent_id', …)->first()` that would leave the other rooms behind. A portal payment-intent never calls Stripe under a room or slot lock the
  confirms take: a stay's takes its hold row then `pi:`, an appointment's a member-scoped `psi:` key then `pi:`; an
  earlier intent is reused or released only through `PortalPaymentIntentGuard::reuseOrRelease()`, and nothing new is
  made beside one whose fate is unknown. State shared across requests lives in `SharedCache` (production's default
  cache is each container's own files). The pay-at-venue grant is offered only when Stripe is unreachable
  (`PayAtVenueFallback::isStripeUnreachable()`) and pays for one booking; the return endpoint
  (`member/portal/payments/{pi}`) only reads.
- Runbook: `docs/member-portal.md` (`## Stays (phase 3)`, `## Cancellation (phase 3)`,
  `## The public confirm's payment rescue`, `## After a deploy`, `## When money looks wrong`,
  `## Known limits`) — read it before touching stays, cancellation or the public confirm's failure handling.

## Loyalty-workspace code rules

- `frontend/src/loyalty/` uses only `a-*` and `l-*` classes and only `/v1/admin/loyalty/…` (every call names
  `brand_id=all`); every string is `t('loyalty.…')` in all five locales. Read `docs/loyalty-workspace.md` first.
- Who may do what is `App\Services\Loyalty\LoyaltyAccess` on the server (the full admin's own flags; reversing a line
  is a manager's). Points are written only by `LoyaltyService`; a redemption's fulfil and cancel only by
  `App\Services\Loyalty\RedemptionActions`, which the full admin's `RewardAdminController` calls too.
- Every id a request names must be this organisation's; option lists come from the server (`LoyaltyForms`), never a
  copy in TypeScript. New SQL runs on PostgreSQL and the tests' SQLite (no `ILIKE`, no `FILTER`).
- The full admin's loyalty screens stay as they are (owner, 2026-10-21); the shared frame pieces in
  `frontend/src/workspace/` serve Content and Loyalty both, so a change there is checked against both.
- Release 2 (`docs/superpowers/specs/2026-10-21-loyalty-release-2-design.md`): a member is added, edited, given a tier,
  switched off or deleted only through `App\Services\Loyalty\Members\*`, which the full admin's controllers call too.
  A new table with a member column goes into `MemberMergeService::MEMBER_COLUMNS` (or `KEPT_COLUMNS`, with the reason);
  `MemberMergeServiceTest` scans the migrations and fails otherwise.
- A campaign starts only through `Campaigns\CampaignStart` (one conditional update, the confirmed count, the counted
  members) and sends only through the shared `SendEmailCampaignChunk`; a segment rule is checked by
  `Campaigns\SegmentRules` (never "everyone" by accident); a body is blocks rendered and escaped on the server.
- Wallet settings have one writer, `WalletSettings`; a certificate, key or password is never answered, logged or
  audited. A picture's old file is deleted only when it is this organisation's own (`Loyalty\App\OwnMedia`); the
  frontend shows stored pictures through `mediaUrl()`.
- Release 3 (`docs/superpowers/specs/2026-10-22-loyalty-release-3-design.md`): nothing that must survive a deploy goes on
  the local disk (Laravel Cloud keeps neither it between deploys nor one disk across replicas) — wallet files and an
  import's file live in the database. A `push_notifications` row is written only by `NotificationService::keep()` and
  means "kept for the member's inbox". Email campaigns and push messages record each member in their deliveries table
  before sending (at most once); tags are filled only by `App\Services\Email\CampaignTags`, escaped in the body.
  A zone name read from settings goes through `App\Support\TimeZones` (via `PortalBootstrap::namedZone()`).
- Release 4 (`docs/superpowers/specs/2026-10-22-loyalty-release-4-design.md`): an SMS goes only through the venue's own
  Twilio rows (`App\Services\Sms\TwilioSms`, never the platform's `TWILIO_*` values), only to a member with
  `sms_consent`, recorded in `sms_campaign_deliveries` before the send; the Auth Token is never answered, logged or
  audited. A scheduled email, push or SMS starts only through its own start service's conditional update
  (`php artisan loyalty:send-scheduled`). Boost times are the venue's wall clock on both sides (`LoyaltyForms::instant`),
  and every boost save stamps `times_venue_at`. Test fixtures never look like real credentials (GitHub push protection
  refuses an `AC` + 32-hex Twilio SID). SQLite test schemas lack production's unique and partial indexes: a new write
  to a table with one gets a test that creates that index, or a check on PostgreSQL.
- Release 5 (`docs/superpowers/specs/2026-10-23-loyalty-release-5-design.md`): a scanned or typed code is read only by
  `App\Services\Loyalty\Cards\CodeReader` through `CardLookup` (the full admin's `scan/qr` too); an NFC card is linked
  or switched off only by `App\Services\Loyalty\Cards\NfcCards` (`nfc_cards.uid` is unique across all organisations).
- Testing against PostgreSQL (the SQLite schemas miss NOT NULL columns and indexes production has): build a database
  from every migration, then run a test file with `DB_CONNECTION=pgsql DB_DATABASE=<that database>` (and its host and
  credentials) in the environment — phpunit.xml's `<env>` entries are not forced, and the schema traits skip tables
  that exist. Release 5 found two live bugs this way (member erasure and self-deletion wrote NULL into
  `loyalty_members.qr_code_token`). Older tests whose own data the real schema refuses are listed in
  `docs/loyalty-workspace.md`.

## Appointments-workspace code rules

- `frontend/src/appointments/` uses only `a-*` tokens and only `/v1/admin/appointments/…`; every string is
  `t('appointments.…')` in all five locales. Read `docs/appointments-workspace.md` before touching it.
- Appointment times are the venue's wall clock (`YYYY-MM-DDTHH:mm`, no offset). Never pass one to `new Date()`;
  use `frontend/src/appointments/lib/wallClock.ts` and, on the server, `App\Services\Appointments\VenueClock`.
  The full admin's service-booking screens (list, calendars, dashboard) read the same times through
  `frontend/src/lib/venueTime.ts`, so both interfaces show one booking at one time.
- Setup saves go through `App\Services\Booking\Setup\*` and the full admin shares `OwnRows` and `WeeklyHours`;
  a change that can strand appointments supports `?dry_run=1` and is previewed in the workspace (owner decision:
  warn, list, still allow). Who may act is `App\Services\Appointments\Setup\SetupAccess`, on the server.
- The workspace computes no availability, price, points or consequence of its own: slots come from
  `ServiceSchedulingService`, points from `BookingPointsService`, and what an action will do from
  `AppointmentActions`. A new rule goes into the shared service, not into a workspace controller or component.
- Every write takes the revision the client saw and answers `409 stale` on a mismatch; create takes an
  `Idempotency-Key`. Panel decisions live in pure functions (`panel/panelState.ts`, `panel/consequences.ts`)
  because the frontend tests render to a string.
- Every organisation has the workspace unless switched off (`php artisan workspace:appointments <org> --off`;
  owner's decision 2026-10-01); sign-in still opens the full admin. Anything added to it stays behind
  `workspace:appointments`, so `--off` keeps meaning "none of it"; a change to the full admin itself needs the
  owner's say-so.
- Local checks that capture mail need `LOG_LEVEL=debug` beside `MAIL_MAILER=log`: the local log level hides the
  log mailer's output, and an empty log then proves nothing.

## Secrets

Never echo credential values. `.env` is local; production settings live in Laravel Cloud.
