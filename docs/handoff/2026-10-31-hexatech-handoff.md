# HexaTech handoff — 31 October 2026

Read this first, then `2026-10-30-hexatech-handoff.md` (production acceptance and browser notes),
`2026-10-29-hexatech-handoff.md` (the latest application releases) and `2026-10-27-hexatech-handoff.md` (the full
environment). AGENTS.md and CLAUDE.md still apply.

## Production

Production is **a199f1f8c** (request alerts on staff phones, on top of the wallet and recovery release `f0c30c739`):
the `staff_devices` table, `PUT/DELETE /v1/admin/loyalty/devices` and `StaffAlerts`, plus three fixes that made
main's red tests green (record: `docs/loyalty-workspace.md` "Deploying"). The next source-patch baseline is
**91f0d1e72** on `feature/loyalty-staff-app`, with `apps/loyalty-staff/` left out of any Cloud deploy.

## New: HexaTech Staff, the native desk app

- Branch **`feature/loyalty-staff-app`** (from `main` `f0c30c739`), code in **`apps/loyalty-staff/`**. Decisions,
  status and what is left: `docs/loyalty-staff-app/00-PLAN.md`. How to run, build, release and test on phones:
  `apps/loyalty-staff/README.md`. Code rules: CLAUDE.md "Staff app code rules".
- Owner's words: a separate Android and iOS app for loyalty staff (scan NFC, QR, typed; see benefits and points), in
  the previous Expo apps' design (gold on navy), "modern, luxury, powerful, easy to use".
- Built: sign-in with lock, Home, Scan (NFC, camera QR, typed, at the desk or a place or today's event), the scanned
  member with the door answer, member page, give or use points, check-in, link a card, Members, Requests (benefit
  requests and rewards to hand over), More (web pages, language, lock, sign out). Five languages. Brand icon.
- Checked: `npx tsc --noEmit`, `npx vitest run` (13 tests), the web preview against the local API with real data
  (every screen at phone size, sign in and out, scans at the desk and a tiers-only place, points given through the
  sheet).
- **Not yet checked on a phone.** Next: an EAS development build (needs the owner's Expo sign-in or an `EXPO_TOKEN`
  secret in this environment's settings), then the README's acceptance list with the real cards.
- Request alerts are built and the server part is live: a member's benefit request alerts every active staff phone,
  a claimed reward those who may hand it over. A phone hears them once the owner has set up the EAS project id, an
  Apple push key and FCM V1 credentials (`apps/loyalty-staff/README.md`, "Request alerts").
- Later steps (plan, "What is left"): a minimum-version answer, the store listings and unlisted App Store
  distribution.

## Cloud container notes (Linux)

- Expo commands need `EXPO_OFFLINE=1` (the proxy blocks `api.expo.dev`; `docs.expo.dev` is blocked too, so read
  the installed packages' `.d.ts` files). Composer runs with `php8.4 $(which composer) install`.
- Web preview: `npx expo export --platform web` with `EXPO_PUBLIC_API_URL=http://127.0.0.1:8000/api`, served with a
  fallback to `index.html`. The local API needs `CORS_ALLOWED_ORIGINS` to include the preview's origin.
- Force-pushing a rebased branch is refused by this environment's safety check; add commits instead.
