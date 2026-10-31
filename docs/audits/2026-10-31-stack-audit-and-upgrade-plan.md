# Stack audit and upgrade plan — 31 October 2026

Scope: everything HexaTech runs on.

- **`hotel-tech-loyalty`**: the Laravel API, the React SPA (admin, workspaces, member portal), landing pages; production on
  Laravel Cloud.
- **The two native apps**: `apps/loyalty-staff` on `feature/loyalty-staff-app` and `apps/loyalty-member` on
  `feature/loyalty-member-app`.
- **`saas-app`**: the Next.js "HotelSaaS" platform that issues the SaaS JWTs `SaasAuthMiddleware` accepts.

Method: every lock file was read and compared with the newest releases on Packagist and npm on 31 October 2026.
`composer audit` and `npm audit` were run against the lock files, and the code was scanned for things an upgrade would
break. Platform versions (PHP, Node, PostgreSQL, Laravel's schedule) come from web search; php.net, php.watch and
cloud.laravel.com could not be opened from the cloud session, so those figures are second-hand and marked as such.
**Nothing was changed in code, settings or production.** This document is a plan for the owner to approve step by step.

---

## 1. The short answer

**The main system is already on a modern stack.** Laravel 13.39.0 is the newest Laravel release (27 October 2026).
It runs on Symfony 8. React 19.3.1, Vite 8, Vitest 5, React Router 7.18 and TanStack Query 5.105 are all the newest
releases. The native apps are on the newest Expo SDK (58) and React Native (0.88.1). The database is PostgreSQL 18 with
seven-day point-in-time recovery. `composer audit` finds **no known vulnerability** in the 160 PHP packages, and
`npm audit` finds **none** in the SPA's production packages.

What needs attention, most urgent first:

| # | What | Why it matters | Urgency |
|---|------|----------------|---------|
| 1 | **PHP patch level.** PHP 8.4.27 and 8.5.12 (21–22 Oct 2026) fix two critical unauthenticated remote-code-execution bugs (CVE-2026-109618/-109619). | The documented dev PHP is 8.4.20. Production's patch level is set by Laravel Cloud and must be checked. | **Now** |
| 2 | **`saas-app` dependencies.** 47 advisories in production packages: 5 critical, 25 high. They include Next.js middleware/proxy auth-bypass fixes (the platform's `proxy.ts` *is* its auth gate) and Auth.js fixes. | If `saas.hotel-tech.ai` is live, it is exposed. Almost all fixes are in-range updates. | **Now, if live** |
| 3 | **Dead AI model references.** The Content Planner's image fallback is `dall-e-3`, which OpenAI shut down on 12 May 2026. `.env.example` still names the retired `claude-sonnet-4-20250514`. | The fallback can no longer work; the error text tells staff to switch *to* the dead model. | Soon |
| 4 | **PHP 8.4 leaves active support on 31 Dec 2026** (security fixes continue to Dec 2028). Laravel Cloud supports 8.5, its default for new environments. | Move to 8.5 for two more years of bug fixes. | Next 1–2 months |
| 5 | **Library majors behind**: Stripe (PHP 20→22, JS 9→10), spatie/laravel-permission (6→8), PHPUnit (11→13), Anthropic PHP SDK (0.36→1.3), openai-php (0.19→0.21), laravel/mcp (0.9→1.1), Tailwind (3→4), TypeScript (5.9→6), ESLint (9→10), lucide-react (0.577→1.x). | None has a known vulnerability. Each is "future-ready" work, done one per release. | Planned |
| 6 | **No CI.** Tests run only by hand (and there are ~7,000 of them). | An upgrade programme needs every change tested automatically before it can reach `main`. | Before phase 4 |
| 7 | **Leftover root build toolchain.** The repository root still has Laravel's original Vite 5 / `laravel-vite-plugin` 1 / axios setup: 8 advisories, 7 high, all development-time. No Blade view uses `@vite`, so it appears unused. | Remove it (after checking Cloud's build commands) rather than maintain it. | Soon |

**Can it be done step by step without losing functionality, data or design?** Yes. The plan below does one change per
release through the existing source-patch recipe. Each release has its own tests and a one-step rollback (revert and
redeploy). The only steps that touch stored data are named, and they are rehearsed on a restored copy first. The only
steps that touch the look of the product (Tailwind 4, the icon library) are checked screen by screen against
screenshots.

---

## 2. What we have

| Part | Technology | Hosting |
|------|------------|---------|
| API, landing pages, member portal back end, jobs | PHP 8.4+ · Laravel 13 · Symfony 8 · Passport 13 (ChatGPT plugin OAuth) · Sanctum 4 · spatie/laravel-permission 6 · Nightwatch (monitoring) · laravel/mcp | Laravel Cloud (London), PostgreSQL 18, 7-day PITR |
| Queue, cache, sessions | `database` queue and sessions; file cache per container (`SharedCache` for cross-request state) | Laravel Cloud |
| Files and media | Flysystem S3 driver → DigitalOcean Spaces (`MEDIA_DISK`) | DO Spaces |
| Email | SMTP / Amazon SES (bounces via SNS) | AWS eu-west-2 |
| Payments | Stripe (stays, appointments, refunds, disputes) | Stripe |
| AI | OpenAI (`openai-php/laravel`, chat, realtime voice, transcription, images); Anthropic PHP SDK (Content Planner) | OpenAI, Anthropic |
| Other services | Twilio (per-venue SMS), Expo push, Meta Graph API v25, Smoobu (PMS), Apple/Google Wallet | — |
| Web front end | React 19.3 · TypeScript 5.9 · Vite 8 · Tailwind 3.4 · React Router 7 · TanStack Query 5 · Zustand 5 · i18next 26 (5 locales) · Stripe.js · Vitest 5 · Playwright 1.64 | Built by Laravel Cloud from `frontend/` |
| Staff app, members' app | Expo SDK 58 · React Native 0.88.1 · React 19.3 · TypeScript 7 · expo-router · Stripe React Native 0.81 | EAS builds, app stores |
| SaaS platform (`saas-app`) | Next.js 16.2.1 · React 19.2.4 · NextAuth v5 beta 30 · Prisma 7.5 · Tailwind 4 · shadcn/Base UI · Stripe Node 20 · Resend · Turborepo | DigitalOcean App Platform (Docker `node:22-alpine`), PostgreSQL 16 |

Size of the main repository: 851 PHP files under `app/`, 229 migrations, 627 test files (~7,000 tests), 1,317 TypeScript files,
234 Blade views. `saas-app`: 134 TypeScript files, 20 Prisma models, **no tests**.

---

## 3. Versions: what we run and what is newest (31 Oct 2026)

### 3.1 Platform

| Component | We run | Newest | Notes |
|-----------|--------|--------|-------|
| PHP | ≥ 8.4.1 required by the lock file (Symfony 8). Dev docs: 8.4.20. Production: **check Laravel Cloud → Environment → Runtime.** | **8.5.12** (22 Oct 2026); 8.4 line: 8.4.27 | 8.4: active support ends 31 Dec 2026, security to 31 Dec 2028. 8.5: active to 31 Dec 2027, security to 31 Dec 2029. **8.6 is due about 19 Nov 2026** (one source only). |
| Laravel | 13.39.0 | **13.39.0** ✓ | Laravel 13 was released 17 Mar 2026. Under Laravel's 18-month/2-year policy, bug fixes run to about Sep 2027 and security fixes to about Mar 2028. **Laravel 14 is expected Q1 2027** (not announced). |
| PostgreSQL | 18 (Laravel Cloud) | 18 ✓ (19 in beta, beta 4 on 24 Sep 2026) | No action. Revisit 19 after its first minor releases. |
| Node.js (builds) | Container 22.23; `engines` allows 22.12+, 24, 26+ | **24 LTS**; 26 enters LTS on 28 Oct 2026 | **Node 22 reaches end of life on 30 Apr 2027.** Laravel Cloud's build Node version must be checked. |
| Composer `php` constraint | `^8.3` | — | Out of date: the lock already needs 8.4.1, so the file should say `^8.4`. |

### 3.2 PHP packages (`composer.json`)

Latest-within-range updates (low risk, no code change expected):

| Package | Locked | Newest |
|---------|--------|--------|
| laravel/passport | 13.8.0 | 13.10.0 |
| laravel/sanctum | 4.3.1 | 4.3.3 |
| laravel/nightwatch | 1.26.1 | 1.30.6 |
| laravel/tinker | 3.0.0 | 3.0.2 |
| firebase/php-jwt | 7.0.5 | 7.2.1 |
| league/flysystem-aws-s3-v3 | 3.32.0 | 3.35.3 |
| laravel/pint, laravel/sail, mockery, collision (dev) | 1.29 / 1.56 / 1.6.12 / 8.9.3 | 1.32.1 / 1.69.0 / 1.6.15 / 8.9.5 |

Major or 0.x updates (each one is its own step; see phase 4):

| Package | Locked | Newest | What changes |
|---------|--------|--------|--------------|
| stripe/stripe-php | 20.0.0 | **22.1.0** | Every major pins a newer Stripe API version. This is the money path: highest care. |
| spatie/laravel-permission | 6.25.0 | **8.3.2** | Two majors (7: Feb 2026, 8: May 2026). Renamed events, commands and middleware namespace; read both upgrade guides. |
| phpunit/phpunit (dev) | 11.5.57 | **13.4.5** | 12 removes doc-comment annotations: 23 of them in 9 test files (16 `@dataProvider`, 7 `@testWith`). 13 needs PHP ≥ 8.4.1. |
| anthropic-ai/sdk | 0.36.0 | **1.3.0** | 1.0 (21 Oct 2026) sends API version `2026-10-21`. One file uses it (`ContentPlanner/AiClient.php`), and that file sends no `temperature`. |
| openai-php/laravel | 0.19.1 | 0.21.0 | 0.x: a minor release may break. 6 classes use the facade. |
| laravel/mcp | 0.9.4 | 1.1.2 | First stable major (ChatGPT plugin / MCP server). |
| endroid/qr-code | 5.1.0 | 6.1.3 | Needs PHP 8.4. QR images on cards and wallet passes must be compared. |
| guzzlehttp/guzzle | 7.16.1 | 8.3.1 | Laravel 13 allows 8, but `openai-php/laravel` still requires `^7.9.3`. **Blocked; wait.** |

### 3.3 Web front end (`frontend/package.json`)

Already newest: React 19.3.1, react-dom, Vite 8.3.5, Vitest 5.0.5, @vitejs/plugin-react 6.1.2, React Router 7.18.5,
TanStack Query 5.105.0, axios 1.21.0, Zustand 5.0.16, recharts 3.10.1, date-fns 4.4.0, Playwright 1.64.1,
typescript-eslint 8.72.1, PostCSS 8.5.32.

| Package | Locked | Newest | Notes |
|---------|--------|--------|-------|
| i18next / react-i18next / languagedetector | 26.1.0 / 17.0.7 / 8.2.3 | 26.5.12 / 17.1.9 / 8.2.4 | In range. The members' app already uses these. |
| typescript | 5.9.3 | 7.0.2 (6.0.3 on the 6 line) | **Go to 6.0, not 7 yet:** typescript-eslint supports only TypeScript < 6.1, and TS 7.0 has no stable programmatic API until 7.1. |
| eslint, @eslint/js | 9.39.5 | 10.14.0 / 10.0.1 | Does not clear the moderate `minimatch` advisory: ESLint 10's own dependencies still pull it (dev only). |
| tailwindcss | 3.4.19 | **4.3.3** | Design-sensitive. 244-line config, 27 CSS files, no `@apply`. v4 needs Safari 16.4+, Chrome 111+ and Firefox 128+. |
| lucide-react | 0.577.0 | **1.66.0** | Imported in 342 files; some icons renamed in 1.x. |
| @stripe/stripe-js / @stripe/react-stripe-js | 9.17.0 / 6.12.0 | 10.2.0 / 7.0.1 | Money path; same step as stripe-php. |
| @zxing/browser / @zxing/library | 0.1.5 / 0.21.3 | 0.2.1 / 0.23.0 | Camera QR scanning; test on phones. |
| @types/node | 24.19.2 | 26.6.6 | Keep in step with the Node the build runs on, not the newest. |

### 3.4 Native apps (Expo)

Both apps are on the newest Expo SDK 58 (58.0.21; 58.0.22 is out), React Native 0.88.1, TypeScript 7.0.2 and
Vitest 5.0.5. Small patches are waiting: expo-router 58.0.29, expo-dev-client 58.0.18, and the Stripe React Native and
gesture-handler versions that `npx expo install --check` names. `npm audit` shows 13 advisories (2 high). All of them
are inside `@expo/cli`'s own build-time tools (zod 3.25 and others); none ships to phones. They clear with Expo's
patch releases. Per the app rules, never `npm audit fix --force` in an Expo app.

### 3.5 SaaS platform (`saas-app`)

| Package | Locked | Newest | Notes |
|---------|--------|--------|-------|
| next / eslint-config-next | 16.2.1 | **16.4.3** | Critical advisories fixed in 16.2.5 and 16.2.11, among them middleware/proxy authorisation bypasses (CVE-2026-44574, CVE-2026-44575, CVE-2026-64642). |
| react / react-dom | 19.2.4 | 19.3.1 | |
| next-auth | 5.0.0-beta.30 | 5.0.0-beta.32 (v5 never left beta; `latest` tag is 4.24.15) | July 2026 security fixes are in beta.32. Auth.js is now maintained by the Better Auth team, security fixes only, and points new work to Better Auth. |
| @auth/prisma-adapter | 2.11.1 | 2.11.3 | Critical advisory in `@auth/core` ≤ 0.41.2. |
| prisma, @prisma/client, @prisma/adapter-pg | 7.5.0 | 7.10.1 (8.0 is still RC) | |
| stripe (Node) | 20.4.1 | 23.1.0 | Three majors; pins newer Stripe API versions. |
| resend / shadcn / turbo / tsx | 6.9.4 / 4.1.0 / 2.8.20 / 4.21.0 | 6.37.0 / 4.23.0 / 2.11.10 / 4.23.15 | `shadcn` is a CLI and should be a dev dependency (it drags high advisories into production). |
| tailwindcss | 4.2.2 | 4.3.3 | Already on v4. |
| typescript / eslint / @types/node | 5.9.3 / 9 / **20** | 7.0.2 / 10.14 / 26 | `@types/node` 20 does not match the `node:22` image. |
| Docker base image | `node:22-alpine` | `node:24-alpine` (LTS) | |
| PostgreSQL (DigitalOcean) | 16 | 18 | 16 is supported to Nov 2028; optional. |
| Vendored `packages/auth-sdk/php/vendor` | php-jwt 7.0.3, committed | — | No advisories. A committed `vendor/` is not updated by Composer; prefer a `composer install` at use. |

---

## 4. Security findings

| Where | Result | Severity | Fix |
|-------|--------|----------|-----|
| PHP runtime | Critical RCE fixed in 8.4.27 / 8.5.12 / 8.3.36 | **Critical** | Confirm the Cloud runtime's patch level; update every dev PHP (Windows WAMP 8.4.20 → 8.4.27 or 8.5.12). |
| `hotel-tech-loyalty` Composer (160 packages) | `composer audit`: none | — | — |
| `frontend/` production npm packages | `npm audit --omit=dev`: none | — | — |
| `frontend/` dev tooling | 12 moderate (`minimatch` via ESLint) | Moderate, build machine only | Waits for ESLint's own update (ESLint 10 still pulls it) |
| Repository root `package.json` (Vite 5 toolchain) | 8 (7 high): postcss, source-map-js, esbuild, axios, nanoid, form-data, follow-redirects | High, build machine only | Remove the unused toolchain (phase 1) |
| Staff and members' apps | 13 (2 high) inside `@expo/cli` | High, build machine only | Expo patch releases |
| `saas-app` production packages | **47 (5 critical, 25 high)**: `next`, `next-auth`/`@auth/core`, `proxy-addr`, `prisma`, `sharp` (libvips CVEs), `hono`, `lodash`, `path-to-regexp`, `zod` via `shadcn`, … | **Critical** | Phase 1: in-range updates; `shadcn` to dev |
| `saas-app` PHP SDK | `composer audit`: none | — | — |

---

## 5. Other findings from reading the code

1. **`dall-e-3` fallback is dead.** `config/openai.php` sets `image_fallback_model` to `dall-e-3`, and
   `ImageGenerationService` falls back to it. Its error text even tells staff to set `CONTENT_PLANNER_IMAGE_MODEL=dall-e-3`.
   OpenAI shut DALL·E down on 12 May 2026. The replacements OpenAI names are `gpt-image-1-mini`, `gpt-image-1` or
   `gpt-image-2`.
2. **Retired Claude model in `.env.example`.** It names `claude-sonnet-4-20250514` (retired 15 Jun 2026). The config
   default is `claude-sonnet-5`, which still works; the current Sonnet is `claude-sonnet-5-5` (same price). Moving to it
   is a quality check on Content Planner output, not just an ID swap.
3. **`gpt-4o-realtime-preview*`** snapshots are still accepted by `CrmAiController`. OpenAI lists the `gpt-4o-realtime`
   family for removal on 20 Jan 2027. The code already prefers `gpt-realtime`; drop the old names before that date.
4. **`composer.json` says `php: ^8.3`**, but the lock (Symfony 8) needs 8.4.1. Make it `^8.4`, and pin
   `config.platform.php` to the production version so `composer update` never picks a package production cannot run.
5. **`config/cache.php` reads `CACHE_DRIVER`.** That is the pre-Laravel-11 name; the current skeleton uses
   `CACHE_STORE`. It works, but the name will confuse anyone who follows Laravel's documentation.
6. **No CI.** There is no `.github/workflows`. Every check depends on someone remembering to run it.
7. **`saas-app` has no tests**, and `.do/app.yaml` still has placeholders (`your-github-user/saas-app`). It is not
   clear from the repository whether the platform is live; the owner should confirm.

---

## 6. The plan, step by step

### Rules for every step

- One change per release, through the source-patch recipe (`docs/landing-page-builder.md` §6): separate worktree from
  `origin/main`, tests on that tree, fresh build, push, check by content.
- The full PHP loop by directory, the PostgreSQL suite (`scripts/test-pg.sh`), `npx tsc -b && npx vitest run`, the
  browser e2e (`npm run test:browser`). For a step that can change what a screen looks like: screenshots at 1440 and
  phone width, before and after.
- Rollback for every code step is "revert the commit, redeploy". The only steps that change stored data are marked
  **DATA**. Each of those is first run on a database restored from PITR (as rehearsed on 30 Oct 2026), with its
  `down()` tried.
- Money paths (Stripe) are tested in Stripe test mode against every flow the runbooks name. The widget tests in
  `BookingEngineConfirmTest.php` must stay green unchanged: the owner's 2026-09-29 ruling stands.

### Phase 0: Safety net (no user-visible change)

1. **Check production's PHP and Node.** In Laravel Cloud, read the environment's PHP version and Node version, and run
   `php -v` from Cloud's command runner. If the PHP patch is older than 8.4.27 (or 8.5.12), redeploy to pick up Cloud's
   current image. Update every developer PHP the same day.
2. **Add CI** (GitHub Actions, never deploys): `composer audit`, `npm audit --omit=dev` for `frontend/`, PHPUnit by
   directory on PHP 8.4 *and* 8.5, the PostgreSQL suite against a service container, `npx tsc -b`, `npx vitest run`.
   This is what makes the later majors safe.
3. **Add static analysis as dev tools**: Larastan 3.13 with a baseline (no code change; it only blocks *new* problems),
   and Rector 2.8 with `driftingly/rector-laravel` in dry-run mode, for the PHPUnit and PHP 8.5 steps.
4. **Record a screenshot baseline** of every workspace, the portal and the landing kits, using the existing Playwright
   e2e set-up.

### Phase 1: Urgent security (days)

1. **`saas-app`**: Next 16.4.3, React 19.3.1, next-auth 5.0.0-beta.32, @auth/prisma-adapter 2.11.3, Prisma 7.10.1,
   `shadcn` moved to devDependencies, then `npm audit fix` (never `--force`). If the platform is live, this goes out
   first.
2. **Repository root**: confirm in Laravel Cloud's build settings that nothing runs the root `npm run build`. Then
   remove the root `package.json`, `package-lock.json`, `vite.config.js` and `resources/js`, `resources/css` (Laravel's
   original skeleton assets). If something does use them, upgrade to Vite 8 + `laravel-vite-plugin` 2 instead.
   (Done 31 Oct the second way, because Cloud's build commands could not be read from here: Vite 8.3.5 +
   `laravel-vite-plugin` 3.2.0, which works whether or not Cloud runs it. Removal can follow once the owner confirms
   Cloud never runs the root build.)
3. **Frontend dev tooling**: ESLint 10 + `@eslint/js` 10. (Correction, 31 Oct: this does not clear the moderate
   `minimatch` advisory, which ESLint 10 still depends on; it is development-only and waits for ESLint.)

### Phase 2: In-range updates and small fixes (one release, low risk)

1. `composer update` within the current constraints: Passport 13.10, Sanctum 4.3.3, Nightwatch 1.30.6, php-jwt 7.2.1,
   Flysystem S3 3.35.3, Tinker 3.0.2, dev tools.
2. Frontend: i18next 26.5.12, react-i18next 17.1.9, languagedetector 8.2.4.
3. Native apps: `npx expo install --fix` (Expo 58.0.22 and the SDK-named versions), then each app's
   `npx tsc --noEmit && npx vitest run`.
4. Fixes from §5: image fallback → `gpt-image-1-mini` (and its error text); `.env.example` model ID;
   `composer.json` `php` → `^8.4` with `config.platform.php`.

### Phase 3: PHP 8.5 (low to medium risk, no data change)

1. The code scan found none of PHP 8.5's deprecations: no `(integer)`/`(boolean)`/`(double)` casts, no backtick shell
   operator, no `__sleep`/`__wakeup`. Every locked package already allows 8.5
   (`composer prohibits php 8.5.12 --locked` finds none).
2. Run the full PHP loop and the PostgreSQL suite on 8.5 (CI does this from phase 0).
3. Switch the Laravel Cloud runtime to 8.5 at a quiet hour and redeploy; watch Nightwatch for an hour.
   Rollback: switch back to 8.4 and redeploy.
4. Then raise `composer.json` to `^8.5`. New code may use 8.4/8.5 features: property hooks, asymmetric visibility,
   the pipe operator `|>`, `array_first()`/`array_last()`, `#[\NoDiscard]`, the URI extension.
5. **PHP 8.6** (due about 19 Nov 2026): wait for its first patch releases and for Laravel Cloud to offer it. Take it
   together with Laravel 14 (phase 7). Today four locked packages refuse 8.6: `lcobucci/jwt` 5.6 and
   `league/oauth2-server` 9.4 (both under Passport), `nette/schema` and `nette/utils`. They must release 8.6 support
   first.

### Phase 4: Library majors (one per release, medium risk)

Order chosen so that test-only and single-file changes come first, money last.

| Step | Change | Size | Checks |
|------|--------|------|--------|
| 4a | PHPUnit 11 → 12 → 13: Rector converts the 23 annotations to attributes; `phpunit.xml` schema | S | Test-only; production unaffected |
| 4b | Anthropic PHP SDK 0.36 → 1.3: one file. Then decide the model: `claude-sonnet-5-5` (same price as `claude-sonnet-5`), after comparing a sample of Content Planner outputs | S | Content Planner tests; a manual run |
| 4c | openai-php/laravel 0.19 → 0.21 | S–M | Chat widget, CRM AI, inquiry and engagement AI tests |
| 4d | laravel/mcp 0.9 → 1.1 | S–M | ChatGPT plugin suites; a real ChatGPT connection test |
| 4e | endroid/qr-code 5 → 6 | S | Compare generated QR images and wallet passes byte for byte or by scan |
| 4f | spatie/laravel-permission 6 → 7 → 8 (two releases). **DATA** if either upgrade guide changes its tables | M | AdminAccess suites (`AccessMapTest`, `AdminAccessWiringTest`), staff capability tests, a PITR-restore rehearsal if tables change |
| 4g | Stripe: stripe-php 20 → 22, Stripe.js 9 → 10, react-stripe-js 6 → 7, with the API version pinned explicitly | M–L | Stripe test mode: widget stay and service bookings, portal payment sheet, refunds, `charge.refunded`, disputes, capture cron; the widget tests unchanged |
| — | Guzzle 8 | — | Blocked until `openai-php/laravel` allows it |

### Phase 5: Front-end toolchain and design-sensitive changes (medium risk to design, none to data)

1. **TypeScript 5.9 → 6.0.** It turns 5.x deprecations into errors, and `tsc -b` lists them. TypeScript 7 comes later,
   once typescript-eslint supports it (needs TS 7.1's API).
2. **lucide-react 0.577 → 1.x**: the compiler names every renamed icon; then a screenshot pass.
3. **Tailwind 3.4 → 4.3**: Tailwind's upgrade tool moves `tailwind.config.js` into CSS `@theme`. Then a screenshot
   comparison of every workspace, the portal and the auth pages at 1440 and phone width. **Owner decision first:** v4
   drops browsers older than Safari 16.4 / Chrome 111 / Firefox 128, which matters for guests opening the portal on old
   phones. Tailwind 3 has no security problem (it only compiles CSS), so this step is for future-readiness and can wait.
4. **Build on Node 24 LTS**, or 26 LTS: set it in Laravel Cloud and in CI, `@types/node` to match. Must be done before
   Node 22's end of life on 30 Apr 2027.

### Phase 6: SaaS platform modernisation (after phase 1)

1. **Add tests first**: Playwright smoke tests for sign-in, tenant switch, bootstrap and the token endpoint the Laravel
   app relies on, plus route tests for `/api/auth/token`.
2. Docker `node:24-alpine`, `@types/node` 24, TypeScript 6, ESLint 10, Turbo 2.11, Resend 6.37.
3. **Authentication decision (owner):** stay on NextAuth v5 beta (security fixes only), or move to Better Auth, which
   the Auth.js maintainers recommend. A move is **DATA**: users, accounts and sessions tables. It is rehearsed on a copy
   and keeps every existing password and sign-in. The JWT the Laravel app verifies (`SaasAuthMiddleware`,
   `SAAS_JWT_SECRET`) must keep its exact shape.
4. Stripe Node 20 → 23 (same test-mode rule).
5. Prisma 8 once it is out of RC; switch the generator from `prisma-client-js` to the newer `prisma-client` at the same
   time.
6. Optional: PostgreSQL 16 → 18 on DigitalOcean (**DATA**: managed upgrade, with a backup first).
7. Remove the committed `packages/auth-sdk/php/vendor`.

### Phase 7: Laravel 14 and PHP 8.6 (Q1–Q2 2027)

When Laravel 14 is released, wait 4–8 weeks for Passport, Sanctum, spatie/laravel-permission, openai-php/laravel,
laravel/mcp and Nightwatch to declare support. Then follow the official upgrade guide in one release, with the same
checks. Laravel 13 keeps security fixes until about March 2028, so there is no pressure to be first.

### Optional new technology (each a separate decision, not an upgrade)

| Option | What it gives | Recommendation |
|--------|---------------|----------------|
| **Laravel AI SDK** (`laravel/ai` 1.3) | One interface over OpenAI and Anthropic (and others), replacing the mix of `openai-php`, the Anthropic SDK and raw HTTP calls; easier model switches | Worth it after phase 4b/4c, as a gradual refactor |
| **Larastan + Rector** | Catches type bugs; automates future upgrades | Yes, in phase 0 |
| **Managed cache (Valkey/Redis) on Laravel Cloud** | One cache shared by all replicas instead of each container's files; `SharedCache` and rate limits become one store | Worth it; needs care with what `SharedCache` assumes today |
| **Laravel Boost** | Gives coding agents Laravel-aware context (dev only) | Nice to have |
| Octane, Horizon, Reverb, Pest | Speed, Redis queue dashboard, websockets, another test runner | Not now: each changes how the app runs or how tests are written, without a current need |

---

## 7. Risks, and what protects against each

| Risk | Where | Protection |
|------|-------|------------|
| Losing data | Only spatie/permission (if its tables change), the SaaS auth move, and an optional PostgreSQL major | PITR (7 days), a restore rehearsal before each, `down()` tried, migrations on PostgreSQL first |
| Losing functionality | Every major | ~7,000 PHP tests, PostgreSQL suite, Vitest, browser e2e, then CI; one change per release; revert-and-redeploy rollback |
| Changing the design | Tailwind 4, lucide 1.x | Screenshot baseline and comparison at 1440 and phone width; done last; Tailwind 4 waits for an owner decision on old browsers |
| Money | Stripe majors | Test mode, all runbook flows, explicit API version, widget tests unchanged, one release by itself |
| Phones | Expo patches | SDK-named versions only; EAS build and the README acceptance list before a store release |
| Unknowns | Production's PHP/Node version; whether `saas-app` is live | Phase 0 step 1; owner to confirm |

---

## 8. Progress

### 31 October 2026: phase 0 and phase 1 (owner: "start with Phase 0 and Phase 1, all suggestions okay")

**Phase 0, safety net**

- **Test baseline on the patched PHP builds.** The whole PHP suite passes on PHP 8.4.27 and 8.5.12 (both carry the
  October security fixes): 77 scopes, **7,249 passed, 16 skipped, 0 failed** (the last deploy's 7,245 plus the 4
  tests added today). Frontend: `tsc -b` clean, lint baseline passes, Vitest 399 files / 5,778 tests. On PostgreSQL
  18 (CI): 7,247 tests run, and the 33 failures are all in the documented groups (`tests/pgsql-known-failures.txt`).
- **Tests no longer depend on the developer's `.env`.** `phpunit.xml` now pins `APP_URL=http://localhost`. With a
  production-like `APP_URL` (as in `.env.example`, which CI starts from), 16 ChatGPT plugin tests failed.
- **CI** (`.github/workflows/ci.yml`): dependency audits; PHP 8.4 and 8.5 suites in three shards each; PHP 8.4 on
  PostgreSQL 18, failing only on a failure not in `tests/pgsql-known-failures.txt`; Larastan; the SPA on Node 22
  and 24. It runs on pushes to `main`, on pull requests and on demand, and never deploys. Actions are pinned by commit
  SHA. Scripts: `scripts/test-php.sh` (the suite by directory, with `SHARD=i/n`), `scripts/test-pg.sh` (optional
  JUnit output), `scripts/pg-known-failures.py`.
- **Static analysis.** Larastan 3.13 (PHPStan 2.3, level 5) with a baseline of the 2,182 findings present today, so
  only new findings fail. Rector 2.8 is set up for the PHPUnit 12 step (dry run: 9 test files). Most recorded
  findings are Eloquent properties without docblocks. Worth a later look: 27 `env()` calls outside `config/` in 10
  controllers and services, which return `null` if configuration is cached and the variable is not a real
  environment variable.
- **A real bug found by Larastan's first run:** `php artisan media:verify-version` could not start, because its
  `--version` option clashed with the console's own. So the media-recovery check in
  `docs/wallet-and-media-operations.md` could not be run. It now takes `--version-id`; the runbook and a new command
  test say so.
- **Screenshot comparison.** `frontend/e2e/visual-compare.mjs` compares two runs of the browser suite pixel by pixel
  (README "Visual comparison"). Two runs of the same build compare identical. One flaky check showed up:
  `mobile/overview` "More program summary uses live Overview detail" failed once in four runs.
- **Production's PHP and Node versions** are still to be read in Laravel Cloud (the cloud session cannot reach it).

**Phase 1, urgent security**

- **`saas-app`**: production npm advisories 47 → 0, the broken `master` build fixed, and credentials removed from the
  source. Details are in that repository's `docs/2026-10-31-stack-audit-and-upgrade-plan.md` "Progress". It is on its
  branch and still has to be merged and deployed. **The owner should change the production super admin's password if
  production was seeded with the old script.**
- **Root toolchain**: Vite 8.3.5, `laravel-vite-plugin` 3.2.0, axios 1.21.0; npm audit 8 → 0; `vite build` still works.
- **SPA**: ESLint 10. ESLint 10's new `no-useless-assignment` rule found 6 dead initialisers in 4 Content Planner
  files, recorded in the lint baseline. Production npm audit: 0.

**Phase 2 items done early (small, verified)**

- Content Planner images: no fallback to the shut-down `dall-e-3` (none unless `CONTENT_PLANNER_IMAGE_FALLBACK_MODEL`
  is set), and the error text names the real remedy. New `ImageFallbackTest`. **If Laravel Cloud sets
  `CONTENT_PLANNER_IMAGE_FALLBACK_MODEL=dall-e-3`, remove that variable.**
- `.env.example`: `ANTHROPIC_MODEL=claude-sonnet-5` (was the retired `claude-sonnet-4-20250514`).
- `composer.json`: `php ^8.4` (the lock already required 8.4.1).

---

## 9. Sources

- Packagist and npm registry metadata, read 31 Oct 2026 (versions, release dates, requirements).
- `composer audit` / `npm audit` on the lock files of both repositories and both app branches.
- PHP 8.4.27 / 8.5.12 security release: [php-src release php-8.4.27](https://github.com/php/php-src/releases/tag/php-8.4.27),
  [PHP Foundation announcement](https://discourse.thephp.foundation/t/php-php-8-4-27-released/6286),
  [php.watch PHP versions](https://php.watch/versions),
  [HeroDevs PHP end-of-life dates](https://www.herodevs.com/blog-posts/php-end-of-life-dates-support-timeline-for-every-version-2026).
- Laravel Cloud runtimes (PHP 8.2–8.5, 8.5 default): [cloud.laravel.com/docs/runtimes](https://cloud.laravel.com/docs/runtimes).
- Laravel release policy and Laravel 14 timing: [Laravel News release cycle](https://laravel-news.com/laravel-releases).
- PostgreSQL 19 status: [PostgreSQL roadmap](https://postgresql.org/developer/roadmap).
- Node.js schedule: [endoflife.ai Node 22](https://endoflife.ai/nodejs/22), [DevX on Node 26 LTS](https://www.devx.com/coding/nodejs-26-lts-new-features-release-date/).
- Next.js advisories: [CVE-2026-44575](https://advisories.gitlab.com/npm/next/CVE-2026-44575/),
  [CVE-2026-44574](https://advisories.gitlab.com/npm/next/CVE-2026-44574/),
  [Next.js middleware bypass, July 2026](https://feed.craftedsignal.io/briefs/2026-07-nextjs-middleware-bypass/).
- Auth.js status: [authjs.dev integrations](https://authjs.dev/getting-started/integrations),
  [Better Auth security update July 2026](https://better-auth.com/blog/security-update-july-2026).
- TypeScript 7: [InfoQ, TypeScript 7 released](https://infoq.com/news/2026/08/typescript-7-released/).
- OpenAI model shutdowns: [OpenAI deprecations](https://developers.openai.com/docs/deprecations),
  [DALL·E shutdown 12 May 2026](https://community.openai.com/t/deprecation-reminder-dall-e-will-be-shut-down-on-may-12-2026/1378754).
- spatie/laravel-permission: [v8 upgrading guide](https://spatie.be/docs/laravel-permission/v8/upgrading).
