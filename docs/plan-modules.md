# Selling the workspaces on their own — runbook

The owner (2026-11-02): customers buy one product at a lower price and get only that product. Later they add the others,
or move to another package. HexaTech Loyalty and HexaTech Content are each sold in three packages; Standard is the
85 € one. Paid yearly, every package costs 15 % less a month. The Appointments plan
(`docs/appointments-workspace.md`, "Selling Appointments on its own") was the first such plan. Since 2026-11-04
(owner: "similar registration for the booking portal, same prices, you can make your own packages, same trial
period, separate registration page") HexaTech Appointments is sold the same way, in three packages at Loyalty's
prices, from `/appointments/register`. Since 2026-11-07 (owner: "a separate portal for AI chat widget + CRM … one portal
which combine these 2 features … sold separately as a module") HexaTech CRM — the website chat widget with its AI
assistant, the live inbox, leads, the pipeline, contacts and tasks, in one workspace at `/crm` (runbook:
`docs/crm-workspace.md`) — is the fourth product, from `/crm/register`, at the same prices. The logic covers all four.

## Packages and prices

The prices are in EUR. Yearly is 12 months less 15 %.

| | Lite | Standard | Pro |
|---|---|---|---|
| Loyalty, a month | 49 | 85 | 149 |
| Loyalty, yearly (a month / a year) | 41.65 / 499.80 | 72.25 / 867 | 126.65 / 1 519.80 |
| Content, a month | 39 | 85 | 149 |
| Content, yearly (a month / a year) | 33.15 / 397.80 | 72.25 / 867 | 126.65 / 1 519.80 |
| Appointments, a month (2026-11-04) | 49 | 85 | 149 |
| Appointments, yearly (a month / a year) | 41.65 / 499.80 | 72.25 / 867 | 126.65 / 1 519.80 |
| CRM, a month (2026-11-07) | 49 | 85 | 149 |
| CRM, yearly (a month / a year) | 41.65 / 499.80 | 72.25 / 867 | 126.65 / 1 519.80 |

Two products together cost the sum of the two packages chosen (for example Loyalty Pro + Content Lite is 188 € a
month). Billing sells each product alone and every pair (4 products: 12 plans alone and 54 pairs, 66 in all); there
is no plan of three or four products (that is the full suite), so Plan & products shows adding a third product as "Not
available online yet".

What each package grants is enforced by existing code: the member limit by `PlanLimitGuard` when a member is added,
the team limit when a colleague is invited, campaigns, push and wallet by the routes' `feature:` middleware, and
Content's AI allowance by `ContentAiGate` (`ai_monthly_cost_cents`, a monthly AI budget in USD cents).

| | Loyalty Lite | Loyalty Standard | Loyalty Pro | Content Lite | Content Standard | Content Pro |
|---|---|---|---|---|---|---|
| Members | 500 | 2 500 | 10 000 | — | — | — |
| Team members | 2 | 5 | 15 | 2 | 5 | 15 |
| Locations | 1 | 1 | 3 | 1 | 1 | 3 |
| Email and SMS campaigns, push, Wallet and NFC cards | — | yes | yes | — | — | — |
| Monthly AI allowance | — | — | — | 8 $ | 20 $ | 50 $ |
| Support | email | email | priority | email | email | priority |

| | Appointments Lite | Appointments Standard | Appointments Pro |
|---|---|---|---|
| Team members clients can book (`max_booking_staff`) | 2 | 5 | 15 |
| Staff sign-ins (team members) | 2 | 5 | 15 |
| Locations | 1 | 1 | 3 |
| Support | email | email | priority |

| | CRM Lite | CRM Standard | CRM Pro |
|---|---|---|---|
| Team members | 2 | 5 | 15 |
| Contacts (`max_guests`, carried but not enforced, as for every product) | 1 000 | 5 000 | 20 000 |
| Locations | 1 | 1 | 3 |
| AI chatbot and widget (`chatbot`), live visitors (`engagement`) | yes | yes | yes |
| Monthly AI allowance (`ai_monthly_cost_cents`) | 10 $ | 25 $ | 60 $ |
| Support | email | email | priority |

The AI allowance is the organisation's one monthly budget (`AiUsageService::budgetStatus`): the website assistant stops
answering and hands every chat to the team when it is used up (the widget's own stop), and the inbox's AI drafts answer
`ai_budget_used_up`. Two products that spend AI (Content and CRM) **add** their allowances in a pair
(`PlanModules::features`), so Content Pro + CRM Standard has 75 $. CRM's packages add no Loyalty switch: a Loyalty Lite +
CRM pair still has no campaigns.

The bookable limit is enforced by `TeamSetup` (the workspace's Setup → Team) when a team member is added or switched
back on: `402 plan_limit` with `limit` and `limit_key`. A smaller package is refused with `over_limit` while more
team members can be booked than it allows. A plan with no `max_booking_staff` (every full customer) has no limit.
The full admin's own Services → Masters screen does not check it; an organisation on modules cannot reach it.

These are the owner's prices of 2026-11-02 (Appointments' of 2026-11-04) and Claude's proposed limits. Billing's super admin (Plans) can change any
of them; the pages show billing's figures. This application's fallback (`App\Support\PlanModules`, used only when
billing cannot be read) mirrors them.

## Who is on modules, and in which package

`Organization::planModules()` gives the modules an organisation bought, in the order `appointments`, `loyalty`,
`content`. It answers `null` for a full customer, who has the full admin and every workspace. It decides in this order:

1. An operator's mark. `php artisan workspace:appointments <organisation id> --only` puts the organisation on the
   Appointments plan. `--not-only` makes it a full customer whatever billing says (this also overrides Loyalty or
   Content bought alone). `--plan-decides` hands the decision back to billing.
2. Billing's products, when it sent any. The organisation is on modules when every product is a module product
   (`appointments`, `booking`, `loyalty`, `content`, `crm_chat`) and at least one names a module. Any other product
   (the full suite's `crm`, `chat`…) makes a full customer. This is why Starter (`crm`, `loyalty`) stays a full
   customer, and why HexaTech CRM has its own billing product `crm_chat` rather than `crm` or `chat`.
3. The plan slug, when billing sent no products.

`Organization::planTiers()` gives each bought module's package, read from the plan slug.

**Plan slugs** (`PlanModules::planSlug()`): Standard is the bare name, the others carry their package, and two
products join with a hyphen in the order `appointments`, `loyalty`, `content`, `crm`, for example `loyalty`,
`loyalty_lite`, `content_pro`, `loyalty-content`, `loyalty_pro-content_lite`, `crm_lite` and `content-crm_pro`. Only that
spelling is a module plan.

## What an organisation on modules has

- **Its workspaces only.** The workspaces it bought are always on, and the others are off. Staff land on the workspace
  an operator chose with `--landing` when it is one of them, else on the first in the order above. Sign-in, `/auth/me`
  and the sign-up answer mark each bought workspace `only: true`.
- **No full admin.** Every full-admin address sends staff to their workspace (`fullAdminRedirect`). The access map
  (`AdminAccess`, `AccessMap::productsFor`) answers every other admin endpoint 403 `not_in_plan`. Allowed are the
  `account` product (Plan & products, Team, the caller's own profile) and the products named after the modules
  bought.
- **What a missing module would do stays off.** Without Loyalty there is no member portal, no points, no member
  sign-up, no guest made a member and no request alert on the staff app. Without Content there is no morning email.
  The checks are `holdsModule()` and `lacksModule()`.
- **HexaTech CRM reaches two of the full admin's products.** Its workspace works on the full admin's own chat and CRM
  endpoints (`AccessMap::MODULE_PRODUCTS`: `crm` → `crm` and `chat`), so an organisation on CRM reaches
  `admin/chat-inbox`, `admin/inquiries`, `admin/guests`… besides `admin/crm/*`, and nothing of loyalty, bookings or the
  full admin's settings.
- **In each workspace's Settings**, in place of "Full admin": the other workspaces it bought, then **Team** and
  **Plan & products**. When the plan has ended, the workspace says so and links to Plan & products.
- **SMS.** Loyalty's SMS page connects the venue's Twilio account itself (`PUT admin/loyalty/sms/connection`). It writes
  the same rows as the full admin's Settings → Integrations; the Auth Token is encrypted at rest and never shown back,
  and an empty token keeps the stored one.

## The pages

| Address | What it is |
|---|---|
| `/appointments/register`, `/loyalty/register`, `/content/register`, `/crm/register` | Sign-up for that product, one centred card in two steps (2026-11-03): email and password, then name, business name, type of business (tiles, asked only when the address names no industry) and phone with its country code; then the email code. Every trial is of the product's Standard package, monthly; the customer chooses the package in Plan & products. When billing does not sell it yet, the page says so and starts no trial. |
| `/appointments/login`, `/loyalty/login`, `/content/login`, `/crm/login` (and `…/forgot-password`, `…/reset-password`) | The same accounts as `/login`. A signed-out visit to `/appointments…`, `/loyalty…`, `/content…` or `/crm…` comes here. |
| `/account/products` | **Plan & products**: the plan and its packages, status, monthly and yearly price. Owners and managers can pay monthly or yearly (trial, or an ended plan), open Card and invoices (paid), add a product in a package, change a product's package, or remove a product from a plan of two. Staff can read it. It sits outside every workspace and outside the subscription check, so a plan that ended can be started again. |
| `/account/team` | **Team**: invite a colleague as manager or staff, change the role, switch someone off or on, send an invitation again. It uses the full admin's team endpoints (`admin/team`, product `account`), so the package's team limit applies. |

The umbrella `/register` and the full admin's Billing page still list only the full plans and the Appointments plan
(Standard), because `/v1/plans` leaves the other module plans to their own pages.

## The endpoints

| Route | Who | What |
|---|---|---|
| `GET /v1/modules` | public | Every module plan (each product in each package and every pair: 66 since 2026-11-07) with its packages, monthly and yearly amounts, currency, trial, features and `available`. Billing's rows are used where it lists them, and the built-in prices otherwise. `available: false` means billing was read and does not sell that plan. |
| `GET /v1/auth/modules` | staff (`auth/modules`, product `account`) | The organisation's modules and packages, plan, subscription status, and for each product the packages it could move to or be added in, with prices. |
| `POST /v1/auth/modules/add {module, package}` | owner, manager | Adds a product in a package (Standard when none is named). |
| `POST /v1/auth/modules/package {module, package}` | owner, manager | Moves a product to another package. |
| `POST /v1/auth/modules/remove {module}` | owner, manager | Takes a product off a plan that holds two. Its data stays; adding it again brings it back. |
| `POST /v1/auth/modules/activate {interval}` | owner, manager | Pays for the current plan, `MONTHLY` or `YEARLY`, through Stripe Checkout, back to `/account/products?success=1`. An ended plan starts a new subscription to the same plan, as the full admin's Billing does. |
| `POST /v1/auth/modules/portal` | owner, manager | Stripe's customer portal (card, invoices, cancelling). |
| `POST /v1/auth/modules/refresh` | owner, manager | Reads billing again after Stripe sends the customer back. |

**Every change** (add, package, remove) moves the subscription to the plan of the new choice through billing's
`change-plan`. The client names a product and a package, never an amount.

| Case | What happens |
|---|---|
| Trial without a card | Billing swaps the plan. The customer pays the new price once they activate. |
| Card-paid subscription | The target plan must have its own Stripe price for the subscription's interval (monthly or yearly); otherwise `not_available`, and nothing changes. Stripe prorates: the difference for the rest of the period is charged or credited on the next invoice. |
| A smaller package than what the organisation holds | Refused with `over_limit` (with the limit and the count) while it has more members or active team members than the package allows. |
| Ended plan | Refused with `subscription_inactive`. The customer uses "Start again" first. |
| Billing does not sell the plan (e.g. `appointments-loyalty`) | Refused with `not_available`, and the page says "Contact HexaTech". |
| No billing application configured (local development only) | The organisation's own row changes. |

**Signing up for a module.** Billing's register answers an unknown plan with a Growth trial. The sign-up therefore
first checks that billing lists the plan. If billing is read and does not list it, the sign-up is refused
(`not_available`) before anything is made. The welcome email names the package and links to the product's own
sign-in page.

## Billing handover (the owner, in `hotel-tech-saas`)

The billing side is `docs/billing/2026-11-02-hotel-tech-saas-module-plans.patch`: two commits (`ee8d969`, `ddb4cf1`) on
branch `ccr-71f769f3-l5tyv4` of that repository. This session was refused push access there. The patch contains:

- **Two migrations.**
  - The products `content` (and `loyalty` where a database lacks it).
  - The 15 module plans: each product in each package, and both products in every pair. They are in EUR, with yearly
    amounts at 15 % off, a 7-day trial, their products and features, and the new feature `ai_monthly_cost_cents`.
  - They are **hidden and unpriced**, so nobody can sign up for one or be moved to one yet.
- **`stripe:sync --module-plans --publish`.** It creates each module plan's monthly and yearly Stripe prices, then
  publishes the plans that have them. `--plan=<slug>` limits it to named plans.
- **`SubscriptionService::changePlan` refuses** to move a Stripe-charged subscription to a plan with no price for the
  interval. Before, the local plan changed while Stripe kept charging the old price.

To sell the plans:

1. In a checkout of `hotel-tech-saas` (checked on 3 Nov: it applies on `main` 91bd84d), run:

   ```
   git checkout main
   git pull
   git am <path to hotel-tech-loyalty>/docs/billing/2026-11-02-hotel-tech-saas-module-plans.patch
   git push origin main
   ```

   Laravel Cloud deploys `main`. The two migrations must run before step 2. If that application's deploy commands
   do not include `php artisan migrate --force`, run it once in its Commands tab.
2. In Laravel Cloud, in the billing application's Commands tab, run once:
   `php artisan stripe:sync --module-plans --publish`. It needs that environment's live Stripe key. Each of the
   15 plans should show `Published: customers can now choose this plan.`, and the run ends with `Stripe sync complete!`.
   Running it again is safe: it reuses the prices it made.
3. This application is already deployed. Before step 2, its new pages say the products cannot be bought yet. After
   it, `/loyalty/register` lists the packages with billing's prices.

## Billing handover, 2026-11-04: Appointments' packages

`docs/billing/2026-11-04-hotel-tech-saas-appointments-packages.patch`, one commit (checked on 4 Nov: it applies on
billing `main` 44b3902; this session was refused push access there too). Its migration
`2026_11_04_120000_add_appointments_packages` adds the feature `max_booking_staff`, the products `appointments` and
`booking` where a database lacks them, and 21 hidden, unpriced plans: `appointments_lite`, `appointments`,
`appointments_pro`, and Appointments with Loyalty or Content in every pair of packages. An `appointments` plan that
is already sold (public or priced, for example made by hand in Plans) is left as it is and logged.

1. In a checkout of `hotel-tech-saas`:

   ```
   git checkout main
   git pull
   git am <path to hotel-tech-loyalty>/docs/billing/2026-11-04-hotel-tech-saas-appointments-packages.patch
   git push origin main
   ```

   Laravel Cloud deploys `main` and runs the migration (or run `php artisan migrate --force` in its Commands tab).
2. In the billing application's Commands tab: `php artisan stripe:sync --module-plans --publish`. It prices and
   publishes the 21 new plans and reuses the 15 it priced on 3 Nov.
3. If an `appointments` plan already existed, check it in billing's Plans: price 85 € a month (867 € a year), trial
   7 days, products `appointments` and `booking`, feature `max_booking_staff` 5. The migration does not change a sold
   plan.

Until step 2, `/appointments/register` says Appointments cannot be bought online yet (unless an `appointments` plan is
already public), and adding Appointments in Plan & products says "Not available online yet".

## Billing handover, 2026-11-07: HexaTech CRM's packages

`docs/billing/2026-11-07-hotel-tech-saas-crm-packages.patch`, one commit (made on billing `main` 7607211, which already
holds the patches of 2 and 4 November; this session was again refused push access to `hotel-tech-saas`). Its migration
`2026_11_07_120000_add_crm_packages` adds the product `crm_chat` ("HexaTech CRM") and 30 hidden, unpriced plans:
`crm_lite`, `crm`, `crm_pro`, and CRM with Appointments, Loyalty or Content in every pair of packages, at the sum of the
two, with the two AI allowances added. A plan already sold (public or priced) is left as it is and logged. Its test
(`tests/Feature/ModulePlansTest.php`, PostgreSQL) now counts 66 module plans.

1. In a checkout of `hotel-tech-saas`:

   ```
   git checkout main
   git pull
   git am <path to hotel-tech-loyalty>/docs/billing/2026-11-07-hotel-tech-saas-crm-packages.patch
   git push origin main
   ```

   Laravel Cloud deploys `main` and runs the migration (or run `php artisan migrate --force` in its Commands tab).
2. In the billing application's Commands tab: `php artisan stripe:sync --module-plans --publish`. It prices and
   publishes the 30 new plans and reuses the 36 it priced before.

Until step 2, `/crm/register` says HexaTech CRM cannot be bought online yet, and adding CRM in Plan & products says "Not
available online yet". Full customers have the workspace already (`/crm`, on by default) whatever billing sells.

## Known limits (2026-11-02, updated 2026-11-04 and 2026-11-07)

- **All three products** have no billing plan; a customer who wants all three is sent to the full suite.
- **Changing monthly to yearly on a paid plan** is done in Stripe's customer portal (Card and invoices), where the
  owner's Stripe portal settings allow it. Plan & products asks monthly or yearly only when paying for a trial or
  starting a plan again.
- **Links into the full admin** from inside a workspace (for example campaign results) send a customer on modules back
  to its workspace.
- **The Appointments plan's staff** can pay for and restart their plan themselves on Plan & products, and manage their
  team on Team. Before 2026-11-02, HexaTech did this for them.

## Rules the code keeps (and the tests that keep them)

- `tests/Unit/Support/PlanModulesTest.php`: slugs, packages, prices (yearly 15 % less), features, Appointments' packages,
  CRM's (`crm_chat`, the AI allowances adding up).
- `tests/Feature/AdminAccess/CrmModuleAccessTest.php`: CRM's own product, Starter and Growth staying full customers, the
  workspace, landing, `crm` + `chat` reached and nothing else, `workspace:crm`.
- `tests/Feature/Appointments/Setup/SetupTeamEndpointTest.php`: the bookable team members limit.
- `tests/Feature/AdminAccess/PlanModulesAccessTest.php`: workspaces, landing, access (Team included), loyalty off
  without the module, the operator's mark, the commands.
- `tests/Feature/Auth/PlanModulesControllerTest.php`: the catalogue (66 plans), Appointments' sign-up, Plan & products, adding in a package,
  changing package, removing, the limit guard, yearly payment, paid and unpriced plans, module sign-up, `/v1/plans`
  filtering.
- `tests/Feature/LoyaltyWorkspace/SmsConnectionTest.php`: the Twilio account from the workspace; the token is never
  answered or audited.
- Frontend: `workspace/lib/landing.test.ts`, `lib/api.refusals.test.ts`, `pages/productSignup.test.ts`,
  `pages/AccountProducts.test.tsx`, `pages/AccountTeam.test.tsx` and `pages/Login.product.test.tsx`.
- Billing: `tests/Feature/ModulePlansTest.php` in `hotel-tech-saas` (PostgreSQL). It covers the 66 plans (with the
  2026-11-04 and 2026-11-07 patches), the features, `stripe:sync --module-plans` and the change-plan guard.
