# HexaTech handoff — 31 October 2026

Read this first, then `2026-10-30-hexatech-handoff.md` (production acceptance and browser notes),
`2026-10-29-hexatech-handoff.md` (the latest application releases) and `2026-10-27-hexatech-handoff.md` (the full
environment). AGENTS.md and CLAUDE.md still apply.

## Production

Latest: **c46e8da** (31 Oct, stack upgrade phases 0 and 1: CI, static analysis, test tooling, build-tool security,
`media:verify-version --version-id`, no `dall-e-3` fallback; record in `docs/loyalty-workspace.md` "Deploying"; the
next source-patch baseline is **a8a573f** on `claude/stack-audit-upgrade-plan-9hdkkv`). Before it, **48b12f0** (portal
booking rules shared with the members' app), and before that **4c59696c2**: request alerts on staff phones (`a199f1f8c`: the `staff_devices` table,
`PUT/DELETE /v1/admin/loyalty/devices`, `StaffAlerts`, and three fixes that made main's red tests green), the native
apps' minimum-version answer (`54d61cd8c`: `GET /api/v1/apps/{app}/version`, `config/apps.php`), then the members'
app server part (`DELETE /v1/auth/push-token`, `member` in `config/apps.php`, the portal's shared types). Records:
`docs/loyalty-workspace.md` "Deploying". The next source-patch baseline is **4a1494c62** on
`feature/loyalty-member-app`, with `apps/` left out of any Cloud deploy.

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
- The minimum-version check is built and its server part is live; the app is on the newest versions (Expo SDK
  58.0.21, TypeScript 7, Vitest 5; README "Versions").
- Later steps (plan, "What is left"): the store listings and unlisted App Store distribution.

## New: HexaTech Loyalty, the members' app

Owner's decisions (2026-10-31): a new app, published as version 2.0.0 of the existing Hotel Loyalty listing
(`com.hotelloyalty.app`), store name "HexaTech Loyalty", each venue's own colours. Branch `feature/loyalty-member-app`,
folder `apps/loyalty-member` (README there; plan and audit in `docs/loyalty-member-app/`). Not part of the Cloud
deploy.

- Phases 1 to 3 are built: foundation, sign-in, join by QR, the card, activity, five languages, push per phone, the
  version check; rewards, offers, codes, stamps, credit, events, inbox, profile, help; bookings with cancelling, and
  booking an appointment or a stay with Stripe's payment sheet (`@stripe/stripe-react-native` 0.81.0). The appointment
  flow ran end to end in the browser preview against the local API (a venue paid at the visit); stays and the payment
  sheet itself need a phone, a hotel venue with its PMS and a Stripe test key. Phase 4 (release) is the owner's.
- It shares the member portal's words and framework-free logic; for that reason the portal keeps its event, stamp and
  credit types in `lib/types.ts`, the industry nouns' keys in `lib/industry.ts`, the booking error sentences in
  `lib/bookErrors.ts`, the booking labels in `pages/bookingLabels.ts`, and every booking-flow decision in
  `pages/book/steps.ts` and `pages/stay/staySteps.ts`.
- Server part (additive): `DELETE /v1/auth/push-token` (clears the member's push token only when it is this phone's)
  and `member` in `config/apps.php` (`MEMBER_APP_*`, default 2.0.0 and the existing store pages).
- The owner's side before release: Expo sign-in as `hoteltechai` (or an `EXPO_TOKEN`), the Apple push key, FCM V1 for
  both apps, the old repository's over-the-air workflow switched off, store texts.

## Stack audit and upgrade plan: phases 0 and 1 done (owner, 31 Oct: "start with Phase 0 and Phase 1")

Plan and progress: `docs/audits/2026-10-31-stack-audit-and-upgrade-plan.md` (§6 the plan, §8 what is done). The
`saas-app` part lives in that repository's `docs/2026-10-31-stack-audit-and-upgrade-plan.md`.

- **CI exists now** (`.github/workflows/ci.yml`): it runs on pushes to `main`, on pull requests and on demand, never
  deploys, and is pinned by SHA. Locally the same checks are `scripts/test-php.sh` (the suite by directory),
  `scripts/test-pg.sh` with `JUNIT_DIR` plus `scripts/pg-known-failures.py`, `vendor/bin/phpstan analyse`
  (Larastan, baseline in `phpstan-baseline.neon`), and `frontend/e2e/visual-compare.mjs` for before/after screenshots.
  A new PostgreSQL failure must be fixed, or added to `tests/pgsql-known-failures.txt` with its reason in
  `docs/loyalty-workspace.md`; a new Larastan finding must be fixed, never added to the baseline by hand.
- Suites pass on PHP 8.4.27 and 8.5.12. `phpunit.xml` pins `APP_URL`, so a local `.env` no longer changes results.
- Fixed: `media:verify-version` now takes `--version-id` (`--version` made it crash); no `dall-e-3` image fallback.
- **Owner's side:** read production's PHP and Node versions in Laravel Cloud (PHP must be 8.4.27+ or 8.5.12+); remove
  `CONTENT_PLANNER_IMAGE_FALLBACK_MODEL` if it says `dall-e-3`; merge and deploy `saas-app`'s branch; change the SaaS
  super admin's password if production was seeded with the old script.
- Next by the plan: phase 3 (PHP 8.5 on Cloud), then phase 4's library majors one per release.

## Cloud container notes (Linux)

- Expo commands need `EXPO_OFFLINE=1` (the proxy blocks `api.expo.dev`; `docs.expo.dev` is blocked too, so read
  the installed packages' `.d.ts` files). Composer runs with `php8.4 $(which composer) install`.
- Web preview: `npx expo export --platform web` with `EXPO_PUBLIC_API_URL=http://127.0.0.1:8000/api`, served with a
  fallback to `index.html`. The local API needs `CORS_ALLOWED_ORIGINS` to include the preview's origin.
- Force-pushing a rebased branch is refused by this environment's safety check; add commits instead.
- PHP 8.4 and 8.5 are not in Ubuntu's archive and the ondrej PPA is blocked. The 31 Oct session compiled both from
  the official source tarball inside the `mirror.gcr.io/library/php:8.x-cli` images (Docker Hub rate-limits) with
  Ubuntu's `-dev` packages, `--with-webp` included (image tests need it). Composer then fell back to git clones
  (api.github.com is scoped to this session's repositories), so delete `vendor/*/*/.git` afterwards. Never run
  Composer in the main tree while a worktree shares `vendor` by hard links: it rewrites the shared autoload files.
  The disk allowance is small; a full `vendor` copy plus build trees filled it once.
