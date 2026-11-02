# HexaTech handoff — 2 November 2026

Read this first, then `2026-10-31-hexatech-handoff.md` (production, the native apps, the stack upgrade, cloud container
notes). AGENTS.md and CLAUDE.md still apply.

## Production

Latest: **05ffcc8** (2 Nov evening, the owner's "deploy for me"): the plan modules below. It is source patch
**1b3949a** (this branch at 7f5baf1 on `main` 3618ead; 64 files, no deletions, no migration) plus its SPA build.
Before the push: tree parity with the branch; on the artifact, `tsc -b`, 402 Vitest files and 5818 tests passed;
the scoped PHP suite gave 7321 passed, 23 skipped and 39 failed, which are this container's environment failures and
the same as on `main`. The next source-patch baseline is **7f5baf1**.

**Not checked by content:** this container cannot reach `app.hexa-tech.uk`. The owner should check two things: the
live admin bundle (`https://app.hexa-tech.uk/` → `/spa/assets/index-*.js`) has a string only the new source has (e.g.
`Plan & products`), and `https://app.hexa-tech.uk/loyalty/register` shows "Start your HexaTech Loyalty trial". Until
billing publishes the plans, that page says the product cannot be bought online yet: this is expected.

**CI on `main` was red before this deploy, and the cause is unrelated.** On 3618ead, four
`Tests\Feature\Integration\ContactsFeedTest` tests fail on PostgreSQL. They assert the SQLite `:memory:` database and
are missing from `tests/pgsql-known-failures.txt`. The fix: list them there with their reason in
`docs/loyalty-workspace.md`, or let the test skip on PostgreSQL.

The billing half is **not deployed**: this session was refused push access to `hotel-tech-saas` twice.

## New: HexaTech Loyalty and Content sold on their own (owner, 2 Nov)

The owner asked for this: "customers can buy only one product by cheaper price and get access only to this feature,
later they can add additional products". The price is 85 €/month per product, with Loyalty and the social media
planner (Content) each on its own registration page, like app.hexa-tech.uk's, and each customer reaching only their
own workspace. The runbook is `docs/plan-modules.md`.

- **This application.** It is on branch `ccr-71f769f3-l5tyv4` (pushed). It contains:
  - `App\Support\PlanModules`;
  - `Organization::planModules()`, which generalises the Appointments plan;
  - the access map for modules;
  - `PlanModulesController` (`/v1/modules`, `/v1/auth/modules/*`);
  - the moved SaaS helpers in `App\Services\Billing\SaasBilling`;
  - the sign-up guard and workspaces in the sign-up answer;
  - the pages `/loyalty/login|register`, `/content/login|register` and `/account/products` (Plan & products);
  - workspace Settings links;
  - five locales.
- **The billing application** (`hotel-tech-saas`). It is commit `ee8d969` on a local branch `ccr-71f769f3-l5tyv4`. It
  is **not pushed**: this session's safety check refused push access to that repository. The same commit is kept as
  `docs/billing/2026-11-02-hotel-tech-saas-module-plans.patch` (`git am` it from `hotel-tech-saas` `main`). It
  contains:
  - a migration for the plans `loyalty`, `content` and `loyalty-content` (EUR 8 500 / 8 500 / 17 000 a month, hidden
    and unpriced until published) and the product `content`;
  - `stripe:sync --plan=… --publish`;
  - `changePlan` refusing a Stripe-charged move to an unpriced plan.
- **To go live (owner):**
  1. Apply and deploy the billing patch.
  2. Run `php artisan stripe:sync --plan=loyalty --plan=content --plan=loyalty-content --publish` there.
  3. ~~Deploy this branch~~: done, `main` = 05ffcc8 (above). For the record, the file list was this branch's commits since
     `origin/main` `3618ead`; there is no migration on this side.
  Until step 2, the new sign-up pages say the product cannot be bought online yet.
- **Assumptions to confirm (owner):**
  - monthly billing only (no yearly price);
  - the plans' features and limits (runbook, "Billing handover");
  - "Loyalty + Content" at 170 €;
  - Appointments-plan staff may now pay for and restart their plan on Plan & products;
  - a signed-out visit to `/loyalty…` or `/content…` now shows that product's own sign-in page.
- **Not built (runbook, "Known limits"):**
  - removing a product online;
  - combinations with Appointments (they need billing plans);
  - team invitations and SMS setup in the workspaces (still full admin only).

## Checks run (2 Nov, this container)

- **PHP 8.5.12** (official `php:8.5-cli` image through Docker), with this application's scoped suite (`scripts/test-php.sh`):
  - every new test passes;
  - 7321 passed, 23 skipped, 39 failed: the same 39 fail on the untouched base. Each needs an extension the image lacks: GD (images), zip
    (xlsx exports), intl (money formatting in `DepositMessageTest`). On the workstation's WAMP PHP these pass.
- **Larastan:** no errors.
- **Frontend:**
  - `npx tsc -b` is clean;
  - `npx vitest run`: 402 files, 5818 tests passed;
  - `npm run lint` passes against the baseline;
  - Chromium screenshots against mocked answers, at 1440 and 390: `/loyalty/register`, `/loyalty/login`,
    `/content/register`, `/account/products` (with the add confirmation), and the Loyalty workspace with an ended plan.
- **Billing application on PostgreSQL 16:** 19 passed, 3 skipped (the live Stripe tests need `STRIPE_TEST_SECRET`).

## Cloud container notes (new)

- **Docker.** Start the daemon with `dockerd &`. `mirror.gcr.io/library/php:8.5-cli` gives PHP 8.5.12 without
  gd/zip/intl/pdo_pgsql. Debian's package mirror is blocked.
- **pdo_pgsql.** It was built in that image from:
  - the host's `libpq.so.5.16`;
  - three headers fetched by a sparse git checkout of `postgres/postgres` `REL_16_STABLE`: `libpq-fe.h`,
    `postgres_ext.h` and `libpq/libpq-fs.h`;
  - a hand-written `pg_config_ext.h` (`#define PG_INT64_TYPE long int`).

  Then `docker-php-ext-configure pdo_pgsql --with-pdo-pgsql=<dir>` and `docker commit`.
- **PostgreSQL 16** is installed: `pg_ctlcluster 16 main start`.
- **Composer.** Install with the host's PHP 8.3 and `--ignore-platform-reqs`, after pre-filling the cache from shallow
  git fetches (as on 31 Oct). `phpstan/phpstan` has no `source` in the lock: fetch `github.com/phpstan/phpstan` at
  its dist reference.
