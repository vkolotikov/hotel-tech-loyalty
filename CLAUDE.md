# HexaTech (standalone `Hexa-Tech` repo) — instructions for Claude Code

Multi-tenant Laravel 13 + React (Vite, TypeScript) SaaS with four sub-brands. Production deploys from
`hotel-tech-loyalty:main` on Laravel Cloud. Landing-page builder docs: `docs/landing-page-builder.md`
(read it before touching anything under `app/Landing`, `resources/views/landing`, `public/landing`,
`frontend/src/pages/landing`).

Starting a new session, or on another device or agent: the current state, set-up, test baselines, deploy steps and
open items are in the newest file of `docs/handoff/` (now `docs/handoff/2026-11-12-hexatech-handoff.md`). Update it,
or add the next dated one, at the end of a session.

## Environment (hard rules, each one has bitten before)

- PHP: always the PHP 8.5 build in WAMP, `/c/wamp64/bin/php/php8.5.<patch>/php.exe` (owner 2026-11-01: the
  workstation runs 8.5, like production; `ls /c/wamp64/bin/php` names the folder; 8.5.12 or newer). The `php` on PATH
  is 8.3 and silently breaks JSON request bodies in tests.
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
- On a Linux machine (Claude Code on the web) the same rules hold with `php8.5` as the pinned PHP, `cp -al` for
  `vendor` in a deploy worktree, and a local PostgreSQL for the `scripts/test-pg.sh` checks; set-up in the handoff.

## Git and deploy

- Work on a feature branch. Never push a feature branch to `main`; never commit or push the feature branch's
  built `frontend/dist`/`public/spa`.
- Merging to `main` IS a production deploy (migrations run with `--force`, the SPA is rebuilt by Cloud).
  Use the source-patch recipe in `docs/landing-page-builder.md` §6: separate worktree from `origin/main`,
  apply the change list including deletions, tests on the artifact, fresh build, push, verify by content.
- The owner's standing word (2026-10-26): "deploy always after job done, no need to ask each time". When a job
  is finished and verified, deploy it by that recipe without asking, then report what went out. The recipe's
  checks still decide: a failing test, a parity difference or a failed content check stops the deploy.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` (or the current
  model's name).
- `feature/landing-phase-3c` carries unshipped non-landing work (37 source files of email deliverability
  and staff-capability changes; see `docs/landing-page-builder.md` §8). Do not let it ride a landing
  deploy: build deploy file lists from landing paths, never from `git log origin/main..HEAD`.

## Admin API rules

- Every staff endpoint is decided by `App\Support\AdminAccess\AccessMap` (middleware `admin.access`). A new route
  under `/v1/admin` needs a map key with its read rule, change rule and product, mirroring the menu's gate for its
  page; `tests/Feature/AdminAccess/AccessMapTest.php` and `AdminAccessWiringTest.php` fail otherwise.
- Organisations on modules reach only `account` and the products of the modules they bought — the Appointments plan
  `appointments`, Loyalty alone `loyalty`, Content alone `content`, CRM alone `crm` and `chat`
  (`AccessMap::productsFor`, `MODULE_PRODUCTS`; runbooks: `docs/appointments-workspace.md`, `docs/plan-modules.md`,
  `docs/crm-workspace.md`).
- A route parameter that names a model (`{inquiry}`, `{pipeline}`…) is resolved after `SaasAuthMiddleware` and
  `TenantMiddleware` (`bootstrap/app.php` priority list), so its lookup runs under the organisation's `TenantScope`;
  before 2026-11-01 every such admin route answered 404. `RouteBindingTenantTest` pins the order.
- An id a staff request names is validated with `OwnRows::rule('<table>')` (this organisation's rows; tiers and
  benefits add `->whereNull('deleted_at')`), never a bare `exists:<table>,id`, which takes another organisation's row;
  `tests/Feature/CrmWorkspace/OwnIdsTest.php` refuses a bare rule anywhere under `app/Http` (2026-11-08).

## Full admin menu and dashboards (2026-11-09, `docs/dashboards.md`)

- The menu's decisions are `components/navMenu.ts` (pure, tested). An item that moves to another group keeps a `home`
  naming the group it came from: hidden groups, a staff member's allowed groups and the industry's hidden groups are
  asked about the `home`, never silently about the new group. The Workspaces launcher (`layout: 'apps'`) is a container
  only the organisation can hide whole. A page that offers the menu's ways in reads `useVisibleMenu()`, never a copy.
- Group accents live in `theme/navAccents.ts`; a new one gets its line in `GLASS_NAV_ACCENT_TEXT` and
  `LIGHT_NAV_ACCENT_TEXT`. Dashboard colours go through `theme/dashboardPalette.ts` (`ink()`, `fill()`), whose written-out
  `hx()` calls keep `hxColours.ts` registering them.
- Every figure on a dashboard is the server's (`dashboard/trends`, `dashboard/kpis`…); the venue's clock, place, weather
  and currency are `App\Services\Dashboard\VenuePulse` only, reached by each interface at its own `…/pulse` (a workspace
  calls only its own area). Times are the venue's zone, never the browser's; a dashboard never fails because the weather
  is unknown. The dashboard stays free of chart libraries (it is the first page after sign-in): its charts are
  `pages/dashboard/charts.tsx`, and every motion stops for reduced motion.

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
- Release 6 (`docs/superpowers/specs/2026-10-23-loyalty-release-6-design.md`, "all remaining improvements", owner
  2026-10-23): a stay's refunds are written only under the payment's refund lock (`refund:{payer}`, in `SharedCache`) —
  `applyRefund()` around its Stripe call and stamp, `recordStripeRefund()` for the `charge.refunded` webhook, which
  records only Stripe's cumulative `amount_refunded` beyond what the rooms hold; no time window. Stripe's figure counts
  refunds only, so what a lost dispute took is kept apart in `dispute_lost_amount` and left out of every such compare
  (`recordLostDispute()`, one transaction for all rooms; the booking itself is staff's). A refund Stripe hands back
  (`StripeService::wasReplayed()`, or an id already recorded) records nothing new beyond Stripe's own total; a refund
  that times out is `RefundOutcomeUnknown`, never "failed". Every Stripe call made under a lock goes through
  `StripeService::underLock()` (5 s / 15 s). The widget's stay confirm takes every room's lock (ascending), then the
  hold row, and re-reads its payment there before Smoobu; a payment it cannot check leaves staff the enquiry and
  runs the rescue. The rescue alerts staff only for a payment Stripe could read in the venue's account. Currency is
  the venue's, never a literal EUR; zero-decimal amounts go through `toSmallestUnit()`/`fromSmallestUnit()`.
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
  Release 6: enrolment, the full admin's NFC and scan endpoints link cards through `NfcCards` too; a card never
  replaces a member's QR token. Campaigns and offers created with no brand are every brand's (owner 2026-10-25):
  their models declare `EVERY_BRAND_WHEN_EMPTY`, so `BelongsToBrand` fills in no default and `BrandScope` shows them
  in every brand's view; every other brand-scoped model keeps the default-brand fill-in.
- Release 7 (`docs/superpowers/specs/2026-10-25-loyalty-release-7-design.md`, owner 2026-10-25): a venue's loyalty
  options are read and written only through `App\Services\Loyalty\Programme\ProgrammeOptions` (its keys and defaults;
  a new reader of an option key reads it there). A visit's effects — stamp, cashback, referral, tier counters — run
  only through `Loyalty\Visits\VisitRecorder`, each in its own transaction and idempotent by the visit's reference
  (a desk request's is its `scan_events` row); a booking's visit counts only from the venue day the option was
  switched on (`ProgrammeOptions::countsVisitOn()`), and a full refund takes it back with points on or off. Stamps are
  written only by `Loyalty\Stamps\StampCards`, credit only by `Loyalty\Credit\CreditLedger`: every credit line under
  the member row lock, in integer cents, its `balance_after` equal to `credit_balance` after every write, never below
  zero, spent at the desk only (online payments and the public widget never touch credit). A free reward is issued
  only by `RedemptionActions::issueFree()`.
- Release 8 (`docs/superpowers/specs/2026-10-25-loyalty-release-8-design.md`, owner 2026-10-25, every industry): who
  gets in at a place or an event is decided only by `Loyalty\Access\AccessDecision` (reads only; erased, off,
  expired, place off, tier, then the event's window, room and sign-up — the order is the spec's); places are written
  only by `Access\AccessPlaces`, a membership's end date only by `Members\MembershipValidity` (a plain `Y-m-d`, never
  through the model's date cast), events only by `Events\*` (`EventCheckIn` takes the member row lock, then the event
  row lock). A scan never stores the raw code. Event times are the venue's wall clock, stored as written, never
  converted. Tiers are judged by the programme's `tier_progress_by` (points, visits — one per member per venue day —
  or spend), never by the member column `tier_qualification_model`; progress comes from
  `LoyaltyService::tierProgress()`.
- Ways to earn (owner 2026-10-26, `docs/loyalty-workspace.md` "Ways to earn, tabs and checks"): what the page warns
  about is decided only by `Loyalty\Programme\ProgrammeAdvice` (reads only; a new check is a code there with its words
  in all five bundles), never computed in the workspace, and so is each check's one-press `fix` (options the server
  has; saved as sent, it clears its own check); the earn rate is its own always-on card (`earn_rate`) because
  `points_per_currency` serves bookings and the desk alike. No `#…` link in the workspace (`<base href="/">` sends it
  to the site root); jump within a page with a button that scrolls.
- Release 10 (owner 2026-10-26, from the owner's Figma; `docs/loyalty-workspace.md` "Release 10, the frame"): a page's
  sections are `loyalty/ui/SectionCards` (filters stay pills), an empty list is a `GetStarted` panel holding the one
  action (hide the header's add button while it shows), figures are `FigureTiles`; colour only through the families
  (`data-hue`, `.l-hue-*`, each tone with its `--l-hue-*-bg` fill — a new family gets both and a line in
  `loyaltyContrast.test.ts`). Loyalty's palette is `LOYALTY_SURFACES` (the drafts' navy); Content keeps `NAVY_SURFACES`.
  Spanish strings address staff as usted. What a programme still lacks is the server's: the setup steps are
  `Loyalty\Setup\SetupProgress` (`GET start`), Program's checks `Loyalty\Programme\TierAdvice` (reads only, like
  ProgrammeAdvice); the workspace only places and words them.
- Release 11 (owner 2026-10-26, rename and delete; `docs/loyalty-workspace.md` "Release 11"): tiers and benefits are
  soft-deleted (`deleted_at`), only by `Loyalty\Programme\TierRemoval` / `BenefitRemoval`, each previewed first
  (`GET …/removal`); a tier's members move only through `Members\TierHolders`; history reads a deleted one
  `withTrashed()`. Never empty a tier list that means "every tier" when empty (boosts, offers: switch it off) nor a
  segment's tier rule (leave it, refused at send). An unscoped tier or benefit query drops only `TenantScope`
  (`withoutGlobalScope(TenantScope::class)`), never `withoutGlobalScopes()`, unless it means to see deleted rows; a form
  naming one adds `->whereNull('deleted_at')` to its exists rule. A test schema creating `loyalty_tiers` or
  `benefit_definitions` gives them `softDeletes()`.
- Release 9 (owner 2026-10-25, review and redesign; `docs/loyalty-workspace.md` "Release 9"): a tier move's direction is
  `LoyaltyService::compareOnLadder()` (the measure's floors, then points floors, then `sort_order`; level is no move);
  soft landing steps down the measure's own ladder; a move never writes `tier_effective_until` (it is the grace clock,
  started by the first dip, stopped by qualifying again); progress never names an invitation-only tier and every points
  summary goes through `tierProgress()`; the active tiers are read per request (`LoyaltyTier::cachedActiveForCurrentOrg`),
  never from the cache; `php artisan loyalty:assess-tiers` (nightly) re-assesses grace ended, "keep until" ended and,
  on a windowed programme, every tier — only through `assessTier()`. At an event the membership is judged on the day
  it begins (door and sign-up alike). A deleted
  member's standing sign-ups are released by `EventSignUp::releaseAll()`. A scan that got no answer is sent again with
  its own key (`scanMath.keyFor`), never a fresh one. Every fact once per screen; a verdict names the member once.
- Security review (owner 2026-11-04, `docs/loyalty-workspace.md` "Security review before the public launch"): a
  membership's account is its organisation's own member account (`Loyalty\Members\OwnAccount`) — a guest is linked
  only to one (`users` has no tenant scope; never look an account up by email alone), and every writer of a member's
  account (details, erasure, merge) refuses or detaches another's; `php artisan loyalty:foreign-accounts` lists old
  links, `--detach` repairs them (a migration of 2026-11-05 did it once on deploy, audited `member.account_detached`).
  An AI tool that writes asks the person's own rights (`LoyaltyAccess` for points, a manager for settings) and never
  answers a secret setting (`SettingRegistry::SECRET_KEYS`). A member endpoint never
  matches on a member id that may be null; a switched-off member's own spend and earn requests are refused
  (`MemberStatus::assertActive()`).
- Testing against PostgreSQL (the SQLite schemas miss NOT NULL columns and indexes production has): build a database
  from every migration, then run a test file with `DB_CONNECTION=pgsql DB_DATABASE=<that database>` (and its host and
  credentials) in the environment — phpunit.xml's `<env>` entries are not forced, and the schema traits skip tables
  that exist. Release 5 found two live bugs this way (member erasure and self-deletion wrote NULL into
  `loyalty_members.qr_code_token`). `scripts/test-pg.sh <test database> [paths…]` runs the suites there (release 6);
  the few tests that still fail on PostgreSQL on purpose are listed in `docs/loyalty-workspace.md` — a new failure
  there is new. New test data gives production's NOT NULL columns and never a state the real schema refuses.

## Modules: workspaces sold on their own

- HexaTech Loyalty and Content each in three packages (Lite, Standard at 85 €, Pro), 15 % less a month paid yearly
  (owner 2026-11-02), HexaTech Appointments the same way since 2026-11-04 (49/85/149 €, its own sign-up page,
  packages by `max_booking_staff`), HexaTech CRM since 2026-11-07 (49/85/149 €, `/crm/register`, packages by team
  and the AI allowance) and HexaTech Time Planner since 2026-11-09 (49/85/149 €, `/time/register`, packages by team and
  the AI allowance, every one with `time_management`; Enterprise keeps it as before); billing sells each product alone
  and every pair, never three (runbook `docs/plan-modules.md`). HexaTech CRM's billing product is `crm_chat`, never the full suite's `crm` or `chat`:
  `fromProducts` reads a list of module products only as an organisation on modules, so naming those would turn
  Starter and Growth into module customers; the Time Planner's is `time_planner`. Two products' AI allowances add up
  (`ai_monthly_cost_cents`). Every
  product's trial starts on Standard, monthly. What an organisation bought is `Organization::planModules()` only
  (null = full customer), each module's package `planTiers()`; "is this area off" is `holdsModule()` /
  `lacksModule()`, never a new reading of products or the plan slug. Module knowledge (products, packages, slugs,
  fallback prices and features) lives in `App\Support\PlanModules`, and the billing migrations
  `2026_11_02_130000_add_module_packages`, `2026_11_04_120000_add_appointments_packages`,
  `2026_11_07_120000_add_crm_packages` and `2026_11_09_120000_add_time_planner_packages` mirror it: a change to one is a
  change to both.
- Prices are billing's: the SPA shows only what `GET /v1/modules` or `GET /v1/auth/modules` answer, never a price of
  its own. A plan changes only through `PlanModulesController` (add, package, remove; billing `change-plan`), never by
  sending an amount, and a card-paid subscription moves only to a plan with its own Stripe price for its interval.
- A page an organisation on modules needs outside its workspaces lives under `/account/*` (outside the workspaces and
  the subscription check): Plan & products (`auth/modules`) and Team (the full admin's `admin/team`), both AccessMap
  product `account`. A package change never leaves an organisation holding more members or active staff than the new
  package allows (`over_limit`).

## CRM-workspace code rules

- HexaTech CRM (`frontend/src/crm/`, owner 2026-11-07: the AI chat widget and the CRM in one workspace, sold as the
  `crm` module). Read `docs/crm-workspace.md` first. It uses only `a-*` classes and the `crm-*` classes of
  `crm/theme/crm.css`; every string is `t('crm.…')` in all five locales, one bundle per area
  (`crm/i18n/<area>.<lang>.json`, registered under `crm.<area>` by the glob in `crm/i18n/index.ts`).
- Every call goes through `crm/lib/api.ts` (`get`, `send`, `crmApi`), only to the areas its `AREAS` lists, always with
  a `brand_id` — the brand chosen in the header's switcher, or `all` (`crm/lib/brand.ts`; what each brand shows is the
  server's `BrandMiddleware`, the brands offered `Crm\CrmBrands`); `crm/tokens.test.ts` refuses a raw `/v1/` path and
  any other area. The workspace's own reads are
  `admin/crm/*` (`App\Http\Controllers\Api\V1\Admin\Crm\*`, `App\Services\Crm\*`, behind `workspace:crm`);
  everything else is the full admin's own chat and CRM endpoints under their AccessMap rules — a new rule goes into
  the shared controller or service, never into a copy in the workspace. Rights for hiding controls come from the
  bootstrap's `staff.can` (`CrmAccess`), which only mirrors those rules.
- The AI never sends anything: a drafted reply (`ReplyDrafter`) goes into the box for a person; its spend is recorded
  (`crm_draft`), the month's allowance stops it before the provider is asked, and a provider failure is said in our
  words. Teaching the assistant writes only through the inbox's feedback endpoint (`apply_to_training`).
- Chat and task times are instants, shown in the venue's zone (`boot.venue.timezone`); a lead's `next_task_due` is a
  calendar day (`dayLabel`), never `new Date('YYYY-MM-DD')`. Today's figures use the full admin's definitions
  (`CrmToday`'s docblock); the workspace never computes a figure of its own.
- Decisions (filters, which actions a status allows, payloads, validation) live in pure functions with tests, because
  the frontend tests render to a string.
- Round 2 (owner 2026-11-07, "modernise … structured sections … dark theme as a default"): Dark is where a device that
  never chose starts (`crm/lib/look.ts` passes `start` to the shared look engine; the other workspaces still start
  Light); the palette is `CRM_SURFACES`, pinned by `crm/theme/crmContrast.test.ts` (a new colour gets its pair there).
  The side panel is in groups (`crm/shell/nav.ts`: Conversations, Sales, Reports, Set up; the shared frame's
  `WorkspaceNavItem.section`). A page's main sections are `crm/ui/SectionNav` (kept in `?tab=`), a list's controls a
  `Toolbar` with `FilterChip`s, content in `Card`s with a description; `Tabs` pills only filter inside a list.
- Round 3 (owner 2026-11-08, "add ai capture in leads and deals for any staff member"): the AI capture
  (`crm-ai/capture-*`) is behind `ai.capture` (`RequireAiCapture`: the CRM workspace on, or `admin_ai`), not
  `feature:admin_ai`, which keeps the rest of `crm-ai/*`; the bootstrap's `features.ai_capture` is that middleware's
  answer. A deal is added through the lead form's deal mode (the lead, then the server's own `inquiries/{id}/won`), and
  every close as won — one or bulk — goes through `InquiryController::closeAsWon()`. The widget's cached config
  (`widget:config:<key>`) lives in `SharedCache`.
- Round 4 (owner 2026-11-09): one task form for the CRM and the full admin's drawer — its rules in `src/lib/taskForm.ts`
  (pure, tested), each screen in its own palette and bundle. A task's priority, length and repeat are its own fields
  (`priority`, `duration_minutes`, `recurring_rule`), never `custom_data`, which keeps only the organisation's custom
  fields; the next task of a repeating one is made only by `TaskController::nextOccurrence()` on completion.
- Round 5 (owner 2026-11-12, "minimize copy, more icons … opening tabs, slides or popups … all features of the main
  platform"; `docs/crm-workspace.md` "Round 5"): a lead, a contact or a company opens in its panel over the page through
  `useRecords()` (`?lead=`, `?contact=`, `?company=`, `?rtab=`; rules in `crm/lib/records.ts`), never by leaving the list,
  and a record's page draws the same `ui/RecordPanel` frame; something new opens through `?create=` (`CreateHost`, the
  header's New, N), never a page's own form state. A list registers its ids with `useRecordList`. A page's sentence is
  `Page`'s `line` and a card's `description` (both (i) tooltips), never a visible paragraph; icon-only actions are
  `IconButton`/menus with a `title`. Lead-intake tokens carry only `crm:lead-intake` and Sanctum accepts them only on
  `POST integrations/leads` (`CrmIntakeTokensServiceProvider`, registered in `bootstrap/providers.php` —
  `AppServiceProvider` is not loaded); the sales reports are one service, `Crm\SalesReports`, for both admins; a
  company's booking revenue is shown only to an organisation that may reach bookings. Alerts (`crm/alerts`) are mounted
  once in the shell.

## Time-Planner-workspace code rules

- HexaTech Time Planner (`frontend/src/time/`, owner 2026-11-09: the full admin's staff Planner as its own workspace with
  AI planning, review, capture and voice). Read `docs/time-planner-workspace.md` first. It uses only `a-*` classes and the
  `time-*` classes of `time/theme/time.css`; every string is `t('time.…')` in all five locales, one bundle per area
  (`time/i18n/<area>.<lang>.json`); Dark is where a device that never chose starts; the palette is `TIME_SURFACES`.
- Every call goes through `time/lib/api.ts`, only to its `AREAS` (`time`, `planner`, `team`), always with
  `brand_id=all`. Tasks, subtasks, the backlog, templates and day notes are written only by the full admin's own
  `planner/*` endpoints; the planner's settings only through the workspace's `time/settings` (the same `crm_settings`
  rows, only the planner's keys, a manager's change — never `crm-settings`, which a Time-only organisation cannot
  reach); a person's skills only by `team/{id}`; a planner profile only by `PlannerProfiles`; a task's clock only by
  `TaskClock` (and PlannerTask's saving hook, which stops it on done). The work window is
  `App\Services\Time\WorkWindow`, which the full admin's planner endpoints read too.
- `admin/time/*` is behind `workspace:time`, and all but the bootstrap behind `feature:time_management`. Since
  2026-11-09 it is also sold as the `time` module (billing product `time_planner`, every package with `time_management`);
  AccessMap product `time` covers `admin/time*` and `admin/planner*`. A new route needs its AccessMap key.
- Who may put work on whose day is the organisation's planning mode (owner 2026-11-09), decided only by
  `App\Services\Time\PlanningMode` on the server: `team` (the default, as before) or `own` (a staff member changes only
  their own and unassigned tasks and gives work only to themselves; managers always may). Every writer of a planner task
  — the full admin's `PlannerController` and the workspace's plan, apply, clock, review and capture — asks it; a new one
  asks it too. The setting `planner_planning_mode` is written only by `PUT admin/time/settings/…` (a manager's,
  audited). The workspace only hides what it would refuse (`time/lib/rights.ts`, from `staff.can.plan_team`).
- The AI never writes: a plan (`DayPlanner::merge`) is checked line by line against the day's facts and applied only by
  a person (`PlanApplier`, which skips what changed); capture drafts are saved by a person; a review's action must name
  the day's task and a team member. The rules plan whenever the AI cannot be asked. Spend is `time_plan`,
  `time_review`, `time_capture`; the allowance is asked first. A name without an account is never handed work by a plan.
- Days and times are the venue's wall clock (`task_date` + `start_time`, `VenueClock`); the frontend's day arithmetic is
  `time/lib/dates.ts`, never `new Date('YYYY-MM-DD')`. Figures (load, capacity, on time, accuracy, signals) are the
  server's (`DayBoard`, `TimeInsights`); the workspace only words and draws them. Decisions live in pure functions with
  tests (`*Logic.ts`, `plan/timeline.ts`).

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

## Staff app (`apps/loyalty-staff`) code rules

- The native Android and iOS desk app (Expo, branch `feature/loyalty-staff-app`; decisions and status in
  `docs/loyalty-staff-app/00-PLAN.md`, how to run and build in `apps/loyalty-staff/README.md`). It is not part of the
  Laravel Cloud deploy: it reaches phones only through EAS builds and the stores.
- It decides nothing about loyalty: rights from the bootstrap's `staff.can`, every answer and refusal from
  `/v1/admin/loyalty/…` with `brand_id=all`. A new action needs the endpoint first (server change with its `AccessMap`
  key and tests), never a rule copied into the app. An endpoint's shape the app reads stays compatible, because
  installed apps update late.
- Every write sends an `idempotency_key`, kept while the attempt is unanswered (`src/lib/desk.ts`); every string is
  `t('…')` in all five bundles of `src/lib/i18n/` (Spanish addresses staff as usted); colours and fonts only from
  `src/lib/theme.ts`, the previous Expo apps' gold on navy, not the web mobile Figma (owner, 2026-10-31).
- Request alerts (owner 2026-10-31): a staff phone is a `staff_devices` row written only by
  `Admin\Loyalty\DeviceController` (`PUT`/`DELETE devices`); alerts are sent only by `Loyalty\Staff\StaffAlerts`,
  dispatched after the member's response (`AlertStaffOfRequest::dispatchAfterResponse`), never inside the member's
  request or transaction. `staff.expo_push_token` stays the Hotel Staff app's own. A new kind of alert is a method on
  `StaffAlerts` with its words in all five `lang/<lang>/staff_alerts.php`.
- The native apps' versions are answered only by `GET /api/v1/apps/{app}/version` (`config/apps.php`, from the
  `STAFF_APP_*` variables); a setting that is not `x.y.z` counts as none, so a typo never locks phones out. Every app
  store release raises `version` in the app's `app.json`. Expo-managed libraries stay at the versions the SDK names
  (`npx expo install --check`); never `npm audit fix --force` in an Expo app.
- Checks: `cd apps/loyalty-staff && npx tsc --noEmit && npx vitest run`. In the cloud container Expo commands need
  `EXPO_OFFLINE=1`. Never commit `node_modules`, `dist` or the generated `ios`/`android` folders.

## Members' app (`apps/loyalty-member`) code rules

- HexaTech Loyalty, the members' app (owner 2026-10-31: a new app, published as version 2.0 of the existing Hotel
  Loyalty listing `com.hotelloyalty.app`, each venue's colours). Branch `feature/loyalty-member-app`; plan
  `docs/loyalty-member-app/00-PLAN.md`, how to run, build and release in `apps/loyalty-member/README.md`. Not part of the
  Laravel Cloud deploy.
- It shares the member portal rather than copying it: the portal's words (`frontend/src/portal/i18n/*.json`, through
  `src/lib/i18n/portalBundles.ts`) and its framework-free logic and types (through `src/shared/portal.ts`). Only modules
  with no React, web client or browser API are imported; a portal change to one of them is a change to the app too, so
  run the app's `npx tsc --noEmit && npx vitest run` with the portal's tests. Metro and Vitest resolve a shared file's
  packages from the app's own `node_modules` (one i18next).
- It decides nothing about loyalty or money: every figure, phrase and refusal is the server's (`/v1/member/*`) or the
  portal's shared logic; the member-portal money rules above hold for it unchanged. The session keeps the old app's
  secure-store keys (`auth_token`, `auth_user`) so an update keeps members signed in.
- The venue's accent and heading face are read at render time (`C.gold`, `accentGradient()`, `fonts.*`), never inside
  `StyleSheet.create`. Expo-managed libraries stay at the SDK's versions; no `expo-updates`.
- Booking and paying in the app use the portal's own flow rules (`pages/book/steps.ts`, `pages/stay/staySteps.ts`) and
  sentences (`lib/bookErrors.ts`) through `src/shared/portal.ts`; a failed call is read with `serverCodeOf()` (the
  portal's `apiErrorCode`), never the app's `network`/`unknown`. A card is taken only by Stripe's payment sheet
  (`src/lib/payment.ts`) for the one intent the server made; the app sends the Idempotency-Key and the intent's id,
  never an amount, and cannot be left while a card is held against an unconfirmed booking (`canLeavePay`).

## Secrets

Never echo credential values. `.env` is local; production settings live in Laravel Cloud.
