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
