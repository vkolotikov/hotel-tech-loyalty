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
- Frontend: `cd frontend && npx tsc -b && npx vitest run` (3 `plannerMeta` failures are pre-existing).
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
- Runbook: `docs/member-portal.md` (`## Stays (phase 3)`, `## Cancellation (phase 3)`,
  `## The public confirm's payment rescue`, `## After a deploy`, `## When money looks wrong`,
  `## Known limits`) — read it before touching stays, cancellation or the public confirm's failure handling.

## Appointments-workspace code rules

- `frontend/src/appointments/` uses only `a-*` tokens and only `/v1/admin/appointments/…`; every string is
  `t('appointments.…')` in all five locales. Read `docs/appointments-workspace.md` before touching it.
- Appointment times are the venue's wall clock (`YYYY-MM-DDTHH:mm`, no offset). Never pass one to `new Date()`;
  use `frontend/src/appointments/lib/wallClock.ts` and, on the server, `App\Services\Appointments\VenueClock`.
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
