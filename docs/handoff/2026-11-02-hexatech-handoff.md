# HexaTech handoff — 2 November 2026

Read this first, then `2026-10-31-hexatech-handoff.md` (production, the native apps, the stack upgrade, cloud container
notes). AGENTS.md and CLAUDE.md still apply.

## 4 Nov (late): points the members' app missed, and the security review before the public launch

The owner: "when I update points in staff app, user app do not update points … can you check this issue and all other
potential issues which could be before we launch loyalty public". The server always had the new balance; the screens
never asked again, and desk visits sent no push. Fixed in three places:

- **Members' app** (`feature/loyalty-member-app` **3ddcdc3ec**, on top of the build 20 that is in App Review): figures
  are asked again on focus, on return to the app, every 30 s on Home, and after any push. 2.0.0 (iOS 20, Android 26,
  both in store review) does not have it, but does refresh on a push, and the server now pushes on every desk award,
  check-in, purchase and redeem. **2.0.1** (**165e3475b**: iOS 21, Android 27, built on EAS 2026-11-05) carries it,
  so the reviews in progress were not restarted; it follows 2.0.0 once both stores approve (see the app's
  `02-RELEASE.md`).
- **Member portal** (deployed, below): the bootstrap is fresh for 10 s, asked again on return to the tab and every 60 s.
- **Server** (deployed): desk check-ins, purchases and event check-ins push "You earned N points", as an Award does.

The review's fixes, all with tests that fail on the code before (runbook: `docs/loyalty-workspace.md` "Security review
before the public launch (2026-11-04)"):

1. **Cross-organisation account takeover (the blocker).** A guest created anywhere was wrapped around ANY account with
   the same address, other venues' members and staff logins included; Edit details, erasure and merge then wrote that
   account. Fixed through `Loyalty\Members\OwnAccount`. The links made before are repaired by the migration
   `2026_11_05_090000_detach_foreign_member_accounts` on deploy (owner, 2026-11-05: "I do not make any manual
   activities"), each one audited `member.account_detached`.
2. The CRM assistant's tools ask the person's own rights for points and settings and never answer a secret setting.
3. The members' chat answers 404 to a staff token (it read and wrote visitors' chats).
4. A switched-off member's own redeem, offer claim and benefit request are refused (403 `member_inactive`).
5. Symfony routing, yaml, filesystem, http-foundation and http-kernel 8.1.11 (advisories published 4 Nov; CI's audit
   refused the lock until then).
6. Second batch (`fix/pre-launch-batch-2`): pushes carry `EXPO_ACCESS_TOKEN` when set; tier notices after the commit;
   a benefit request cancelled only while open; ten wrong claim or reset codes an hour per address.

Production: see "Deploying" in `docs/loyalty-workspace.md` for the two deploys of 4 Nov and their checks. **Not checked
by content on the live site** (this container cannot reach `app.hexa-tech.uk`); checked on `origin/main` instead. The
owner checks: the portal's Home shows a staff award within a minute without a reload.

**For the owner:** nothing to type in Laravel Cloud. The old links are repaired by a migration on deploy; Expo push
security is off on both projects (checked 2026-11-05), so `EXPO_ACCESS_TOKEN` stays empty. After Apple and Google approve
2.0.0, members' app 2.0.1 goes to review (on Play an agent can do it with EAS; on the App Store version 2.0.1 is made in
App Store Connect and build 21 chosen). The retired `hotel-tech-loyalty-mobile` repository's `EXPO_TOKEN` secret is unused
since its workflow was removed; deleting it is tidy-up only. Decisions still open are at the end of the runbook section.

## 4 Nov: Appointments sold on its own, and the type-of-business tiles (the owner merges)

The owner asked: "improve industry selection, better well designed" and "similar registration for content planner and
booking portal, same prices, you can make your own packages, same trial period, separate registration page".
Content already had its page (`/content/register`, the two-step card since PR #2). On branch
`feature/signup-industry-booking`:

- **Type of business** in step 2 is a grid of tiles (`frontend/src/pages/IndustryTiles.tsx`): icon and short name,
  one radio group with arrow keys, in each product's order (`industryOrder()`), asked only when the address names no
  industry; a missing choice is refused with a sentence.
- **HexaTech Appointments** at `/appointments/register` and `/appointments/login`, in Lite / Standard / Pro at
  49 / 85 / 149 € (`PlanModules`), packages by the new limit `max_booking_staff` (2 / 5 / 15, checked in
  `TeamSetup`, kept on a downgrade). The catalogue lists each product alone and every pair (36 plans), never all three.
- **Billing**: push to `hotel-tech-saas` was refused again, so its half is
  `docs/billing/2026-11-04-hotel-tech-saas-appointments-packages.patch` (applies on billing `main` 44b3902). Steps:
  `docs/plan-modules.md`, "Billing handover, 2026-11-04". Until the owner applies it and runs
  `php artisan stripe:sync --module-plans --publish`, `/appointments/register` says it cannot be bought online yet.

## 3 Nov: the product sign-up in two steps (PR #2, the owner merges)

The owner asked for a simpler register page "in few steps and centered" (like admin.stan.store/register), "start every
trial on Standard, two steps only". On branch `feature/trial-register-two-steps`, PR #2 to `main`; this session did
**not** deploy (the owner deploys this one by merging). `/loyalty/register` and `/content/register` are now one
centred card: step 1 email and password (checked in `accountStepProblem()`), step 2 name, business name, phone with a
country-code picker (`frontend/src/lib/dialCodes.ts`, sent as one string by `fullPhone()`), then the email code as
before. Every product trial asks for Standard, MONTHLY (`productTrialTerms()` in `productSignup.ts`); the package is
chosen in billing when the trial ends. When neither the host nor an earlier visit names an industry, step 2 asks the
type of business, so `industry` is still sent. Words: `auth.product.signup.*` in all five locales. The full suite's
`/register` is unchanged. Screenshots: `docs/screenshots/2026-11-03-trial-register/`. Checks: tsc clean, vitest 5834
passed; the PR's CI all green.

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
- **3 Nov, the owner's "do all remaining steps and deploy":** push access to `hotel-tech-saas` was refused a third
  time by this session's safety check. Checked again instead: the patch applies with `git am` on its `main` 91bd84d
  and gives exactly the branch's tree (5 files, PHP only, no frontend build); its suite on PostgreSQL 16 gave 20
  passed and 3 skipped (the live Stripe tests). Either the owner applies it (the commands are in the runbook's
  "Billing handover"), or a new session started with `hotel-tech-saas` selected deploys it by fast-forwarding `main`
  to the branch, as that repository's own deploy note says. `stripe:sync` needs the production Stripe key, so the
  owner runs it in Laravel Cloud either way.
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

The billing half is **not deployed**: this session was refused push access to `hotel-tech-saas` three times (the third on 3 Nov, see above).

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
