# HexaTech handoff — 2 November 2026

Read this first, then `2026-10-31-hexatech-handoff.md` (production, the native apps, the stack upgrade, cloud container
notes). AGENTS.md and CLAUDE.md still apply.

## Second round (2 Nov, late): packages, yearly, Team, SMS

The owner asked: "make yearly plan 15% cheaper per month, and make 3 packages with different features and members …
we can make this price as standard and make one cheaper option and one expensive. And do all your recommendations and
next steps". The runbook `docs/plan-modules.md` was rewritten for it; the prices and limits are its first two tables.

- **Packages.** Loyalty Lite 49 €, Standard 85 €, Pro 149 €; Content Lite 39 €, Standard 85 €, Pro 149 € a month.
  Yearly is 12 months less 15 % (`PlanModules::yearlyAmount()`). Limits (members, team, locations), campaigns, push,
  Wallet/NFC and Content's monthly AI allowance (`ai_monthly_cost_cents`) are enforced by code that already existed
  (`PlanLimitGuard`, `feature:` middleware, `ContentAiGate`). The limits are Claude's proposal for the owner to confirm.
- **Plan slugs.** Standard is the bare name, the others `module_tier`, pairs joined by `-`
  (`loyalty_pro-content_lite`). 15 module plans in all.
- **This application** (branch commits `ae44145`, `5fa48f5`, `70683d9`):
  - sign-up pages pick a package, monthly or yearly; Plan & products changes a package, removes a product from a
    plan of two, pays monthly or yearly; a smaller package is refused while the organisation is over its limits
    (`over_limit`);
  - `/account/team` (Team) for organisations on modules, on the full admin's team endpoints (AccessMap `admin/team`
    is now product `account`);
  - Loyalty's SMS page connects the venue's Twilio account (`PUT admin/loyalty/sms/connection`), token encrypted,
    never answered or audited;
  - CI's PostgreSQL red fixed: the 4 `ContactsFeedTest` tests are in `tests/pgsql-known-failures.txt` with their
    reason in `docs/loyalty-workspace.md`.
- **Billing** (`hotel-tech-saas`, local branch, still not pushed): a second commit `ddb4cf1` with migration
  `2026_11_02_130000_add_module_packages` (the 15 plans, hidden and unpriced, the feature rows) and
  `stripe:sync --module-plans`. The patch file `docs/billing/2026-11-02-hotel-tech-saas-module-plans.patch` now holds
  both commits; `git am` applies them on `main` (checked). Its `tests/Feature/ModulePlansTest.php`: 20 passed, 3 live
  Stripe tests skipped.
- **To go live (owner):** apply and deploy the billing patch, then run once there
  `php artisan stripe:sync --module-plans --publish`. That replaces the first round's `--plan=…` step.
- **Still not built:** combinations with Appointments (billing plans and an Appointments price needed); switching a
  paid plan between monthly and yearly is left to Stripe's customer portal.

## Production

Latest: **94e8c73** (3 Nov, just after midnight UTC): the second round above. It is source patch **976ed84** (this
branch at f62d526 on `main` 05ffcc8; 54 files, 5 added, 49 changed, no deletions, no migration) plus its SPA build.
Before the push: the whole tree, builds aside, equal to the branch at f62d526; on the artifact, `tsc -b`, 403 Vitest
files and 5827 tests passed; the scoped PHP suite gave 7331 passed, 23 skipped, 39 failed, the same 39 test names as on
the branch (this container's missing extensions). The baseline after it was **f62d526** (superseded below).

**Not checked by content** (this container cannot reach `app.hexa-tech.uk`). The owner checks:
- the live admin bundle (`https://app.hexa-tech.uk/` → `/spa/assets/index-*.js`) has `Choose your package` (in no earlier bundle);
- `https://app.hexa-tech.uk/loyalty/register` shows three packages (Lite, Standard, Pro) and a Monthly/Yearly switch.

CI on 94e8c73 (run 33): green on all three SQLite shards, both SPA jobs, Larastan and the audit. On PostgreSQL 7375
tests ran, and the 4 `ContactsFeedTest` failures are now known ones. One new failure, unrelated to this round:
`NotificationCampaignPushTest::test_cancellation_during_delivery_stops_new_claims_without_losing_the_completed_count`.
`SendNotificationCampaignChunk` read its members with an unordered `whereIn`, and PostgreSQL returns those in page
order, which after a long run of rolled-back tests need not be id order. The test assumes the first member goes first.
With the job reading `orderByDesc('id')` the test fails every time, so the cause is confirmed. The fix is `orderBy('id')`,
as `SendEmailCampaignChunk` already does; `tests/Feature/Mail` passes on PostgreSQL 16 and SQLite (127 each).

That fix went out as **f766fb7** (source only; the fresh SPA build was identical to 94e8c73's). CI run 34 on it is
**green on every job, PostgreSQL included**, after runs 31 to 33 were red. The next source-patch baseline is
**f86b53c**.

Previous: **05ffcc8** (2 Nov evening, the owner's "deploy for me"): the plan modules below. It is source patch
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

CI on 05ffcc8 (run 32): green on all three SQLite shards, both SPA jobs, Larastan and the audit. On PostgreSQL 7365
tests ran (29 more than on 3618ead); every new one passes. The only failures are the same 4 `ContactsFeedTest` ones.

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
- **Assumptions to confirm (owner)** (the second round above replaced yearly, the packages and their limits; removing
  a product, Team and SMS are built now):
  - "Loyalty + Content" at the sum of the two packages (170 € for two Standards);
  - Appointments-plan staff may now pay for and restart their plan on Plan & products;
  - a signed-out visit to `/loyalty…` or `/content…` now shows that product's own sign-in page.
- **Not built (runbook, "Known limits"):** combinations with Appointments (they need billing plans).

## Checks run (2 Nov, this container)

Second round, on the branch at `70683d9`: the scoped PHP suite 7331 passed, 23 skipped, 39 failed (the same environment
scopes and counts as the base: Admin 2, Appointments 7, Crm 4, LoyaltyWorkspace 9, Settings 7, Wallet 2, Unit/Services
8); Larastan no errors; `tsc -b` clean; Vitest 403 files, 5827 tests passed; lint passes against the baseline;
screenshots of the package picker, Plan & products and Team at 1440 and 390.

First round:

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
