# HexaTech handoff — 13 November 2026 (stay promotions)

Previous state: `2026-11-12-hexatech-handoff.md`. Work started from `99e004ee` on `feature/booking-promotions` in the main `hotel-tech-loyalty` repository. The owner clarified that Forrest uses the main portal, that discounts must exclude additional services, and that admins must manage campaign dates, then approved building the improvement.

## Delivered source

See `docs/booking-promotions.md` for operation, exact date boundaries, pricing, credential setup and the Forrest campaign checklist.

- Manager-only Stay promotions page under Bookings: drafts, editing with revision checks, duplication, pause/archive, booking windows in the venue zone, independent eligible stay dates, excluded nights, room restrictions and lifetime use figures.
- Shared stay pricing for percentage, fixed amount and an actual verified second night free. Full-price extras, no stacking, better eligible member discount, tenant/brand scoping and server-owned totals.
- Optional promo entry in the public widget and member portal, localized member errors in all five portal languages, and clear invalid-code correction before payment.
- Immutable quote snapshots, exact room allocations, capped payment extension, zero-total checkout, one use per multi-room hold, and campaign-aware payment webhook recovery through the existing booking writer.
- Smoobu receives the discounted accommodation amount and unchanged extras. Stored price elements retain the discount after PMS refreshes.
- Optional Smoobu HMAC signing with encrypted organisation/brand secrets and fresh signed request bytes on retries. Existing no-secret API-key connections retain their authentication.

The feature defaults off per organisation. Forrest's codes and dates are not seeded or enabled. This avoids guessing its campaign booking window or which December 31 nights to exclude. Other venues retain existing member stay prices while the flag is off; old accepted holds retain their pricing scope.

## Development environment

Linux cloud workspace. PHP 8.5.12 ran in the `booking-promotion-php` Docker container, with `gd`, `zip`, `intl` and `pdo_pgsql`; Composer vendor is local to the checkout. Node 24.22.1, frontend dependencies from the lock file. Test PostgreSQL 17 runs in `booking-promotion-pg`, migrated from every migration. No production keys were loaded or used. Browser checks use Playwright Chromium and intercepted local API fixtures; screenshots and detailed logs live in the session's `/workspace/scratch` and are not repository artifacts.

## Checks and release

- Source regressions: Booking, Unit/Booking, Smoobu, Unit/Support, Settings and AdminAccess: 1,160 passed, 6 skipped. Member/Portal: 307 passed. The expanded zero-total confirmation case also passed on SQLite and PostgreSQL.
- New feature/admin/Smoobu signed-request cases on a fully migrated PostgreSQL database: 16 passed. Unit promotion rules: 6 passed (included in Unit/Booking above).
- Frontend: all 7,179 tests in 481 files passed; typecheck and production build passed. Lint baseline reports no new diagnostics. Larastan reports no errors.
- Browser on the compiled SPA and actual rendered Blade widget: admin creation, date/exclusion/room controls, duplication, enable switch, invalid-code correction, full-price extras, displayed total, desktop and mobile layouts passed.
- Earlier broad verification covered every PHP test scope on SQLite; its Settings encrypted-key assertion was updated for the new secret, and the affected Settings, CRM and CRM workspace suites then passed. A frontend navigation icon collision was corrected to a unique icon. Neither failure is accepted as a baseline.

Release must follow the source-patch worktree recipe and verify the served bundle by content. Feature-branch generated assets must not be committed. No campaign activation is part of this release.

## Activation still requires venue details

Confirm the exact booking-open and booking-close times, excluded stay-night years, room eligibility and the agreed minimum nights for the percentage offers. Enter and test any required Smoobu signing secret securely through settings, verify nightly rates and make a controlled Stripe/Smoobu booking with the venue before publishing the campaigns. No live customer booking, payment, email or campaign activation was performed during development.
